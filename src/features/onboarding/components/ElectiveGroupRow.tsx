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
    <div className="rounded-xl border border-[#ecedf4] bg-[#fff] p-4">
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: '#eef0fe', color: '#4a42d4' }}
        >
          Elective
        </span>
        <span className="text-sm font-semibold text-[#1d2030]">{groupName}</span>
        <span className="text-xs text-[#969cad]">· pick the one you teach</span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {variants.map((variant) => {
          const id = `elective-${variant.id}`;
          const checked = chosenId === variant.id;
          return (
            <label
              key={variant.id}
              htmlFor={id}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                checked ? 'border-[#5b54e6] bg-[#eef0fe]' : 'border-[#ecedf4] hover:bg-[#f4f5f9]'
              }`}
            >
              <input
                id={id}
                type="radio"
                name={`elective-group-${groupName}`}
                checked={checked}
                onChange={() => pickVariant(variant.id)}
                className="h-4 w-4 accent-[#5b54e6]"
              />
              <span className="text-xs font-medium text-[#969cad]">{variant.code}</span>
              <span className="truncate text-sm text-[#1d2030]">{variant.name}</span>
            </label>
          );
        })}
      </div>

      {chosenId && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-[#5a6072]">Sections</span>
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
