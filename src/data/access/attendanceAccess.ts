/**
 * Attendance data-access wrapper (task 16.2).
 *
 * Binds the pure `attendanceService` to the `attendance` table. `loadPeriod`
 * reads the saved marks for a `(section, subject, date, time_slot)` period and
 * `savePeriod` upserts one row per student on the table's unique key so a
 * re-save updates in place rather than duplicating (Requirements 5.1, 5.2,
 * 5.4–5.6). `liveCounts` is re-exported from the domain so the UI computes the
 * live tally with the same pure function.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import {
  aggregateRangeTallies,
  liveCounts,
  type AttendanceMark,
  type AttendanceStatusMark,
  type PeriodKey,
  type RangeAttendanceRow,
  type StudentRangeTally,
} from '../../domain/services/attendanceService';
import {
  fromAttendanceMark,
  fromAttendanceStatusMark,
  toAttendanceMark,
  toAttendanceStatusMark,
  type AttendanceRow,
} from './rows';
import { expectOk, unwrapList } from './support';

export { liveCounts };

/** The unique-key columns Supabase uses to upsert one row per student/period. */
const ATTENDANCE_CONFLICT_TARGET = 'student_id,section_id,subject_id,date,time_slot';
const ATTENDANCE_STATUS_STORAGE_KEY = 'mis_attendance_status_v1';

export interface AttendanceOverallScope {
  readonly sectionId: string;
  readonly subjectId?: string;
}

export interface AttendanceOverallMark {
  readonly studentId: string;
  readonly present: number;
  readonly total: number;
}

/** A date-range query scope: section is required, subject/dates narrow it. */
export interface AttendanceRangeScope {
  readonly sectionId: string;
  readonly subjectId?: string;
  /** Inclusive ISO start date (e.g. '2024-10-01'). */
  readonly fromDate: string;
  /** Inclusive ISO end date (e.g. '2024-10-15'). */
  readonly toDate: string;
}

/** The date-range report: one tally per student plus how many classes were held. */
export interface AttendanceRangeReport {
  readonly tallies: StudentRangeTally[];
  /** Distinct dates with at least one recorded attendance row, sorted ascending. */
  readonly heldDates: readonly string[];
}

export interface AttendanceStatusRangeTally {
  readonly studentId: string;
  readonly present: number;
  readonly absent: number;
  readonly leave: number;
  readonly notApplicable: number;
}

export interface AttendanceStatusRangeReport {
  readonly tallies: AttendanceStatusRangeTally[];
  readonly records: RangeAttendanceRow[];
  /** Distinct dates with at least one present/absent row in the range. */
  readonly heldDates: readonly string[];
}

export interface AttendanceMarkedSlotsScope {
  readonly sectionId: string;
  readonly subjectId?: string;
  readonly date: string;
}

export interface AttendanceMarkedDatesScope {
  readonly sectionId: string;
  readonly subjectId?: string;
  readonly fromDate: string;
  readonly toDate: string;
}

export interface AttendancePeriodMeta {
  readonly lastSavedAt: string | null;
}

/** Supabase-backed attendance persistence (mirrors the domain contract). */
export interface AttendanceAccess {
  loadPeriod(key: PeriodKey): Promise<AttendanceMark[]>;
  savePeriod(key: PeriodKey, marks: AttendanceMark[]): Promise<void>;
  loadStatusPeriod(key: PeriodKey): Promise<AttendanceStatusMark[]>;
  saveStatusPeriod(key: PeriodKey, marks: AttendanceStatusMark[]): Promise<void>;
  loadStudentOverall(scope: AttendanceOverallScope): Promise<AttendanceOverallMark[]>;
  /** Load a per-student present/total tally for an inclusive date range (Attendance report). */
  loadRangeReport(scope: AttendanceRangeScope): Promise<AttendanceRangeReport>;
  /** Load status-wise counts for report screens. Leave/N-A are display-only and excluded from heldDates. */
  loadStatusRangeReport(scope: AttendanceRangeScope): Promise<AttendanceStatusRangeReport>;
  loadMarkedSlots(scope: AttendanceMarkedSlotsScope): Promise<string[]>;
  loadMarkedDates(scope: AttendanceMarkedDatesScope): Promise<string[]>;
  loadPeriodMeta(key: PeriodKey): Promise<AttendancePeriodMeta>;
}

interface LocalStatusStore {
  readonly periods: Record<string, AttendanceStatusMark[]>;
}

function readStatusStore(): LocalStatusStore {
  if (typeof window === 'undefined') {
    return { periods: {} };
  }
  try {
    const raw = window.localStorage.getItem(ATTENDANCE_STATUS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalStatusStore) : { periods: {} };
  } catch {
    return { periods: {} };
  }
}

