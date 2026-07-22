import { useMemo } from 'react';
import DashboardView, {
  type DashboardDataProvider,
  type DashboardSummary,
  type AttendanceTrendPoint,
} from '@presentation/views/DashboardView';
import StaleAssignmentBanner from '../../features/onboarding/components/StaleAssignmentBanner';
import { useDataCache } from '@presentation/hooks';
import {
  buildDemoAttendanceTrend,
  buildDemoStudentMetrics,
  createLocalDemoTimetableAccess,
  isLocalDemoMode,
  loadDemoLeaderboardConfig,
  type DemoSubject,
} from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { loadRosterStudentsForSection } from '@presentation/loaders/rosterStudents';
import { loadSubjectNameMapForSection, loadSubjectOptionsForSection } from '@presentation/loaders/subjectOptions';
import { formatSectionLabel } from '@presentation/format/sectionLabel';
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
  subjectNames: Record<string, string>;
  sectionNames: Record<string, string>;
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
  subjectNames: {},
  sectionNames: {},
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
  const [rpcResult, subjectNames] = await Promise.all([
    supabase.rpc('get_dashboard_data', {
      p_from_date: daysAgoIso(30),
      p_to_date: new Date().toISOString().slice(0, 10),
      p_semester: section.semester,
      p_section_id: section.id,
    }),
    loadSubjectNameMapForSection(section),
  ]);

  const { data, error } = rpcResult;
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
    subjectNames,
    sectionNames: { [section.id]: formatSectionLabel(section) },
  };
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function loadDemoSubjects(section: Section): Promise<DemoSubject[]> {
  return loadSubjectOptionsForSection(section);
}

async function fetchDemoDashboardData(section: Section): Promise<DashboardData> {
  const [students, subjects] = await Promise.all([
    loadRosterStudentsForSection(section),
    loadDemoSubjects(section),
  ]);
  const studentMetrics = buildDemoStudentMetrics(students);
  const timetable = createLocalDemoTimetableAccess(() => subjects);
  const timetableEntries = await timetable.listEntries(section.id);
  const avgAttendancePercent = average(studentMetrics.map((student) => student.attendancePercent));
  const avgInternalMarks = average(studentMetrics.map((student) => student.internalMarks));

  return {
    summary: {
      totalStudents: students.length,
      avgAttendancePercent,
      avgInternalMarks,
      syllabusProgressPercent: Math.round(average(studentMetrics.map((student) => student.quizScore))),
    },
    timetableEntries,
    studentMetrics,
    attendanceTrend: buildDemoAttendanceTrend(section.id),
    weights: loadDemoLeaderboardConfig().weights,
    subjectNames: Object.fromEntries(subjects.map((subject) => [subject.id, subject.name])),
    sectionNames: { [section.id]: formatSectionLabel(section) },
  };
}

export default function DashboardPage() {
  const { selectedSection } = useSelectedSection();

  // Cache key includes the section id so data stays distinct per selection.
  const { data } = useDataCache<DashboardData>({
    key: `dashboard-data-${selectedSection?.id ?? 'none'}`,
    fetcher: () =>
      selectedSection
        ? isLocalDemoMode()
          ? fetchDemoDashboardData(selectedSection)
          : fetchDashboardData(selectedSection)
        : Promise.resolve(EMPTY_DATA),
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

  return (
    <div className="flex flex-col gap-4">
      <StaleAssignmentBanner />
      <DashboardView
        key={selectedSection?.id ?? 'none'}
        dataProvider={dataProvider}
        subjectNames={resolved.subjectNames}
        sectionNames={resolved.sectionNames}
      />
    </div>
  );
}
