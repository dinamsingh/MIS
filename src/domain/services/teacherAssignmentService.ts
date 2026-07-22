/**
 * Stale-assignment derivation — pure, never stored.
 *
 * A `teacher_assignments` row can become "stale" once its batch is promoted
 * past the semester the assignment was made for. Rather than storing a
 * `stale` boolean on the row (which could drift out of sync with
 * `batches.current_sem` — e.g. if the flag update were ever missed, or a
 * batch were somehow demoted), staleness is derived at read time from two
 * already-authoritative, live-read facts:
 *  - the assignment's subject's `sem` (from `syllabus_subjects.sem`)
 *  - the assignment's batch's CURRENT `current_sem` (from `batches`)
 *
 * Because this is a pure function with no side effects and no cache, nothing
 * can ever drift out of sync, and historical data (`attendance`,
 * `mark_values`, `quiz_attempts`, and the `teacher_assignments` row itself)
 * is never touched, mutated, or deleted by this derivation
 * (Requirements 11.1, 11.6).
 */

/** The minimal shape of a Teacher_Assignment needed to derive staleness. */
export interface AssignmentWithContext {
  readonly assignmentId: string;
  readonly batchId: string;
  readonly subjectSem: number;
}

/** The minimal shape of a Batch needed to derive staleness. */
export interface BatchState {
  readonly batchId: string;
  readonly currentSem: number;
}

/**
 * A Teacher_Assignment is stale when its subject's semester is strictly
 * behind its batch's CURRENT semester — i.e. the batch has been promoted
 * past the semester this assignment was made for (Requirement 11.1).
 * Purely derived: no stored flag, so promotion never needs a second write to
 * "mark" assignments stale, and there is nothing that can drift out of sync
 * (Requirement 11.6 — historical data is never touched by this derivation).
 */
export function isStaleAssignment(
  assignment: AssignmentWithContext,
  batches: readonly BatchState[],
): boolean {
  const batch = batches.find((b) => b.batchId === assignment.batchId);
  if (!batch) return false;
  return assignment.subjectSem < batch.currentSem;
}

/** Filters out every stale assignment — the "active assignments" a
 *  dashboard/Attendance/Timetable surface should use (Requirement 11.2). */
export function activeAssignments<T extends AssignmentWithContext>(
  assignments: readonly T[],
  batches: readonly BatchState[],
): T[] {
  return assignments.filter((a) => !isStaleAssignment(a, batches));
}
