/**
 * Timetable domain service (pure functions).
 *
 * Backs the Timetable_Module's weekly grid and, in particular, the Dashboard's
 * "today's classes" derivation. This module holds the testable derivation
 * logic; grid rendering and persistence live in the UI and data-access layers.
 *
 * Covers:
 * - Requirement 14.1: the weekly schedule is organised by day of week and time
 *   slot, the shape modelled by {@link TimetableEntry}.
 * - Requirement 14.3: the Dashboard derives the current date's classes from the
 *   timetable data, computed purely by {@link todaysClasses}.
 */

/** The seven days a weekly timetable is organised by (Requirement 14.1). */
export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

/**
 * A single weekly schedule entry: one subject taught to one section in a given
 * day's time slot. Mirrors the `timetable_entries` table
 * (`id`, `section_id`, `subject_id`, `day_of_week`, `time_slot`).
 */
export interface TimetableEntry {
  readonly id: string;
  readonly sectionId: string;
  readonly subjectId: string;
  readonly dayOfWeek: DayOfWeek;
  readonly timeSlot: string;
}

/**
 * The classes scheduled for the given day of week (Requirement 14.3).
 *
 * Returns exactly the timetable entries whose `dayOfWeek` matches `day`,
 * preserving their original relative order. Entries for any other day are
 * excluded, and the result is empty when no entry matches. This is the pure
 * derivation the Dashboard uses to show the current date's classes.
 */
export function todaysClasses(
  entries: readonly TimetableEntry[],
  day: DayOfWeek,
): TimetableEntry[] {
  return entries.filter((entry) => entry.dayOfWeek === day);
}

/**
 * The distinct sections that are taught a given subject (Shared-materials model).
 *
 * A single teacher often teaches the *same* subject to several sections (e.g.
 * IWT to Sec A and Sec B). Because assignments, quizzes, and study material are
 * scoped by subject/unit — never by section — they are inherently shared across
 * every section that studies the subject. The authoritative mapping of "which
 * sections study subject X" is the set of `(section_id, subject_id)` pairs in
 * the timetable, so this pure derivation collapses the timetable entries for one
 * subject down to the distinct section ids that teach it.
 *
 * The result preserves first-seen order (so a stable, timetable-ordered list)
 * and contains no duplicates even when a section has several weekly periods for
 * the subject. Returns an empty array when no entry matches.
 */
export function sectionIdsForSubject(
  entries: readonly TimetableEntry[],
  subjectId: string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of entries) {
    if (entry.subjectId === subjectId && !seen.has(entry.sectionId)) {
      seen.add(entry.sectionId);
      result.push(entry.sectionId);
    }
  }
  return result;
}
