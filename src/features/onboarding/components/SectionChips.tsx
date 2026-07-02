/**
 * A/B/C multi-select section chips. Selected chips use the accent color;
 * unselected chips are neutral. Fully keyboard-accessible (native buttons).
 */

import { SECTIONS, type Section } from '../types';

interface SectionChipsProps {
  readonly selected: readonly Section[];
  readonly onChange: (next: Section[]) => void;
  /** Optional id prefix for accessible labelling. */
  readonly idPrefix?: string;
}

export default function SectionChips({ selected, onChange, idPrefix }: SectionChipsProps) {
  const toggle = (section: Section) => {
    const isOn = selected.includes(section);
    const next = isOn ? selected.filter((s) => s !== section) : [...selected, section];
    // Keep a stable A→B→C order regardless of click sequence.
    onChange(SECTIONS.filter((s) => next.includes(s)));
  };

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Sections">
      {SECTIONS.map((section) => {
        const active = selected.includes(section);
        return (
          <button
            key={section}
            type="button"
            id={idPrefix ? `${idPrefix}-${section}` : undefined}
            aria-pressed={active}
            onClick={() => toggle(section)}
            className={[
              'h-8 w-8 rounded-full text-sm font-semibold transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b54e6]/40',
              active
                ? 'bg-[#5b54e6] text-white shadow-sm'
                : 'bg-[#f4f5f9] text-[#5a6072] border border-[#ecedf4] hover:bg-[#eef0fe]',
            ].join(' ')}
          >
            {section}
          </button>
        );
      })}
    </div>
  );
}
