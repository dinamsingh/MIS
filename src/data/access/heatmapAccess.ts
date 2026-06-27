/**
 * Heatmap data-access wrapper (task 16.2).
 *
 * Binds the pure `heatmapService` to the `attendance` table: it loads
 * attendance rows and aggregates them into per-student tallies and per-day
 * heat levels, then the re-exported pure functions compute the attendance
 * percentage, the day-cell heat level, and the defaulter list. Because the
 * aggregation is recomputed from the loaded rows on every call, a load after
 * attendance changes yields the updated defaulter list (Requirements 13.1–13.4).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import {
  attendancePercent,
  defaulters,
  dayHeatLevel,
  DEFAULTER_THRESHOLD,
  type StudentAttendance,
} from '../../domain/services/heatmapService';
import type { AttendanceMark } from '../../domain/services/attendanceService';
import { unwrapList } from './support';

export {
  attendancePercent,
  defaulters,
  dayHeatLevel,
  DEFAULTER_THRESHOLD,
  type StudentAttendance,
};

/** Supabase-backed heatmap operations. */
export interface HeatmapAccess {
  /**
   * Aggregate every attendance row for a section into per-student tallies of
   * attended vs total held periods (Requirement 13.2).
   */
  loadStudentAttendance(sectionId: string): Promise<StudentAttendance[]>;
  /**
   * The defaulter list for a section: students below the 75 percent threshold,
   * recomputed from current attendance (Requirements 13.3, 13.4).
   */
  loadDefaulters(sectionId: string): Promise<string[]>;
  /**
   * The per-day heat levels for a section, keyed by ISO date, each aggregated
   * across that day's recorded marks (Requirement 13.1).
   */
  loadDayHeatLevels(sectionId: string): Promise<Record<string, number>>;
}

interface AttendanceHeatRow {
  readonly student_id: string;
  readonly date: string;
  readonly present: boolean;
}

/** Create a {@link HeatmapAccess} bound to the given Supabase client. */
export function createHeatmapAccess(client: SupabaseClient = defaultClient): HeatmapAccess {
  async function loadRows(sectionId: string): Promise<AttendanceHeatRow[]> {
    return unwrapList(
      await client
        .from('attendance')
        .select('student_id, date, present')
        .eq('section_id', sectionId),
    ) as AttendanceHeatRow[];
  }

  function aggregateByStudent(rows: AttendanceHeatRow[]): StudentAttendance[] {
    const tallies = new Map<string, { attended: number; total: number }>();
    for (const row of rows) {
      const tally = tallies.get(row.student_id) ?? { attended: 0, total: 0 };
      tally.total += 1;
      if (row.present) {
        tally.attended += 1;
      }
      tallies.set(row.student_id, tally);
    }
    return Array.from(tallies.entries()).map(([studentId, tally]) => ({
      studentId,
      attendedPeriods: tally.attended,
      totalHeldPeriods: tally.total,
    }));
  }

  return {
    async loadStudentAttendance(sectionId: string): Promise<StudentAttendance[]> {
      return aggregateByStudent(await loadRows(sectionId));
    },

    async loadDefaulters(sectionId: string): Promise<string[]> {
      return defaulters(aggregateByStudent(await loadRows(sectionId)));
    },

    async loadDayHeatLevels(sectionId: string): Promise<Record<string, number>> {
      const rows = await loadRows(sectionId);
      const marksByDay = new Map<string, AttendanceMark[]>();
      for (const row of rows) {
        const marks = marksByDay.get(row.date) ?? [];
        marks.push({ studentId: row.student_id, present: row.present });
        marksByDay.set(row.date, marks);
      }
      const levels: Record<string, number> = {};
      for (const [date, marks] of marksByDay.entries()) {
        levels[date] = dayHeatLevel(marks);
      }
      return levels;
    },
  };
}
