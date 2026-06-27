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
  type PeriodKey,
} from '../../domain/services/attendanceService';
import { fromAttendanceMark, toAttendanceMark, type AttendanceRow } from './rows';
import { expectOk, unwrapList } from './support';

export { liveCounts };

/** The unique-key columns Supabase uses to upsert one row per student/period. */
const ATTENDANCE_CONFLICT_TARGET = 'student_id,section_id,subject_id,date,time_slot';

/** Supabase-backed attendance persistence (mirrors the domain contract). */
export interface AttendanceAccess {
  loadPeriod(key: PeriodKey): Promise<AttendanceMark[]>;
  savePeriod(key: PeriodKey, marks: AttendanceMark[]): Promise<void>;
}

/** Create an {@link AttendanceAccess} bound to the given Supabase client. */
export function createAttendanceAccess(
  client: SupabaseClient = defaultClient,
): AttendanceAccess {
  return {
    async loadPeriod(key: PeriodKey): Promise<AttendanceMark[]> {
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
    },

    async savePeriod(key: PeriodKey, marks: AttendanceMark[]): Promise<void> {
      if (marks.length === 0) {
        return;
      }
      const rows = marks.map((mark) => fromAttendanceMark(key, mark));
      expectOk(
        await client
          .from('attendance')
          .upsert(rows, { onConflict: ATTENDANCE_CONFLICT_TARGET }),
      );
    },
  };
}
