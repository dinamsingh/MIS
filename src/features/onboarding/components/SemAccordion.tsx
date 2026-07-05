/**
 * Collapsible per-batch panel. Header reads "Sem <ROMAN> · Batch <id>" and
 * shows an "N selected" badge; the chevron rotates when expanded. The body
 * lists a {@link SubjectRow} for each subject in the batch's current semester.
 */

import SubjectRow from './SubjectRow';
import ElectiveGroupRow from './ElectiveGroupRow';
import type { Batch, Section, SubjectSelection, SyllabusSubject } from '../types';

interface SemAccordionProps {
  readonly batch: Batch;
  readonly subjects: readonly SyllabusSubject[];
  /** subjectId → selected sections for this batch. */
  readonly selection: Record<string, SubjectSelection>;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly onChangeSubject: (subjectId: string, sections: Section[]) => void;
  readonly onChangeSubjectLab: (subjectId: string, section: Section, includeLab: boolean) => void;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'] as const;

/** Convert a semester number (1..8) to a Roman numeral. */
export function toRoman(sem: number): string {
  return ROMAN[sem - 1] ?? String(sem);
}

/** Group elective subjects by their electiveGroup, preserving first-seen order. */
export function groupElectives(
  subjects: readonly SyllabusSubject[],
): Array<[string, SyllabusSubject[]]> {
  const groups = new Map<string, SyllabusSubject[]>();
  for (const s of subjects) {
    if (!s.electiveGroup) continue;
    const list = groups.get(s.electiveGroup);
    if (list) {
      list.push(s);
    } else {
      groups.set(s.electiveGroup, [s]);
    }
  }
  return Array.from(groups.entries());
}

export default function SemAccordion({
  batch,
  subjects,
  selection,
  expanded,
  onToggle,
  onChangeSubject,
  onChangeSubjectLab,
}: SemAccordionProps) {
  const selectedCount = subjects.reduce(
    (total, s) => total + (selection[s.id]?.sections.length ?? 0),
    0,
  );
  const bodyId = `sem-panel-${batch.id}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#ecedf4] bg-[#fff] shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-[#f4f5f9]"
      >
        <span className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[#1d2030]">
            Sem {toRoman(batch.currentSem)} · Batch {batch.id}
          </span>
          {selectedCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-[#eef0fe] px-2 py-0.5 text-xs font-semibold text-[#4a42d4]">
              {selectedCount} selected
            </span>
          )}
        </span>
        <svg
          className={`h-5 w-5 shrink-0 text-[#969cad] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {expanded && (
        <div id={bodyId} className="flex flex-col gap-3 border-t border-[#ecedf4] bg-[#f4f5f9] p-4">
          {subjects.length === 0 ? (
            <p className="px-1 py-2 text-sm text-[#969cad]">No subjects for this semester.</p>
          ) : (
            <>
              {/* Non-elective subjects render as normal rows. */}
              {subjects
                .filter((s) => !s.electiveGroup)
                .map((subject) => (
                  <SubjectRow
                    key={subject.id}
                    subject={subject}
                    selected={selection[subject.id]?.sections ?? []}
                    labSections={selection[subject.id]?.labSections ?? []}
                    onChange={(next) => onChangeSubject(subject.id, next)}
                    onChangeLab={(section, includeLab) => onChangeSubjectLab(subject.id, section, includeLab)}
                  />
                ))}

              {/* Elective variants grouped; pick exactly one per group. */}
              {groupElectives(subjects).map(([groupName, variants]) => (
                <ElectiveGroupRow
                  key={groupName}
                  groupName={groupName}
                  variants={variants}
                  selection={selection}
                  onChangeSubject={onChangeSubject}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
