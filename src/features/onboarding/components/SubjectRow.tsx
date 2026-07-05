/**
 * One syllabus subject row: a colored kind tag, the subject code + name, and a
 * per-section multi-select. Lab-backed theory subjects show one lab checkbox
 * per selected section.
 */

import SectionChips from './SectionChips';
import type { Section, SubjectKind, SyllabusSubject } from '../types';

interface SubjectRowProps {
  readonly subject: SyllabusSubject;
  readonly selected: readonly Section[];
  readonly labSections: readonly Section[];
  readonly onChange: (next: Section[]) => void;
  readonly onChangeLab: (section: Section, includeLab: boolean) => void;
}

/** Exact token styles for the kind tag, per the design spec. */
const KIND_TAG: Record<SubjectKind, { bg: string; text: string; label: string }> = {
  theory: { bg: '#eaf1ff', text: '#2f6bd6', label: 'Theory' },
  lab: { bg: '#e7f8f1', text: '#0e9d6e', label: 'Lab' },
  project: { bg: '#fff3e0', text: '#c77700', label: 'Project' },
  elective: { bg: '#eef0fe', text: '#4a42d4', label: 'Elective' },
  special: { bg: '#f0f1f5', text: '#6b7280', label: 'Special' },
};

export default function SubjectRow({ subject, selected, labSections, onChange, onChangeLab }: SubjectRowProps) {
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
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="mr-1 font-medium text-[#5a6072]">{subject.labName}</span>
            {selected.map((section) => {
              const checked = labSections.includes(section);
              const inputId = `lab-${subject.id}-${section}`;
              return (
                <label
                  key={section}
                  htmlFor={inputId}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium"
                  style={{
                    backgroundColor: checked ? '#e7f8f1' : '#f0f1f5',
                    color: checked ? '#0e9d6e' : '#6b7280',
                  }}
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onChangeLab(section, event.target.checked)}
                    className="h-3.5 w-3.5 rounded border-[#cfd3df] accent-[#12b886]"
                  />
                  Lab {section}
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="shrink-0">
        <SectionChips selected={selected} onChange={onChange} idPrefix={`sec-${subject.id}`} />
      </div>
    </div>
  );
}
