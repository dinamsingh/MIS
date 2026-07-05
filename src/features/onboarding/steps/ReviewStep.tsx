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
        <h1 className="text-2xl font-bold text-[#1d2030]">Ek baar dekh lijiye</h1>
        <p className="mt-1 text-sm text-[#5a6072]">Sab sahi lag raha hai? Toh setup complete karein.</p>
        <span className="mt-3 inline-flex rounded-full bg-[#eef0fe] px-3 py-1 text-xs font-semibold uppercase text-[#4a42d4]">
          {currentSession} session
        </span>
      </div>

      {!hasSelections ? (
        <p className="rounded-xl border border-[#ecedf4] bg-[#f4f5f9] px-4 py-6 text-center text-sm text-[#969cad]">
          Abhi tak koi subject select nahi hua. Wapas jaakar chuniye.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(({ batch, chosen }) => (
            <div key={batch.id} className="rounded-2xl border border-[#ecedf4] bg-[#fff] p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-[#1d2030]">
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
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f4f5f9] px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="text-sm font-medium text-[#1d2030]">{subject.name}</span>
                        <span className="ml-2 text-xs text-[#969cad]">{subject.code}</span>
                        {hasOptionalLab && (
                          <span
                            className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: labAttached ? '#e7f8f1' : '#f0f1f5',
                              color: labAttached ? '#0e9d6e' : '#6b7280',
                            }}
                          >
                            {labAttached ? `Lab ${selectedLabSections.join(', ')}` : 'Lab removed'}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1">
                        {sections.map((section) => (
                          <span
                            key={section}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#5b54e6] text-xs font-semibold text-white"
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
          className="inline-flex items-center justify-center rounded-xl border border-[#ecedf4] bg-[#fff] px-5 py-3 text-sm font-semibold text-[#5a6072] transition-colors hover:bg-[#f4f5f9] disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onFinish}
          disabled={saving || !hasSelections}
          className="inline-flex items-center justify-center rounded-xl bg-[#12b886] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0e9d6e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Finish setup ✓'}
        </button>
      </div>
    </div>
  );
}
