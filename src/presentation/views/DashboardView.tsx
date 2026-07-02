/**
 * Dashboard module view.
 *
 * Presentation-only dashboard shell. Data continues to arrive through the
 * DashboardDataProvider interface so Supabase, routing, and business logic stay
 * outside this redesign phase.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { messages } from '@domain/shared/messages';
import { isAtRisk, classAverage } from '@domain/services/analyticsService';
import { todaysClasses, type DayOfWeek, type TimetableEntry } from '@domain/services/timetableService';
import { combinedScore, type LeaderboardWeights, type StudentMetrics } from '@domain/services/leaderboardService';
import { DashboardSkeleton } from '@presentation/components/skeletons';
import SkeletonPulse from '@presentation/components/skeletons/SkeletonPulse';
import {
  DashboardEmptyState,
  DashboardStatCard,
  PendingTasks,
  QuickActions,
  StudentDirectoryModal,
  TodaySchedule,
  scheduleFromEntries,
  type PendingTask,
  type QuickAction,
} from '@presentation/components/dashboard/DashboardWidgets';

const DashboardCharts = lazy(() => import('@presentation/components/dashboard/DashboardCharts'));

export interface AttendanceTrendPoint {
  readonly date: string;
  readonly percent: number;
}

export interface DashboardSummary {
  readonly totalStudents: number;
  readonly avgAttendancePercent: number;
  readonly avgInternalMarks: number;
  readonly syllabusProgressPercent: number;
}

export interface DashboardDataProvider {
  loadSummary(): Promise<DashboardSummary>;
  loadTimetableEntries(): Promise<TimetableEntry[]>;
  loadAttendanceTrend(fromDate: string, toDate: string): Promise<AttendanceTrendPoint[]>;
  loadStudentMetrics(): Promise<StudentMetrics[]>;
  loadWeights(): Promise<LeaderboardWeights>;
}

export interface DashboardViewProps {
  dataProvider: DashboardDataProvider;
  performanceThreshold?: number;
  subjectNames?: Record<string, string>;
  sectionNames?: Record<string, string>;
}

function getDayOfWeek(): DayOfWeek {
  const days: DayOfWeek[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  return days[new Date().getDay()];
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d);
}

function chartFallback() {
  return (
    <div className="grid grid-cols-1 gap-5" aria-label="Loading dashboard charts">
      <div className="card p-5">
        <SkeletonPulse width="w-40" height="h-4" className="mb-2" />
        <SkeletonPulse width="w-56" height="h-3" className="mb-6" />
        <SkeletonPulse width="w-full" height="h-52" />
      </div>
    </div>
  );
}

export default function DashboardView({
  dataProvider,
  performanceThreshold = 60,
  subjectNames = {},
  sectionNames = {},
}: DashboardViewProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [trendPoints, setTrendPoints] = useState<AttendanceTrendPoint[]>([]);
  const [studentMetrics, setStudentMetrics] = useState<StudentMetrics[]>([]);
  const [weights, setWeights] = useState<LeaderboardWeights>({
    internalMarks: 1,
    quizScores: 1,
    attendance: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState('All');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [loadedSummary, entries, metrics, loadedWeights] = await Promise.all([
        dataProvider.loadSummary(),
        dataProvider.loadTimetableEntries(),
        dataProvider.loadStudentMetrics(),
        dataProvider.loadWeights(),
      ]);
      setSummary(loadedSummary);
      setTimetableEntries(entries);
      setStudentMetrics(metrics);
      setWeights(loadedWeights);
    } catch {
      setSummary({
        totalStudents: 0,
        avgAttendancePercent: 0,
        avgInternalMarks: 0,
        syllabusProgressPercent: 0,
      });
      setTimetableEntries([]);
      setStudentMetrics([]);
    } finally {
      setIsLoading(false);
    }
  }, [dataProvider]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const from = daysAgo(42);
    const to = toISODate(new Date());
    dataProvider.loadAttendanceTrend(from, to).then(setTrendPoints).catch(() => setTrendPoints([]));
  }, [dataProvider]);

  const todayClasses = useMemo(
    () => todaysClasses(timetableEntries, getDayOfWeek()),
    [timetableEntries],
  );

  const needsAttention = useMemo(() => {
    if (studentMetrics.length === 0) return [];
    const scored = studentMetrics.map((metric) => ({
      ...metric,
      score: combinedScore(metric, weights),
    }));
    const atRisk = scored.filter((student) => {
      const averagePerformance = classAverage([
        student.internalMarks,
        student.quizScore,
        student.attendancePercent,
      ]);
      return isAtRisk(averagePerformance, performanceThreshold);
    });
    atRisk.sort((a, b) => a.score - b.score);
    return atRisk;
  }, [studentMetrics, weights, performanceThreshold]);

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return studentMetrics.filter((student) => {
      const matchesSearch =
        query.length === 0 ||
        student.name.toLowerCase().includes(query) ||
        (student.enrollmentNumber || '').toLowerCase().includes(query);
      const matchesSection =
        selectedSectionFilter === 'All' || student.sectionName === selectedSectionFilter;
      return matchesSearch && matchesSection;
    });
  }, [studentMetrics, searchQuery, selectedSectionFilter]);

  const sectionOptions = useMemo(
    () => Array.from(new Set(studentMetrics.map((student) => student.sectionName).filter(Boolean))).sort() as string[],
    [studentMetrics],
  );

  const getClassStatus = useCallback((entry: TimetableEntry, index: number): 'done' | 'next' | 'upcoming' => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const match = entry.timeSlot.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      const slotMinutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      if (currentMinutes > slotMinutes + 50) return 'done';
      if (currentMinutes >= slotMinutes - 10) return 'next';
    }
    if (index === 0) return 'done';
    if (index === 1) return 'next';
    return 'upcoming';
  }, []);

  const resolvedSummary = summary ?? {
    totalStudents: 0,
    avgAttendancePercent: 0,
    avgInternalMarks: 0,
    syllabusProgressPercent: 0,
  };

  const subjectCount = useMemo(
    () => new Set(timetableEntries.map((entry) => entry.subjectId)).size,
    [timetableEntries],
  );

  const averageQuizScore = useMemo(() => {
    if (studentMetrics.length === 0) return 0;
    return studentMetrics.reduce((sum, student) => sum + student.quizScore, 0) / studentMetrics.length;
  }, [studentMetrics]);

  const pendingAssignments = needsAttention.length;
  const scheduleItems = useMemo(
    () => scheduleFromEntries(todayClasses, subjectNames, sectionNames, getClassStatus),
    [getClassStatus, sectionNames, subjectNames, todayClasses],
  );

  const pendingTasks = useMemo<PendingTask[]>(
    () => [
      {
        id: 'attention',
        label: 'Students need attention',
        detail: 'Review attendance, marks, or quiz performance.',
        count: needsAttention.length,
        tone: needsAttention.length > 0 ? 'red' : 'green',
      },
      {
        id: 'syllabus',
        label: 'Syllabus remaining',
        detail: 'Complete planned topics for this section.',
        count: Math.max(0, Math.round(100 - resolvedSummary.syllabusProgressPercent)),
        tone: resolvedSummary.syllabusProgressPercent >= 80 ? 'green' : 'amber',
      },
      {
        id: 'classes',
        label: 'Classes today',
        detail: 'Prepare attendance and class material.',
        count: todayClasses.length,
        tone: 'blue',
      },
    ],
    [needsAttention.length, resolvedSummary.syllabusProgressPercent, todayClasses.length],
  );

  const quickActions = useMemo<QuickAction[]>(
    () => [
      { label: 'Take Attendance', description: 'Mark today\'s class quickly.', href: '/attendance', icon: 'A', tone: 'green' },
      { label: 'Upload Material', description: 'Share notes and resources.', href: '/material', icon: 'M', tone: 'blue' },
      { label: 'Create Quiz', description: 'Publish a new assessment.', href: '/quizzes', icon: 'Q', tone: 'neutral' },
      { label: 'View Reports', description: 'Open analytics insights.', href: '/analytics', icon: 'R', tone: 'amber' },
      { label: 'Add Students', description: 'Manage roster imports.', href: '/roster', icon: 'S', tone: 'red' },
    ],
    [],
  );

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <DashboardStatCard
          icon="S"
          label="Students"
          value={resolvedSummary.totalStudents}
          trend="view list"
          trendDirection="flat"
          tone="blue"
          description="Current roster size"
          onClick={() => setShowStudentsModal(true)}
        />
        <DashboardStatCard
          icon="A"
          label="Attendance"
          value={resolvedSummary.avgAttendancePercent}
          suffix="%"
          precision={1}
          trend={resolvedSummary.avgAttendancePercent >= 75 ? 'healthy' : 'review'}
          trendDirection={resolvedSummary.avgAttendancePercent >= 75 ? 'up' : 'down'}
          tone={resolvedSummary.avgAttendancePercent >= 75 ? 'green' : 'amber'}
          description="Average class attendance"
        />
        <DashboardStatCard
          icon="B"
          label="Subjects"
          value={subjectCount}
          trend="active"
          tone="neutral"
          description="From timetable entries"
        />
        <DashboardStatCard
          icon="P"
          label="Assignments Pending"
          value={pendingAssignments}
          trend={pendingAssignments > 0 ? 'due soon' : 'clear'}
          trendDirection={pendingAssignments > 0 ? 'down' : 'up'}
          tone={pendingAssignments > 0 ? 'red' : 'green'}
          description="Follow-up workload"
        />
        <DashboardStatCard
          icon="Q"
          label="Quiz Average"
          value={averageQuizScore}
          precision={1}
          trend="class signal"
          tone="amber"
          description="Average quiz score"
        />
        <DashboardStatCard
          icon="M"
          label="Syllabus"
          value={resolvedSummary.syllabusProgressPercent}
          suffix="%"
          precision={0}
          trend={resolvedSummary.syllabusProgressPercent >= 80 ? 'on track' : 'pending'}
          trendDirection={resolvedSummary.syllabusProgressPercent >= 80 ? 'up' : 'flat'}
          tone={resolvedSummary.syllabusProgressPercent >= 80 ? 'green' : 'blue'}
          description="Completion progress"
        />
      </div>

      <Suspense fallback={chartFallback()}>
        <DashboardCharts
          trendPoints={trendPoints}
        />
      </Suspense>

      <QuickActions actions={quickActions} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <TodaySchedule classes={scheduleItems} />
        <PendingTasks tasks={pendingTasks} />
      </div>

      {studentMetrics.length === 0 && (
        <DashboardEmptyState
          title="Dashboard is ready for data"
          message={messages.emptyState.noStudents}
          actionLabel="Open roster"
        />
      )}

      {showStudentsModal && (
        <StudentDirectoryModal
          students={studentMetrics}
          filteredStudents={filteredStudents}
          searchQuery={searchQuery}
          selectedSectionFilter={selectedSectionFilter}
          sectionOptions={sectionOptions}
          onSearchChange={setSearchQuery}
          onSectionChange={setSelectedSectionFilter}
          onClose={() => {
            setShowStudentsModal(false);
            setSearchQuery('');
            setSelectedSectionFilter('All');
          }}
        />
      )}
    </section>
  );
}
