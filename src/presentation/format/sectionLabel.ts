/**
 * Section label formatting (Batch / Semester / Section model wiring).
 *
 * A single teacher works across several class groups (e.g. CSE-5A, CSE-5B,
 * CSE-5C). Showing only a bare name — or worse, a UUID — in a section picker
 * gives no context, so this pure helper composes the descriptor columns added
 * in migration 0007 (department, batch, semester) with the section name into a
 * single human label such as:
 *
 *   "CSE · 2024-2028 · 5th Sem · Sec A"
 *
 * The descriptors are nullable, so rows that predate the migration (with no
 * batch/semester/department) gracefully fall back to the bare section name.
 * Kept pure and presentation-only so it can be unit-tested and reused by every
 * section selector (Attendance, Timetable, Heatmap, Roster import).
 */

/** The minimal section shape the label formatter needs. */
export interface SectionLike {
  readonly name: string;
  readonly batch?: string | null;
  readonly semester?: string | null;
  readonly department?: string | null;
}

/** The middot-style separator between label segments. */
const SEPARATOR = ' · ';

/** Abbreviate a semester descriptor, e.g. "5th Semester" → "5th Sem". */
function semesterShortLabel(semester: string): string {
  return semester.replace(/semester/gi, 'Sem').replace(/\s+/g, ' ').trim();
}

/**
 * Derive a short section token from the name, e.g. the "A" in "CSE-5A" becomes
 * "Sec A". Names without a trailing letter fall back to the trimmed name.
 */
function sectionShortLabel(name: string): string {
  const trimmed = name.trim();
  const match = /([A-Za-z])$/.exec(trimmed);
  return match ? `Sec ${match[1].toUpperCase()}` : trimmed;
}

/**
 * Compose a meaningful display label for a section.
 *
 * When any of the department/batch/semester descriptors are present the label
 * combines them with a shortened section token; when none are present (legacy
 * rows) the bare section name is returned unchanged.
 */
export function formatSectionLabel(section: SectionLike): string {
  const descriptors: string[] = [];
  if (section.department?.trim()) {
    descriptors.push(section.department.trim());
  }
  if (section.batch?.trim()) {
    descriptors.push(section.batch.trim());
  }
  if (section.semester?.trim()) {
    descriptors.push(semesterShortLabel(section.semester));
  }

  if (descriptors.length === 0) {
    return section.name.trim();
  }

  descriptors.push(sectionShortLabel(section.name));
  return descriptors.join(SEPARATOR);
}
