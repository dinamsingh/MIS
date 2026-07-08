/**
 * Attendance domain service.
 *
 * Period-level attendance marking with live present/absent counts and
 * upsert save/load semantics keyed by
 * `(section, subject, date, time_slot, student)`.
 *
 * This module holds the testable business logic for the Attendance_Module:
 *  - `liveCounts` is a pure function partitioning a set of marks into present
 *    and absent tallies (Requirement 5.3).
 *  - `createInMemoryAttendanceService` provides an in-memory `AttendanceService`
 *    whose `savePeriod`/`loadPeriod` round-trip saved values (Requirements 5.4,
 *    5.5) and whose save is an idempotent upsert that never stores duplicate
 *    records per student and period (Requirement 5.6).
 *
 * The in-memory store models the persistence contract the Supabase-backed
 * data-access wrapper (later task) must honour, and lets the upsert/round-trip
 * correctness properties be verified in isolation.
 */

/** Identifies a single scheduled teaching slot. */
export interface PeriodKey {
  readonly sectionId: string;
  readonly subjectId: string;
  /** ISO date string (for example, `2024-05-01`). */
  readonly date: string;
  readonly timeSlot: string;
}

/** A single student's present/absent mark within a period. */
export interface AttendanceMark {
  readonly studentId: string;
  readonly present: boolean;
}

/** Extended teacher-facing status for a student's attendance in one period. */
export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'leave'
  | 'not-applicable';

/** A single student's extended attendance status within a period. */
export interface AttendanceStatusMark {
  readonly studentId: string;
  readonly status: AttendanceStatus;
}

/** The live tally of a set of marks. */
export interface AttendanceCounts {
  readonly present: number;
  readonly absent: number;
}

/**
 * The attendance persistence contract. `loadPeriod` returns the previously
 * saved marks for a period (Requirement 5.5); `savePeriod` persists one record
 * per student via upsert, never creating duplicates (Requirements 5.4, 5.6).
 */
export interface AttendanceService {
  loadPeriod(key: PeriodKey): Promise<AttendanceMark[]>;
  savePeriod(key: PeriodKey, marks: AttendanceMark[]): Promise<void>;
}

/**
 * Compute the live present and absent counts for a set of attendance marks.
 *
 * The present count is the number of marks flagged present, the absent count
 * is the number flagged absent, and the two always sum to the total number of
 * marks (Requirement 5.3).
 */
export function liveCounts(marks: AttendanceMark[]): AttendanceCounts {
  let present = 0;
  for (const mark of marks) {
    if (mark.present) {
      present += 1;
    }
  }
  return { present, absent: marks.length - present };
}

/** Convert a billable present/absent mark to the extended status model. */
export function statusFromAttendanceMark(mark: AttendanceMark): AttendanceStatusMark {
  return { studentId: mark.studentId, status: mark.present ? 'present' : 'absent' };
}

/**
 * Convert an extended status back to the legacy billable attendance mark.
 *
 * `leave` and `not-applicable` intentionally return `null`: they are excluded
 * from the denominator, so they must not become absent rows.
 */
export function statusToAttendanceMark(mark: AttendanceStatusMark): AttendanceMark | null {
  if (mark.status === 'present') {
    return { studentId: mark.studentId, present: true };
  }
  if (mark.status === 'absent') {
    return { studentId: mark.studentId, present: false };
  }
  return null;
}

/**
 * Serialize a period key into a stable composite store key. Components are
 * length-prefixed so that no combination of values can collide across
 * differently-segmented keys.
 */
function periodKeyToString(key: PeriodKey): string {
  return [key.sectionId, key.subjectId, key.date, key.timeSlot]
    .map((part) => `${part.length}:${part}`)
    .join('|');
}

/** One student's tally across a date range: how many held classes they attended. */
export interface StudentRangeTally {
  readonly studentId: string;
  readonly present: number;
  /** Classes counted as held: present + absent (leave/N-A are excluded). */
  readonly total: number;
}

/** A raw attendance row within a date range, as loaded from storage. */
export interface RangeAttendanceRow {
  readonly studentId: string;
  readonly date: string;
  readonly status: AttendanceStatus;
}

/**
 * Aggregate raw attendance rows (already filtered to a date range by the
 * caller) into one present/total tally per student, and the distinct set of
 * dates that had at least one recorded row (the "classes held" count).
 *
 * Pure and deterministic: given the same rows, always returns the same tally,
 * so the date-range report can be tested without a live database.
 */
export function aggregateRangeTallies(rows: readonly RangeAttendanceRow[]): {
  readonly tallies: StudentRangeTally[];
  readonly heldDates: readonly string[];
} {
  const byStudent = new Map<string, { present: number; total: number }>();
  const dates = new Set<string>();

  for (const row of rows) {
    if (row.status !== 'present' && row.status !== 'absent') {
      continue;
    }
    dates.add(row.date);
    const entry = byStudent.get(row.studentId) ?? { present: 0, total: 0 };
    entry.total += 1;
    if (row.status === 'present') {
      entry.present += 1;
    }
    byStudent.set(row.studentId, entry);
  }

  const tallies = Array.from(byStudent.entries()).map(([studentId, tally]) => ({
    studentId,
    present: tally.present,
    total: tally.total,
  }));

  return { tallies, heldDates: Array.from(dates).sort() };
}

/**
 * Create an in-memory `AttendanceService`.
 *
 * Records are stored keyed by `(section, subject, date, time_slot, student)`.
 * Saving a mark for a student that already has a record in the same period
 * updates that record in place rather than creating a duplicate, so the stored
 * state holds exactly one record per student and period (Requirement 5.6).
 */
export function createInMemoryAttendanceService(): AttendanceService {
  // periodKey -> (studentId -> present)
  const store = new Map<string, Map<string, boolean>>();

  return {
    async loadPeriod(key: PeriodKey): Promise<AttendanceMark[]> {
      const period = store.get(periodKeyToString(key));
      if (!period) {
        return [];
      }
      return Array.from(period.entries()).map(([studentId, present]) => ({
        studentId,
        present,
      }));
    },

    async savePeriod(key: PeriodKey, marks: AttendanceMark[]): Promise<void> {
      const storeKey = periodKeyToString(key);
      let period = store.get(storeKey);
      if (!period) {
        period = new Map<string, boolean>();
        store.set(storeKey, period);
      }
      // Upsert: a repeated studentId overwrites the prior value rather than
      // appending a duplicate record.
      for (const mark of marks) {
        period.set(mark.studentId, mark.present);
      }
    },
  };
}
