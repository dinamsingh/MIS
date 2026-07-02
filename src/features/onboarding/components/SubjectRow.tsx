/**
 * One syllabus subject row: a colored kind tag, the subject code + name, and a
 * per-section multi-select. When a `theory` subject that has a `labName` has at
 * least one section selected, an attached-lab badge is shown to signal that a
 * matching `is_lab` assignment will be auto-created.
 */

import SectionChips from './SectionChips';
import type { Section, SubjectKind, SyllabusSubject } from '../types';

interface SubjectRowProps {
  readonly subject: SyllabusSubject;
  readonly selected: readonly Section[];
  readonly onChange: (next: Section[]) => void;
}

/** Exact token styles for the kind tag, per the design spec. */
const KIND_TAG: Record<SubjectKind, { bg: string; text: string; label: string }> = {
  theory: { bg: '#eaf1ff', text: '#2f6bd6', label: 'Theory' },
  lab: { bg: '#e7f8f1', text: '#0e9d6e', label: 'Lab' },
  project: { bg: '#fff3e0', text: '#c77700', label: 'Project' },
  elective: { bg: '#eef0fe', text: '#4a42d4', label: 'Elective' },
  special: { bg: '#f0f1f5', text: '#6b7280', label: 'Special' },
};

export default function SubjectRow({ subject, selected, onChange }: SubjectRowProps) {
  const tag = KIND_TAG[subject.kind];
  const showLab = subject.kind === 'theory' && !!subject.labName && selected.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#ecedf4] bg-[#fff] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: tag.bg, color: tag.text }}
          >
            {tag.label}
          </span>
          <span className="text-xs font-medium text-[#969cad]">{subject.code}</span>
        </div>
        <p className="mt-1 truncate text-sm font-medium text-[#1d2030]">{subject.name}</p>
        {showLab && (
          <span
            className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: '#e7f8f1', color: '#0e9d6e' }}
          >
            <span aria-hidden>🔗</span> Lab attached · {subject.labName}
          </span>
        )}
      </div>

      <div className="shrink-0">
        <SectionChips selected={selected} onChange={onChange} idPrefix={`sec-${subject.id}`} />
      </div>
    </div>
  );
}
