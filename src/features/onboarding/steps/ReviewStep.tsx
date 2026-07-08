/**
 * Step 3 — Review. A read-only summary grouped by batch/sem, listing each
 * chosen subject, its selected sections, and whether a lab will be attached.
 * "Finish setup ✓" persists everything.
 */

import Stepper from '../components/Stepper';
import { toRoman } from '../components/SemAccordion';
import type { AcademicSession, BatchWithSubjects, SelectionState } from '../types';

interface ReviewStepProps {
  readonly batchesWithSubjects: readonly BatchWithSubjects[];
  readonly selection: SelectionState;
  readonly currentSession: AcademicSession;
  readonly saving: boolean;
  readonly onBack: () => void;
  readonly onFinish: () => void;
}

export default function ReviewStep({
  batchesWithSubjects,
  selection,
  currentSession,
  saving,
  onBack,
  onFinish,
}: ReviewStepProps) {
  // Batches that actually have at least one selected subject.
  const groups = batchesWithSubjects
    .map(({ batch, subjects }) => {
      const chosen = subjects
        .map((subject) => ({
          subject,
          subjectSelection: selection[batch.id]?.[subject.id],
        }))
        .map(({ subject, subjectSelection }) => ({
          subject,
          sections: subjectSelection?.sections ?? [],
          labSections: subjectSelection?.labSections ?? [],
        }))
        .filter((entry) => entry.sections.length > 0);
      return { batch, chosen };
    })
    .filter((group) => group.chosen.length > 0);

  const hasSelections = groups.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <Stepper current="review" />

      <div>
        <h1 className="text-2xl font-bold text-text">Ek baar dekh lijiye</h1>
        <p className="mt-1 text-sm text-soft">Sab sahi lag raha hai? Toh setup complete karein.</p>
        <span className="mt-3 inline-flex rounded-full bg-accent-tint px-3 py-1 text-xs font-semibold uppercase text-accent">
          {currentSession} session
        </span>
      </div>

      {!hasSelections ? (
        <p className="rounded-control border border-border bg-surface-muted px-4 py-6 text-center text-sm text-muted">
          Abhi tak koi subject select nahi hua. Wapas jaakar chuniye.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(({ batch, chosen }) => (
            <div key={batch.id} className="rounded-card border border-border bg-surface p-4 shadow-soft">
              <h2 className="text-sm font-semibold text-text">
                Sem {toRoman(batch.currentSem)} · Batch {batch.id}
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {chosen.map(({ subject, sections, labSections }) => {
                  const hasOptionalLab = subject.kind === 'theory' && !!subject.labName;
                  const selectedLabSections = sections.filter((section) => labSections.includes(section));
                  const labAttached = hasOptionalLab && selectedLabSections.length > 0;
                  return (
                    <li
                      key={subject.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-muted px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="text-sm font-medium text-text">{subject.name}</span>
                        <span className="ml-2 text-xs text-muted">{subject.code}</span>
                        {hasOptionalLab && (
                          <span
                            className={[
                              'ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                              labAttached ? 'bg-status-green/10 text-status-green' : 'bg-secondary text-muted',
                            ].join(' ')}
                          >
                            {labAttached ? `Lab ${selectedLabSections.join(', ')}` : 'Lab removed'}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1">
                        {sections.map((section) => (
                          <span
                            key={section}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-surface"
                          >
                            {section}
                          </span>
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          className="btn-secondary disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onFinish}
          disabled={saving || !hasSelections}
          className="btn-primary bg-status-green hover:bg-status-green/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Finish setup ✓'}
        </button>
      </div>
    </div>
  );
}
