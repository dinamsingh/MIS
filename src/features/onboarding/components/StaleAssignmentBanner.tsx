/**
 * Stale-assignment teacher notification banner (Requirement 11.4/11.5).
 *
 * Renders nothing when there are no affected batches. Otherwise shows a
 * compact banner naming the batch(es) that have moved to a new semester and
 * directs the teacher to My Teaching Subjects (`/profile`) to re-select
 * subjects — the only re-assignment path (no admin-driven auto-reassignment
 * exists, per the design's explicit out-of-scope note).
 */

import { useNavigate } from 'react-router-dom';
import { messages } from '@domain/shared/messages';
import { useStaleAssignmentNotice } from '../hooks/useStaleAssignmentNotice';

/** "Batch 2024-28" style label for a batch id. */
function formatBatchLabel(batchId: string): string {
  return `Batch ${batchId}`;
}

export default function StaleAssignmentBanner() {
  const navigate = useNavigate();
  const { affectedBatches } = useStaleAssignmentNotice();

  if (affectedBatches.length === 0) {
    return null;
  }

  const batchLabels = affectedBatches.map((b) => formatBatchLabel(b.id));

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-card border border-status-amber/30 bg-status-amber/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm font-medium text-text">
        {messages.teacherAssignment.staleAssignmentBanner(batchLabels)}
      </p>
      <button
        type="button"
        onClick={() => navigate('/profile')}
        className="inline-flex shrink-0 items-center justify-center rounded-control bg-status-amber px-4 py-2 text-xs font-semibold text-surface transition-colors hover:bg-status-amber/90"
      >
        Go to My Teaching Subjects
      </button>
    </div>
  );
}
