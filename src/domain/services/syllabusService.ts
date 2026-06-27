/**
 * Syllabus domain service (pure functions).
 *
 * Backs the Syllabus_Tracker UI. This module holds the correctness-critical,
 * testable math for syllabus progress and schedule status; units/topics CRUD
 * and planning persistence are handled by the data-access layer in later tasks.
 *
 * Covers:
 * - Requirement 6.5: progress percentage = completed topics / total topics.
 * - Requirement 6.6: on-schedule vs behind-schedule by comparing actual
 *   progress against the teacher-defined planned progress for the current date.
 * - Requirement 6.7: zero topics yields 0% progress (empty-state handled in UI).
 */

/** A teacher-defined item within a unit that can be marked complete. */
export interface Topic {
  readonly id: string;
  readonly name: string;
  readonly complete: boolean;
}

/** A teacher-defined division of a subject's syllabus containing topics. */
export interface Unit {
  readonly id: string;
  readonly name: string;
  readonly topics: Topic[];
  /** Optional teacher-defined planned schedule date (ISO string). */
  readonly plannedDate?: string;
}

/** The on/behind-schedule status displayed per subject and per unit. */
export type ScheduleStatus = 'on-schedule' | 'behind-schedule';

/**
 * Progress percentage for a set of topics (a unit's topics, or all of a
 * subject's topics): completed topics divided by total topics, times 100.
 *
 * Returns 0 when the set is empty (no topics defined) so the tracker shows
 * 0% rather than dividing by zero (Requirement 6.5, 6.7). The result is always
 * within [0, 100].
 */
export function progressPercent(topics: Topic[]): number {
  const total = topics.length;
  if (total === 0) {
    return 0;
  }
  const completed = topics.reduce((count, topic) => (topic.complete ? count + 1 : count), 0);
  return (completed / total) * 100;
}

/**
 * Schedule status by comparing actual progress against the planned progress
 * for the current date (Requirement 6.6).
 *
 * The status is `behind-schedule` if and only if actual progress is strictly
 * less than planned progress; otherwise it is `on-schedule` (meeting or
 * exceeding the plan counts as on schedule).
 */
export function scheduleStatus(
  actualPercent: number,
  plannedPercentForToday: number,
): ScheduleStatus {
  return actualPercent < plannedPercentForToday ? 'behind-schedule' : 'on-schedule';
}
