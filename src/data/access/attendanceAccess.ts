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
  liveCounts,
  type AttendanceMark,
  type AttendanceStatusMark,
  type PeriodKey,
  statusFromAttendanceMark,
  statusToAttendanceMark,
} from '../../domain/services/attendanceService';
import { fromAttendanceMark, toAttendanceMark, type AttendanceRow } from './rows';
import { expectOk, unwrapList } from './support';

export { liveCounts };

/** The unique-key columns Supabase uses to upsert one row per student/period. */
const ATTENDANCE_CONFLICT_TARGET = 'student_id,section_id,subject_id,date,time_slot';
const ATTENDANCE_STATUS_STORAGE_KEY = 'mis_attendance_status_v1';

/** Supabase-backed attendance persistence (mirrors the domain contract). */
export interface AttendanceAccess {
  loadPeriod(key: PeriodKey): Promise<AttendanceMark[]>;
  savePeriod(key: PeriodKey, marks: AttendanceMark[]): Promise<void>;
  loadStatusPeriod(key: PeriodKey): Promise<AttendanceStatusMark[]>;
  saveStatusPeriod(key: PeriodKey, marks: AttendanceStatusMark[]): Promise<void>;
}

interface LocalStatusStore {
  readonly periods: Record<string, AttendanceStatusMark[]>;
}

function statusPeriodKey(key: PeriodKey): string {
  return JSON.stringify([key.sectionId, key.subjectId, key.date, key.timeSlot]);
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

function writeStatusStore(store: LocalStatusStore): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(ATTENDANCE_STATUS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Local status labels are a compatibility layer; Supabase remains the
    // authoritative store for countable present/absent marks.
  }
}

function saveLocalStatusPeriod(key: PeriodKey, marks: AttendanceStatusMark[]): void {
  const store = readStatusStore();
  writeStatusStore({
    periods: {
      ...store.periods,
      [statusPeriodKey(key)]: marks.map((mark) => ({ ...mark })),
    },
  });
}

function loadLocalStatusPeriod(key: PeriodKey): AttendanceStatusMark[] {
  return readStatusStore().periods[statusPeriodKey(key)] ?? [];
}

/** Create an {@link AttendanceAccess} bound to the given Supabase client. */
export function createAttendanceAccess(
  client: SupabaseClient = defaultClient,
): AttendanceAccess {
  async function loadPeriod(key: PeriodKey): Promise<AttendanceMark[]> {
      const rows = unwrapList(
        await client
          .from('attendance')
          .select('student_id, section_id, subject_id, date, time_slot, present')
          .eq('section_id', key.sectionId)
          .eq('subject_id', key.subjectId)
          .eq('date', key.date)
          .eq('time_slot', key.timeSlot),
      ) as AttendanceRow[];
      return rows.map(toAttendanceMark);
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

  return {
    loadPeriod,
    savePeriod,

    async loadStatusPeriod(key: PeriodKey): Promise<AttendanceStatusMark[]> {
      const storedStatuses = loadLocalStatusPeriod(key);
      const statusByStudent = new Map(storedStatuses.map((mark) => [mark.studentId, mark.status]));
      const rows = await loadPeriod(key);
      const merged = rows.map((mark) => {
        const storedStatus = statusByStudent.get(mark.studentId);
        return storedStatus
          ? { studentId: mark.studentId, status: storedStatus }
          : statusFromAttendanceMark(mark);
      });

      const rowIds = new Set(rows.map((mark) => mark.studentId));
      for (const localStatus of storedStatuses) {
        if (!rowIds.has(localStatus.studentId)) {
          merged.push(localStatus);
        }
      }
      return merged;
    },

    async saveStatusPeriod(key: PeriodKey, marks: AttendanceStatusMark[]): Promise<void> {
      saveLocalStatusPeriod(key, marks);

      const billableMarks = marks
        .map(statusToAttendanceMark)
        .filter((mark): mark is AttendanceMark => mark !== null);
      const excludedStudentIds = marks
        .filter((mark) => mark.status === 'leave' || mark.status === 'not-applicable')
        .map((mark) => mark.studentId);

      if (billableMarks.length > 0) {
        await savePeriod(key, billableMarks);
      }

      if (excludedStudentIds.length > 0) {
        expectOk(
          await client
            .from('attendance')
            .delete()
            .eq('section_id', key.sectionId)
            .eq('subject_id', key.subjectId)
            .eq('date', key.date)
            .eq('time_slot', key.timeSlot)
            .in('student_id', excludedStudentIds),
        );
      }
    },
  };
}
