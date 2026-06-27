/**
 * Heatmap domain service (pure functions).
 *
 * Backs the Heatmap_Module: a calendar-style attendance grid plus an automatic
 * defaulter list. This module holds the correctness-critical, testable math;
 * grid rendering and persistence live in the UI and data-access layers.
 *
 * Covers:
 * - Requirement 13.1: each day cell is colored by that day's attendance level
 *   aggregated across the day's periods (`dayHeatLevel`).
 * - Requirement 13.2: a student's attendance percentage is attended periods
 *   divided by total held periods (`attendancePercent`).
 * - Requirement 13.3: list every Defaulter whose attendance percentage is
 *   strictly below 75 percent (`defaulters`).
 * - Requirement 13.4: the defaulter list is recomputed from the supplied
 *   records, so a fresh call after attendance changes yields the updated list.
 */

import type { AttendanceMark } from './attendanceService';

/** A student's aggregated attendance tallies used to classify defaulters. */
export interface StudentAttendance {
  readonly studentId: string;
  /** Number of periods the student was marked present for. */
  readonly attendedPeriods: number;
  /** Total number of periods held (present + absent). */
  readonly totalHeldPeriods: number;
}

/** The attendance percentage threshold below which a student is a Defaulter. */
export const DEFAULTER_THRESHOLD = 75;

/**
 * Attendance percentage for a student: attended periods divided by total held
 * periods, times 100 (Requirement 13.2).
 *
 * A zero total yields a defined `0` rather than dividing by zero
 * (Requirement 13.1 aggregation over days with no held periods). When attended
 * does not exceed total, the result always lies within [0, 100].
 */
export function attendancePercent(attendedPeriods: number, totalHeldPeriods: number): number {
  if (totalHeldPeriods === 0) {
    return 0;
  }
  return (attendedPeriods / totalHeldPeriods) * 100;
}

/**
 * The list of Defaulter student ids: every student whose attendance percentage
 * is strictly below {@link DEFAULTER_THRESHOLD} (75 percent) (Requirements 13.3,
 * 13.4).
 *
 * A student with no held periods has a 0% attendance percentage and is
 * therefore a defaulter. Recomputed purely from the supplied records, so the
 * list reflects the latest attendance on each call.
 */
export function defaulters(students: StudentAttendance[]): string[] {
  return students
    .filter(
      (student) =>
        attendancePercent(student.attendedPeriods, student.totalHeldPeriods) <
        DEFAULTER_THRESHOLD,
    )
    .map((student) => student.studentId);
}

/**
 * The aggregated attendance level for a single day's cell (Requirement 13.1).
 *
 * Aggregates every attendance mark recorded across the day's periods into a
 * single percentage: present marks divided by total marks, times 100. A day
 * with no recorded marks yields `0`. The result always lies within [0, 100]
 * and drives the calendar cell's color.
 */
export function dayHeatLevel(periodsForDay: AttendanceMark[]): number {
  const total = periodsForDay.length;
  if (total === 0) {
    return 0;
  }
  const present = periodsForDay.reduce(
    (count, mark) => (mark.present ? count + 1 : count),
    0,
  );
  return (present / total) * 100;
}
