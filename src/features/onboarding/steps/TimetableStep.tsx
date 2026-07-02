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
  readonly onBack: () => void;
  readonly onContinue: () => void;
}

/** Count every (subject × section) pick across all batches. */
function totalSelected(selection: SelectionState): number {
  let count = 0;
  for (const subjectMap of Object.values(selection)) {
    for (const sections of Object.values(subjectMap)) {
      count += sections.length;
    }
  }
  return count;
}

export default function TimetableStep({
  batchesWithSubjects,
  selection,
  onChangeSubject,
  onBack,
  onContinue,
}: TimetableStepProps) {
  // Collapsed by default.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const total = totalSelected(selection);

  return (
    <div className="flex flex-col gap-6">
      <Stepper current="timetable" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1d2030]">Aapki timetable</h1>
          <p className="mt-1 text-sm text-[#5a6072]">
            Har batch ke liye apne subjects aur sections chuniye.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full bg-[#eef0fe] px-3 py-1 text-xs font-semibold text-[#4a42d4]">
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
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center rounded-xl border border-[#ecedf4] bg-[#fff] px-5 py-3 text-sm font-semibold text-[#5a6072] transition-colors hover:bg-[#f4f5f9]"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center justify-center rounded-xl bg-[#5b54e6] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#4a42d4]"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
