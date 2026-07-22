/**
 * Stale-assignment teacher notification (Requirement 11.4/11.5).
 *
 * Loads the current teacher's own `teacher_assignments` (joined to their
 * subject's `sem`) and every `batches` row (live read, both live and
 * graduated — a promoted-to-graduation batch can also newly stale an
 * assignment), then derives which BATCHES contain at least one now-stale
 * assignment via `isStaleAssignment` (`teacherAssignmentService.ts`).
 *
 * Recomputed fresh on every load — there is no server-side notification
 * record and no persisted "has been shown" state, matching the design's
 * explicit choice of a lightweight client-side banner over a new table.
 * The underlying condition (batch promoted, assignment not yet re-selected)
 * persists until the teacher visits My Teaching Subjects and re-selects, so
 * re-showing it on every load is sufficient and never stale itself.
 */

import { useEffect, useMemo, useState } from 'react';
import { fetchAllBatches, fetchTeacherAssignmentsWithContext } from '../api/onboarding';
import {
  isStaleAssignment,
  type AssignmentWithContext,
  type BatchState,
} from '@domain/services/teacherAssignmentService';
import type { Batch } from '../types';

export interface StaleAssignmentNotice {
  readonly loading: boolean;
  readonly error: string | null;
  /** Batches (full rows) containing at least one of the teacher's now-stale assignments. */
  readonly affectedBatches: readonly Batch[];
}

/** Derive the distinct batches (by id) containing at least one stale assignment. */
export function deriveAffectedBatches(
  assignments: readonly AssignmentWithContext[],
  batches: readonly Batch[],
): Batch[] {
  const batchStates: BatchState[] = batches.map((b) => ({ batchId: b.id, currentSem: b.currentSem }));
  const staleBatchIds = new Set(
    assignments.filter((a) => isStaleAssignment(a, batchStates)).map((a) => a.batchId),
  );
  return batches.filter((b) => staleBatchIds.has(b.id));
}

/**
 * Loads the teacher's own assignments + all batches, derives which batches
 * contain at least one now-stale assignment, and returns that list for a
 * banner to render (Requirement 11.4). Directs the teacher to My Teaching
 * Subjects to re-select — no admin-driven auto-reassignment is introduced
 * (Requirement 11.5).
 */
export function useStaleAssignmentNotice(): StaleAssignmentNotice {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [affectedBatches, setAffectedBatches] = useState<readonly Batch[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      const [assignments, batches] = await Promise.all([
        fetchTeacherAssignmentsWithContext(),
        fetchAllBatches(),
      ]);
      if (!active) return;
      setAffectedBatches(deriveAffectedBatches(assignments, batches));
      setLoading(false);
    })().catch((err: unknown) => {
      if (active) {
        setError(err instanceof Error ? err.message : 'Could not check for stale assignments.');
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return useMemo(
    () => ({ loading, error, affectedBatches }),
    [loading, error, affectedBatches],
  );
}
