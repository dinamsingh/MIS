/**
 * An elective choice group (e.g. "Departmental Elective"). Shows all variants
 * as radio options so the teacher picks EXACTLY ONE per group, then section
 * chips for the chosen variant. Switching variants clears the previous one, so
 * at most one variant in the group is ever selected.
 */

import { useEffect, useState } from 'react';
import SectionChips from './SectionChips';
import type { Section, SubjectSelection, SyllabusSubject } from '../types';

interface ElectiveGroupRowProps {
  readonly groupName: string;
  readonly variants: readonly SyllabusSubject[];
  /** subjectId → selected sections for this batch. */
  readonly selection: Record<string, SubjectSelection>;
  readonly onChangeSubject: (subjectId: string, sections: Section[]) => void;
}

export default function ElectiveGroupRow({
  groupName,
  variants,
  selection,
  onChangeSubject,
}: ElectiveGroupRowProps) {
  // The active variant is whichever one currently has sections selected.
  const activeFromState = variants.find((v) => (selection[v.id]?.sections.length ?? 0) > 0)?.id ?? '';
  const [chosenId, setChosenId] = useState(activeFromState);

  // Keep local choice in sync if the selection changes elsewhere (e.g. reset).
  useEffect(() => {
    if (activeFromState && activeFromState !== chosenId) {
      setChosenId(activeFromState);
    }
  }, [activeFromState, chosenId]);

  function pickVariant(id: string) {
    if (id === chosenId) return;
    // Enforce one-per-group: clear the previously chosen variant's sections.
    if (chosenId) {
      onChangeSubject(chosenId, []);
    }
    setChosenId(id);
  }

  const chosenSections = chosenId ? selection[chosenId]?.sections ?? [] : [];

  return (
    <div className="rounded-control border border-border bg-surface p-4 shadow-[0_1px_0_rgb(var(--color-border)/0.45)]">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-accent-tint px-2 py-0.5 text-xs font-semibold text-accent">
          Elective
        </span>
        <span className="text-sm font-semibold text-text">{groupName}</span>
        <span className="text-xs text-muted">· pick the one you teach</span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {variants.map((variant) => {
          const id = `elective-${variant.id}`;
          const checked = chosenId === variant.id;
          return (
            <label
              key={variant.id}
              htmlFor={id}
              className={`flex cursor-pointer items-center gap-2 rounded-button border px-3 py-2 transition-colors ${
                checked ? 'border-accent bg-accent-tint' : 'border-border hover:bg-surface-muted'
              }`}
            >
              <input
                id={id}
                type="radio"
                name={`elective-group-${groupName}`}
                checked={checked}
                onChange={() => pickVariant(variant.id)}
                className="h-4 w-4 accent-accent"
              />
              <span className="text-xs font-medium text-muted">{variant.code}</span>
              <span className="truncate text-sm text-text">{variant.name}</span>
            </label>
          );
        })}
      </div>

      {chosenId && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-soft">Sections</span>
          <SectionChips
            selected={chosenSections}
            onChange={(next) => onChangeSubject(chosenId, next)}
            idPrefix={`sec-${chosenId}`}
          />
        </div>
      )}
    </div>
  );
}
