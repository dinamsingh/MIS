import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  activeAssignments,
  isStaleAssignment,
  type AssignmentWithContext,
  type BatchState,
} from './teacherAssignmentService';

describe('isStaleAssignment', () => {
  it('is false when the batch is not found', () => {
    const assignment: AssignmentWithContext = { assignmentId: 'a1', batchId: 'missing', subjectSem: 3 };
    expect(isStaleAssignment(assignment, [])).toBe(false);
  });

  it('is false when the subject sem equals the batch current sem', () => {
    const assignment: AssignmentWithContext = { assignmentId: 'a1', batchId: 'b1', subjectSem: 3 };
    const batches: BatchState[] = [{ batchId: 'b1', currentSem: 3 }];
    expect(isStaleAssignment(assignment, batches)).toBe(false);
  });

  it('is true when the subject sem is strictly behind the batch current sem', () => {
    const assignment: AssignmentWithContext = { assignmentId: 'a1', batchId: 'b1', subjectSem: 3 };
    const batches: BatchState[] = [{ batchId: 'b1', currentSem: 4 }];
    expect(isStaleAssignment(assignment, batches)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A batch id drawn from a small fixed pool, so collisions/matches happen often. */
const batchIdArb = fc.constantFrom('batch-1', 'batch-2', 'batch-3');

const semArb = fc.integer({ min: 1, max: 8 });

const batchStateArb: fc.Arbitrary<BatchState> = fc.record({
  batchId: batchIdArb,
  currentSem: semArb,
});

/** Distinct-by-batchId batch lists (a real `batches` table has one row per id). */
const batchStatesArb: fc.Arbitrary<BatchState[]> = fc
  .uniqueArray(batchStateArb, { selector: (b) => b.batchId })
  .filter((batches) => batches.length > 0);

const assignmentArb: fc.Arbitrary<AssignmentWithContext> = fc.record({
  assignmentId: fc.uuid(),
  batchId: batchIdArb,
  subjectSem: semArb,
});

/**
 * **Validates: Requirements 11.1, 11.2**
 * Property 23: Stale-assignment derivation is correct and exclusion-consistent.
 * For generated batch promotions and pre-existing assignments tied to that
 * batch, an assignment is derived stale if and only if its subject's `sem`
 * is strictly less than the batch's post-promotion `currentSem`, and
 * `activeAssignments` excludes exactly the assignments this predicate marks
 * stale.
 */
describe('Property 23: stale-assignment derivation is correct and exclusion-consistent', () => {
  it('isStaleAssignment matches the subjectSem < batch.currentSem definition exactly', () => {
    fc.assert(
      fc.property(assignmentArb, batchStatesArb, (assignment, batches) => {
        const batch = batches.find((b) => b.batchId === assignment.batchId);
        const expected = batch !== undefined && assignment.subjectSem < batch.currentSem;
        expect(isStaleAssignment(assignment, batches)).toBe(expected);
      }),
    );
  });

  it('activeAssignments excludes exactly the assignments isStaleAssignment marks stale', () => {
    fc.assert(
      fc.property(fc.array(assignmentArb, { maxLength: 20 }), batchStatesArb, (assignments, batches) => {
        const active = activeAssignments(assignments, batches);
        const expectedActiveIds = new Set(
          assignments.filter((a) => !isStaleAssignment(a, batches)).map((a) => a.assignmentId),
        );
        expect(new Set(active.map((a) => a.assignmentId))).toEqual(expectedActiveIds);
        // Every stale assignment must be absent from the active list.
        for (const a of assignments) {
          if (isStaleAssignment(a, batches)) {
            expect(active.some((x) => x.assignmentId === a.assignmentId)).toBe(false);
          } else {
            expect(active.some((x) => x.assignmentId === a.assignmentId)).toBe(true);
          }
        }
      }),
    );
  });
});

/**
 * **Validates: Requirements 11.3**
 * Property 24: Promotion-triggered staleness is isolated per batch.
 * For generated sets of assignments spanning multiple distinct batches,
 * promoting/changing one batch's `currentSem` only changes the derived
 * staleness of assignments whose `batchId` matches that batch — assignments
 * on any other batch are provably unaffected.
 */
describe('Property 24: promotion-triggered staleness is isolated per batch', () => {
  it('changing one batch currentSem never changes staleness of assignments on other batches', () => {
    fc.assert(
      fc.property(
        fc.array(assignmentArb, { minLength: 1, maxLength: 20 }),
        batchStatesArb,
        batchIdArb,
        semArb,
        (assignments, batches, promotedBatchId, newSem) => {
          const before = new Map(assignments.map((a) => [a.assignmentId, isStaleAssignment(a, batches)]));

          const promotedBatches = batches.map((b) =>
            b.batchId === promotedBatchId ? { ...b, currentSem: newSem } : b,
          );

          for (const a of assignments) {
            const staleAfter = isStaleAssignment(a, promotedBatches);
            if (a.batchId !== promotedBatchId) {
              // Untouched batch's row is unchanged -> staleness must be unchanged.
              expect(staleAfter).toBe(before.get(a.assignmentId));
            }
          }
        },
      ),
    );
  });
});

/**
 * **Validates: Requirements 11.6**
 * Property: for generated historical data scenarios (assignments whose batch
 * has since been promoted or graduated), `isStaleAssignment`/
 * `activeAssignments` never delete, mutate, or otherwise touch the
 * underlying assignment records — they only ever filter/classify, and the
 * exact same input assignment list is returned as either included-or-
 * excluded, never altered in shape or content.
 */
describe('historical-data preservation: derivation never mutates or deletes records', () => {
  it('activeAssignments only filters — every returned item is a reference from the input, unmodified', () => {
    fc.assert(
      fc.property(fc.array(assignmentArb, { maxLength: 20 }), batchStatesArb, (assignments, batches) => {
        const snapshotBefore = assignments.map((a) => ({ ...a }));

        const active = activeAssignments(assignments, batches);

        // The input array itself is untouched (same length, same content, same order).
        expect(assignments).toEqual(snapshotBefore);
        expect(assignments.length).toBe(snapshotBefore.length);

        // Every element returned by activeAssignments is === (identical reference)
        // to an element of the original input — nothing was cloned or mutated.
        for (const a of active) {
          expect(assignments).toContain(a);
        }

        // The active list is always a subset (by reference) of the input list.
        expect(active.length).toBeLessThanOrEqual(assignments.length);
        for (const a of active) {
          expect(assignments.includes(a)).toBe(true);
        }
      }),
    );
  });

  it('isStaleAssignment never mutates the assignment or batches it is given', () => {
    fc.assert(
      fc.property(assignmentArb, batchStatesArb, (assignment, batches) => {
        const assignmentSnapshot = { ...assignment };
        const batchesSnapshot = batches.map((b) => ({ ...b }));

        isStaleAssignment(assignment, batches);

        expect(assignment).toEqual(assignmentSnapshot);
        expect(batches).toEqual(batchesSnapshot);
      }),
    );
  });
});
