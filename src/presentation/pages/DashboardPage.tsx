/**
 * Connected page wrapper for DashboardView.
 *
 * Performance: instead of ~45 separate client queries (notably an N+1 loop over
 * students), this fetches ALL dashboard data in ONE round trip via the
 * `get_dashboard_data` Postgres RPC. The single result is cached with
 * useDataCache and sliced out to the DashboardView's data-provider methods, so
 * the view stays unchanged while every "load*" call resolves from one payload.
 */

import { useMemo } from 'react';
import DashboardView, {
  type DashboardDataProvider,
  type DashboardSummary,
  type AttendanceTrendPoint,
} from '@presentation/views/DashboardView';
import { useDataCache } from '@presentation/hooks';
import { supabase } from '@data/supabase';
import type { TimetableEntry, DayOfWeek } from '@domain/services/timetableService';
import type { LeaderboardWeights, StudentMetrics } from '@domain/services/leaderboardService';

// ---------------------------------------------------------------------------
// Shape of the single RPC payload
// ---------------------------------------------------------------------------

interface DashboardData {
  summary: DashboardSummary;
  timetableEntries: TimetableEntry[];
  studentMetrics: StudentMetrics[];
  attendanceTrend: AttendanceTrendPoint[];
  weights: LeaderboardWeights;
}

const EMPTY_DATA: DashboardData = {
  summary: {
    totalStudents: 0,
    avgAttendancePercent: 0,
    avgInternalMarks: 0,
    syllabusProgressPercent: 0,
  },
  timetableEntries: [],
  studentMetrics: [],
  attendanceTrend: [],
  weights: { internalMarks: 0, quizScores: 0, attendance: 0 },
};

/** Last N days as an ISO date string. */
function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch the entire dashboard in one RPC round trip. The RPC enforces the
 * teacher-only guard server-side and returns a zeroed payload otherwise.
 */
async function fetchDashboardData(): Promise<DashboardData> {
  const { data, error } = await supabase.rpc('get_dashboard_data', {
    p_from_date: daysAgoIso(30),
    p_to_date: new Date().toISOString().slice(0, 10),
  });

  if (error || !data) {
    return EMPTY_DATA;
  }

  // The RPC returns a JSON object already shaped in camelCase.
  const payload = data as Partial<DashboardData>;
  return {
    summary: payload.summary ?? EMPTY_DATA.summary,
    timetableEntries: (payload.timetableEntries ?? []).map((e) => ({
      ...e,
      dayOfWeek: e.dayOfWeek as DayOfWeek,
    })),
    studentMetrics: payload.studentMetrics ?? [],
    attendanceTrend: payload.attendanceTrend ?? [],
    weights: payload.weights ?? EMPTY_DATA.weights,
  };
}

export default function DashboardPage() {
  // One cached fetch for the whole dashboard (60s stale-while-revalidate).
  const { data } = useDataCache<DashboardData>({
    key: 'dashboard-data',
    fetcher: fetchDashboardData,
    ttlMs: 60_000,
  });

  const resolved = data ?? EMPTY_DATA;

  // Build a data-provider whose methods just slice the single payload —
  // no extra network calls. Memoized so DashboardView sees a stable reference.
  const dataProvider = useMemo<DashboardDataProvider>(
    () => ({
      async loadSummary() {
        return resolved.summary;
      },
      async loadTimetableEntries() {
        return resolved.timetableEntries;
      },
      async loadAttendanceTrend() {
        return resolved.attendanceTrend;
      },
      async loadStudentMetrics() {
        return resolved.studentMetrics;
      },
      async loadWeights() {
        return resolved.weights;
      },
    }),
    [resolved],
  );

  return <DashboardView dataProvider={dataProvider} />;
}
