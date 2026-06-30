import { useMemo } from 'react';
import DashboardView, {
  type DashboardDataProvider,
  type DashboardSummary,
  type AttendanceTrendPoint,
} from '@presentation/views/DashboardView';
import { useDataCache } from '@presentation/hooks';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import type { Section } from '@data/access/rows';
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
 * Fetch the entire dashboard in one RPC round trip for the selected section.
 *
 * Timetable entries are scoped to the selected section by its id, and the
 * semester-level summaries use the section's semester — no name matching.
 */
async function fetchDashboardData(section: Section): Promise<DashboardData> {
  const { data, error } = await supabase.rpc('get_dashboard_data', {
    p_from_date: daysAgoIso(30),
    p_to_date: new Date().toISOString().slice(0, 10),
    p_semester: section.semester,
    p_section_id: section.id,
  });

  if (error || !data) {
    return EMPTY_DATA;
  }

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
  const { selectedSection } = useSelectedSection();

  // Cache key includes the section id so data stays distinct per selection.
  const { data } = useDataCache<DashboardData>({
    key: `dashboard-data-${selectedSection?.id ?? 'none'}`,
    fetcher: () => (selectedSection ? fetchDashboardData(selectedSection) : Promise.resolve(EMPTY_DATA)),
    ttlMs: 60_000,
  });

  const resolved = data ?? EMPTY_DATA;

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

  return <DashboardView key={selectedSection?.id ?? 'none'} dataProvider={dataProvider} />;
}