interface AttendanceOverallRow {
  readonly student_id: string;
  readonly status: AttendanceStatusMark['status'];
}

function aggregateOverallRows(rows: readonly AttendanceOverallRow[]): AttendanceOverallMark[] {
  const tallies = new Map<string, { present: number; total: number }>();
  for (const row of rows) {
    if (row.status !== 'present' && row.status !== 'absent') {
      continue;
    }
    const tally = tallies.get(row.student_id) ?? { present: 0, total: 0 };
    tally.total += 1;
    if (row.status === 'present') {
      tally.present += 1;
    }
    tallies.set(row.student_id, tally);
  }

  return Array.from(tallies.entries()).map(([studentId, tally]) => ({
    studentId,
    present: tally.present,
    total: tally.total,
  }));
}

function aggregateStatusRangeRows(rows: readonly RangeAttendanceRow[]): AttendanceStatusRangeReport {
  const tallies = new Map<string, AttendanceStatusRangeTally>();
  const heldDates = new Set<string>();

  for (const row of rows) {
    const current = tallies.get(row.studentId) ?? {
      studentId: row.studentId,
      present: 0,
      absent: 0,
      leave: 0,
      notApplicable: 0,
    };

    if (row.status === 'present') {
      tallies.set(row.studentId, { ...current, present: current.present + 1 });
      heldDates.add(row.date);
    } else if (row.status === 'absent') {
      tallies.set(row.studentId, { ...current, absent: current.absent + 1 });
      heldDates.add(row.date);
    } else if (row.status === 'leave') {
      tallies.set(row.studentId, { ...current, leave: current.leave + 1 });
    } else {
      tallies.set(row.studentId, { ...current, notApplicable: current.notApplicable + 1 });
    }
  }

  return {
    tallies: Array.from(tallies.values()),
    records: rows.slice(),
    heldDates: Array.from(heldDates).sort(),
  };
}

function parseLegacyPeriodKey(storageKey: string): PeriodKey | null {
  try {
    const parts = JSON.parse(storageKey) as unknown;
    if (!Array.isArray(parts) || parts.length !== 4 || !parts.every((part) => typeof part === 'string')) {
      return null;
    }
    const [sectionId, subjectId, date, timeSlot] = parts as [string, string, string, string];
    return { sectionId, subjectId, date, timeSlot };
  } catch {
    return null;
  }
}

export async function migrateLocalStatusStore(client: SupabaseClient = defaultClient): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  const raw = window.localStorage.getItem(ATTENDANCE_STATUS_STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const store = readStatusStore();
    const rows: AttendanceRow[] = [];
    for (const [storageKey, marks] of Object.entries(store.periods)) {
      const key = parseLegacyPeriodKey(storageKey);
      if (!key) {
        continue;
      }
      for (const mark of marks) {
        if (mark.status === 'leave' || mark.status === 'not-applicable') {
          rows.push(fromAttendanceStatusMark(key, mark));
        }
      }
    }

    if (rows.length > 0) {
      expectOk(
        await client
          .from('attendance')
          .upsert(rows, { onConflict: ATTENDANCE_CONFLICT_TARGET }),
      );
    }

    window.localStorage.removeItem(ATTENDANCE_STATUS_STORAGE_KEY);
  } catch {
    // Leave the legacy key in place so a later successful app load can retry.
  }
}

