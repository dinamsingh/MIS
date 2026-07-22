/**
 * Step 2 — Timetable. One accordion per live batch; inside each, subjects with
 * section multi-selects. Shows a global selected counter and Back / Continue.
 */

import { useState } from 'react';
import Stepper from '../components/Stepper';
import SemAccordion from '../components/SemAccordion';
import type { BatchWithSubjects, Section, SelectionState } from '../types';

interface TimetableStepProps {
  readonly batchesWithSubjects: readonly BatchWithSubjects[];
  readonly selection: SelectionState;
  readonly onChangeSubject: (batchId: string, subjectId: string, sections: Section[]) => void;
  readonly onChangeSubjectLab: (
    batchId: string,
    subjectId: string,
    section: Section,
    includeLab: boolean,
  ) => void;
  readonly onBack: () => void;
  readonly onContinue: () => void;
  /** Forwarded to `Stepper` — show the "Password" step when true. */
  readonly includePassword?: boolean;
}

/** Count every (subject × section) pick across all batches. */
function totalSelected(selection: SelectionState): number {
  let count = 0;
  for (const subjectMap of Object.values(selection)) {
    for (const subjectSelection of Object.values(subjectMap)) {
      count += subjectSelection.sections.length;
    }
  }
  return count;
}

export default function TimetableStep({
  batchesWithSubjects,
  selection,
  onChangeSubject,
  onChangeSubjectLab,
  onBack,
  onContinue,
  includePassword = false,
}: TimetableStepProps) {
  // Collapsed by default.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const total = totalSelected(selection);

  return (
    <div className="flex flex-col gap-6">
      <Stepper current="timetable" includePassword={includePassword} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Aapki timetable</h1>
          <p className="mt-1 text-sm text-soft">
            Select your subjects and sections for each batch.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full bg-accent-tint px-3 py-1 text-xs font-semibold text-accent">
          {total} selected
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {batchesWithSubjects.map(({ batch, subjects }) => (
          <SemAccordion
            key={batch.id}
            batch={batch}
            subjects={subjects}
            selection={selection[batch.id] ?? {}}
            expanded={expandedId === batch.id}
            onToggle={() => setExpandedId((prev) => (prev === batch.id ? null : batch.id))}
            onChangeSubject={(subjectId, sections) => onChangeSubject(batch.id, subjectId, sections)}
            onChangeSubjectLab={(subjectId, section, includeLab) =>
              onChangeSubjectLab(batch.id, subjectId, section, includeLab)
            }
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="btn-primary"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
