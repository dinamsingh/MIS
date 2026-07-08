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

/** Theme-aware token styles for subject kind tags. */
const KIND_TAG: Record<SubjectKind, { className: string; label: string }> = {
  theory: { className: 'bg-status-blue/10 text-status-blue', label: 'Theory' },
  lab: { className: 'bg-status-green/10 text-status-green', label: 'Lab' },
  project: { className: 'bg-status-amber/10 text-status-amber', label: 'Project' },
  elective: { className: 'bg-accent-tint text-accent', label: 'Elective' },
  special: { className: 'bg-secondary text-soft', label: 'Special' },
};

export default function SubjectRow({ subject, selected, labSections, onChange, onChangeLab }: SubjectRowProps) {
  const tag = KIND_TAG[subject.kind];
  const showLab = subject.kind === 'theory' && !!subject.labName && selected.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-control border border-border bg-surface p-4 shadow-[0_1px_0_rgb(var(--color-border)/0.45)] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tag.className}`}>
            {tag.label}
          </span>
          <span className="text-xs font-medium text-muted">{subject.code}</span>
        </div>
        <p className="mt-1 truncate text-sm font-medium text-text">{subject.name}</p>
        {showLab && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="mr-1 font-medium text-soft">{subject.labName}</span>
            {selected.map((section) => {
              const checked = labSections.includes(section);
              const inputId = `lab-${subject.id}-${section}`;
              return (
                <label
                  key={section}
                  htmlFor={inputId}
                  className={[
                    'inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium',
                    checked ? 'bg-status-green/10 text-status-green' : 'bg-secondary text-muted',
                  ].join(' ')}
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onChangeLab(section, event.target.checked)}
                    className="h-3.5 w-3.5 rounded border-input accent-status-green"
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