/** Create an {@link AttendanceAccess} bound to the given Supabase client. */
export function createAttendanceAccess(
  client: SupabaseClient = defaultClient,
): AttendanceAccess {
  async function loadPeriod(key: PeriodKey): Promise<AttendanceMark[]> {
      const rows = unwrapList(
        await client
          .from('attendance')
          .select('student_id, section_id, subject_id, date, time_slot, present, status')
          .eq('section_id', key.sectionId)
          .eq('subject_id', key.subjectId)
          .eq('date', key.date)
          .eq('time_slot', key.timeSlot),
      ) as AttendanceRow[];
      return rows
        .filter((row) => row.status === 'present' || row.status === 'absent')
        .map(toAttendanceMark);
  }

  async function savePeriod(key: PeriodKey, marks: AttendanceMark[]): Promise<void> {
      if (marks.length === 0) {
        return;
      }
      const rows = marks.map((mark) => fromAttendanceMark(key, mark));
      expectOk(
        await client
          .from('attendance')
          .upsert(rows, { onConflict: ATTENDANCE_CONFLICT_TARGET }),
      );
  }

  async function loadStudentOverall(scope: AttendanceOverallScope): Promise<AttendanceOverallMark[]> {
      let query = client
        .from('attendance')
        .select('student_id, status')
        .eq('section_id', scope.sectionId);

      if (scope.subjectId) {
        query = query.eq('subject_id', scope.subjectId);
      }

      return aggregateOverallRows(unwrapList(await query) as AttendanceOverallRow[]);
  }

  async function loadRangeReport(scope: AttendanceRangeScope): Promise<AttendanceRangeReport> {
      let query = client
        .from('attendance')
        .select('student_id, date, status')
        .eq('section_id', scope.sectionId)
        .gte('date', scope.fromDate)
        .lte('date', scope.toDate);

      if (scope.subjectId) {
        query = query.eq('subject_id', scope.subjectId);
      }

      const rows = unwrapList(await query) as Array<{
        student_id: string;
        date: string;
        status: AttendanceStatusMark['status'];
      }>;
      const mapped: RangeAttendanceRow[] = rows.map((row) => ({
        studentId: row.student_id,
        date: row.date,
        status: row.status,
      }));
      return aggregateRangeTallies(mapped);
  }

  async function loadStatusRangeReport(scope: AttendanceRangeScope): Promise<AttendanceStatusRangeReport> {
      let query = client
        .from('attendance')
        .select('student_id, date, status')
        .eq('section_id', scope.sectionId)
        .gte('date', scope.fromDate)
        .lte('date', scope.toDate);

      if (scope.subjectId) {
        query = query.eq('subject_id', scope.subjectId);
      }

      const rows = unwrapList(await query) as Array<{
        student_id: string;
        date: string;
        status: AttendanceStatusMark['status'];
      }>;
      return aggregateStatusRangeRows(rows.map((row) => ({
        studentId: row.student_id,
        date: row.date,
        status: row.status,
      })));
  }

  async function loadMarkedSlots(scope: AttendanceMarkedSlotsScope): Promise<string[]> {
      let query = client
        .from('attendance')
        .select('time_slot')
        .eq('section_id', scope.sectionId)
        .eq('date', scope.date);

      if (scope.subjectId) {
        query = query.eq('subject_id', scope.subjectId);
      }

      const rows = unwrapList(await query) as Array<{ time_slot: string }>;
      return Array.from(new Set(rows.map((row) => row.time_slot))).sort();
  }

  async function loadMarkedDates(scope: AttendanceMarkedDatesScope): Promise<string[]> {
      let query = client
        .from('attendance')
        .select('date')
        .eq('section_id', scope.sectionId)
        .gte('date', scope.fromDate)
        .lte('date', scope.toDate);

      if (scope.subjectId) {
        query = query.eq('subject_id', scope.subjectId);
      }

      const rows = unwrapList(await query) as Array<{ date: string }>;
      return Array.from(new Set(rows.map((row) => row.date))).sort();
  }

  async function loadPeriodMeta(key: PeriodKey): Promise<AttendancePeriodMeta> {
      const rows = unwrapList(
        await client
          .from('attendance')
          .select('updated_at')
          .eq('section_id', key.sectionId)
          .eq('subject_id', key.subjectId)
          .eq('date', key.date)
          .eq('time_slot', key.timeSlot),
      ) as Array<{ updated_at: string | null }>;

      const timestamps = rows
        .map((row) => row.updated_at)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .sort();
      return { lastSavedAt: timestamps[timestamps.length - 1] ?? null };
  }

  return {
    loadPeriod,
    savePeriod,
    loadStudentOverall,
    loadRangeReport,
    loadStatusRangeReport,
    loadMarkedSlots,
    loadMarkedDates,
    loadPeriodMeta,

    async loadStatusPeriod(key: PeriodKey): Promise<AttendanceStatusMark[]> {
      const rows = unwrapList(
        await client
          .from('attendance')
          .select('student_id, section_id, subject_id, date, time_slot, present, status')
          .eq('section_id', key.sectionId)
          .eq('subject_id', key.subjectId)
          .eq('date', key.date)
          .eq('time_slot', key.timeSlot),
      ) as AttendanceRow[];
      return rows.map(toAttendanceStatusMark);
    },

    async saveStatusPeriod(key: PeriodKey, marks: AttendanceStatusMark[]): Promise<void> {
      if (marks.length === 0) {
        return;
      }
      const rows = marks.map((mark) => fromAttendanceStatusMark(key, mark));
      expectOk(
        await client
          .from('attendance')
          .upsert(rows, { onConflict: ATTENDANCE_CONFLICT_TARGET }),
      );
    },
  };
}
