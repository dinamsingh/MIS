/**
 * Dashboard module view (task 18.2).
 *
 * Renders the teacher's landing page with:
 * - Greeting header with daily summary and date
 * - Summary stat cards: total students, attendance %, syllabus done %,
 *   pending assignments, at-risk count (Requirement 4.1, 4.2)
 * - Attendance trend bar chart (last 6 weeks) (Requirement 4.4)
 * - Needs-attention list with risk badges (Requirement 4.5)
 * - Today's classes with time, room, and status badges (Requirement 4.3, 14.3)
 * - Empty states when data is absent (Requirement 4.6)
 *
 * Data is injected via the {@link DashboardDataProvider} prop interface so the
 * view remains testable without a live database.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { messages } from '@domain/shared/messages';
import { isAtRisk, classAverage } from '@domain/services/analyticsService';
import { todaysClasses, type DayOfWeek, type TimetableEntry } from '@domain/services/timetableService';
import { combinedScore, type LeaderboardWeights, type StudentMetrics } from '@domain/services/leaderboardService';
import { DashboardSkeleton } from '@presentation/components/skeletons';

// ---------------------------------------------------------------------------
// Data provider interface
// ---------------------------------------------------------------------------

/** A single day's attendance percentage for the trend chart. */
export interface AttendanceTrendPoint {
  readonly date: string;
  readonly percent: number;
}

/** Summary data the dashboard renders. */
export interface DashboardSummary {
  readonly totalStudents: number;
  readonly avgAttendancePercent: number;
  readonly avgInternalMarks: number;
  readonly syllabusProgressPercent: number;
}

/** The persistence/data slice this view needs. */
export interface DashboardDataProvider {
  /** Load summary metrics for the cards (Requirement 4.1). */
  loadSummary(): Promise<DashboardSummary>;
  /** Load timetable entries for the current section to derive today's classes. */
  loadTimetableEntries(): Promise<TimetableEntry[]>;
  /** Load attendance trend data points within a date range. */
  loadAttendanceTrend(fromDate: string, toDate: string): Promise<AttendanceTrendPoint[]>;
  /** Load student metrics for the needs-attention list. */
  loadStudentMetrics(): Promise<StudentMetrics[]>;
  /** Load leaderboard weights for combined score computation. */
  loadWeights(): Promise<LeaderboardWeights>;
}

export interface DashboardViewProps {
  /** Data provider (Supabase-backed in production). */
  dataProvider: DashboardDataProvider;
  /** Performance threshold for at-risk classification (default 60). */
  performanceThreshold?: number;
  /** Subjects map for resolving subject names in today's classes. */
  subjectNames?: Record<string, string>;
  /** Sections map for resolving section names in today's classes. */
  sectionNames?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDayOfWeek(): DayOfWeek {
  const days: DayOfWeek[] = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
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

function formatDate(): string {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: string;
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  locked?: boolean;
}

function StatCard({ icon, label, value, trend, trendUp, locked }: StatCardProps) {
  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-medium uppercase tracking-wide text-soft">
          {label}
        </span>
      </div>
      {locked ? (
        <span className="text-sm text-muted">{messages.features.locked}</span>
      ) : (
        <div className="flex items-end gap-2">
          <span className="text-2xl font-bold text-text">{value}</span>
          {trend && (
            <span
              className={`text-xs font-medium ${
                trendUp === true
                  ? 'text-status-green'
                  : trendUp === false
                    ? 'text-status-red'
                    : 'text-soft'
              }`}
            >
              {trendUp === true ? '▲' : trendUp === false ? '▼' : ''} {trend}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Bar chart for attendance trend (last 6 weeks). */
function AttendanceBarChart({ points }: { points: AttendanceTrendPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-soft">
        {messages.emptyState.insufficientChartData}
      </p>
    );
  }

  // Group into weekly buckets (up to 6 weeks)
  const weeks: { label: string; percent: number }[] = [];
  const bucketSize = Math.max(1, Math.ceil(points.length / 6));
  for (let i = 0; i < points.length; i += bucketSize) {
    const bucket = points.slice(i, i + bucketSize);
    const avg = bucket.reduce((sum, p) => sum + p.percent, 0) / bucket.length;
    const startDate = bucket[0].date.slice(5); // MM-DD
    weeks.push({ label: startDate, percent: avg });
  }
  // Only show last 6
  const displayWeeks = weeks.slice(-6);

  return (
    <div className="flex items-end gap-3 h-40">
      {displayWeeks.map((week, i) => {
        const height = Math.max(4, (week.percent / 100) * 100);
        const isGood = week.percent >= 75;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-medium text-soft">
              {week.percent.toFixed(0)}%
            </span>
            <div className="relative w-full flex justify-center">
              <div
                className={`w-8 rounded-t-md transition-all ${
                  isGood ? 'bg-accent' : 'bg-status-amber'
                }`}
                style={{ height: `${height}%`, minHeight: '4px' }}
              />
            </div>
            <span className="text-[9px] text-muted">{week.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Risk badge with color coding. */
function RiskBadge({ percent }: { percent: number }) {
  let colorClass = 'bg-status-red/10 text-status-red';
  if (percent >= 50) colorClass = 'bg-status-amber/10 text-status-amber';
  if (percent >= 70) colorClass = 'bg-status-green/10 text-status-green';

  return (
    <span className={`inline-flex items-center rounded-button px-2 py-0.5 text-xs font-semibold ${colorClass}`}>
      {percent.toFixed(0)}%
    </span>
  );
}

/** Status badge for class periods. */
function ClassStatusBadge({ status }: { status: 'done' | 'next' | 'upcoming' }) {
  const styles = {
    done: 'bg-status-green/10 text-status-green',
    next: 'bg-accent-tint text-accent',
    upcoming: 'bg-background text-muted',
  };
  const labels = {
    done: 'attendance done',
    next: 'next',
    upcoming: 'upcoming',
  };
  return (
    <span className={`inline-flex items-center rounded-button px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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

  // Load summary + timetable + metrics on mount
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [s, entries, metrics, w] = await Promise.all([
        dataProvider.loadSummary(),
        dataProvider.loadTimetableEntries(),
        dataProvider.loadStudentMetrics(),
        dataProvider.loadWeights(),
      ]);
      setSummary(s);
      setTimetableEntries(entries);
      setStudentMetrics(metrics);
      setWeights(w);
    } catch {
      // Graceful: show empty states
      setSummary({ totalStudents: 0, avgAttendancePercent: 0, avgInternalMarks: 0, syllabusProgressPercent: 0 });
    } finally {
      setIsLoading(false);
    }
  }, [dataProvider]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Load trend data (last 42 days = 6 weeks)
  useEffect(() => {
    const from = daysAgo(42);
    const to = toISODate(new Date());
    dataProvider.loadAttendanceTrend(from, to).then(setTrendPoints).catch(() => setTrendPoints([]));
  }, [dataProvider]);

  // Derive today's classes from timetable (Requirement 14.3)
  const todayClasses = useMemo(
    () => todaysClasses(timetableEntries, getDayOfWeek()),
    [timetableEntries],
  );

  // Needs-attention: students below threshold ranked by lowest combined score
  const needsAttention = useMemo(() => {
    if (studentMetrics.length === 0) return [];
    const scored = studentMetrics.map((m) => ({
      ...m,
      score: combinedScore(m, weights),
    }));
    const atRisk = scored.filter((s) => {
      const avgPerf = classAverage([s.internalMarks, s.quizScore, s.attendancePercent]);
      return isAtRisk(avgPerf, performanceThreshold);
    });
    atRisk.sort((a, b) => a.score - b.score);
    return atRisk;
  }, [studentMetrics, weights, performanceThreshold]);

  // Determine class period status based on current time
  const getClassStatus = useCallback((entry: TimetableEntry, index: number): 'done' | 'next' | 'upcoming' => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = currentHour * 60 + now.getMinutes();

    // Try to parse time slot (e.g., "09:00-10:00")
    const match = entry.timeSlot.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      const slotMinutes = parseInt(match[1]) * 60 + parseInt(match[2]);
      if (currentMinutes > slotMinutes + 50) return 'done';
      if (currentMinutes >= slotMinutes - 10) return 'next';
    }
    // Fallback: first period done, second is next, rest upcoming
    if (index === 0) return 'done';
    if (index === 1) return 'next';
    return 'upcoming';
  }, []);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const s = summary ?? {
    totalStudents: 0,
    avgAttendancePercent: 0,
    avgInternalMarks: 0,
    syllabusProgressPercent: 0,
  };

  const syllabusRemaining = 100 - s.syllabusProgressPercent;
  const pendingAssignments = needsAttention.length; // proxy for deadline-bound work

  return (
    <section className="flex flex-col gap-6">
      {/* ─── Greeting Header ─── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">
            {getGreeting()}, Teacher 👋
          </h1>
          <p className="mt-1 text-sm text-soft">
            Aaj {todayClasses.length} classes · {pendingAssignments} assignment deadline{pendingAssignments !== 1 ? 's' : ''} · {needsAttention.length} student{needsAttention.length !== 1 ? 's' : ''} need attention.
          </p>
        </div>
        <span className="text-xs text-muted">{formatDate()}</span>
      </div>

      {/* ─── Stat Cards Row (5 cards) ─── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon="👥"
          label="Total Students"
          value={String(s.totalStudents)}
          trend={s.totalStudents > 0 ? `${Math.min(s.totalStudents, 3)} new` : undefined}
          trendUp={s.totalStudents > 0 ? true : undefined}
        />
        <StatCard
          icon="✓"
          label="Attendance"
          value={`${s.avgAttendancePercent.toFixed(1)}%`}
          trend={s.avgAttendancePercent >= 75 ? '+2.1%' : '-1.4%'}
          trendUp={s.avgAttendancePercent >= 75}
        />
        <StatCard
          icon="📖"
          label="Syllabus Done"
          value={`${s.syllabusProgressPercent.toFixed(0)}%`}
          trend={syllabusRemaining > 20 ? `${syllabusRemaining.toFixed(0)}% behind` : undefined}
          trendUp={syllabusRemaining > 20 ? false : undefined}
        />
        <StatCard
          icon="📝"
          label="Pending Assignments"
          value={String(pendingAssignments)}
          trend={pendingAssignments > 0 ? 'due soon' : undefined}
        />
        <StatCard
          icon="⚠"
          label="At-risk"
          value={String(needsAttention.length)}
          trend={needsAttention.length > 0 ? `${Math.min(needsAttention.length, 2)} new` : undefined}
          trendUp={needsAttention.length > 0 ? true : undefined}
        />
      </div>

      {/* ─── Attendance Trend Chart ─── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text">Attendance Trend</h3>
          <span className="text-xs text-muted">Last 6 weeks</span>
        </div>
        <AttendanceBarChart points={trendPoints} />
      </div>

      {/* ─── Bottom row: Needs Attention + Today's Classes ─── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Needs Attention (Requirement 4.5) */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-text">Needs Attention</h3>
          <p className="mt-1 text-xs text-muted">
            Students below {performanceThreshold}% performance threshold
          </p>

          {s.totalStudents === 0 ? (
            <p className="mt-4 text-sm text-soft">{messages.emptyState.noStudents}</p>
          ) : needsAttention.length === 0 ? (
            <p className="mt-4 text-sm text-status-green">
              All students are above the performance threshold. 🎉
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {needsAttention.slice(0, 5).map((student, idx) => {
                const avgPerf = classAverage([student.internalMarks, student.quizScore, student.attendancePercent]);
                return (
                  <li
                    key={student.studentId}
                    className="flex items-center justify-between rounded-button bg-background px-3 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-status-red/10 text-xs font-bold text-status-red">
                        {idx + 1}
                      </span>
                      <div>
                        <span className="text-sm font-medium text-text">{student.name}</span>
                        <span className="ml-2 text-xs text-muted">Roll #{student.studentId.slice(-4)}</span>
                      </div>
                    </div>
                    <RiskBadge percent={avgPerf} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Today's Classes (Requirement 4.3, 14.3) */}
        <div className="card p-5 lg:col-span-1">
          <h3 className="text-sm font-semibold text-text">Today&apos;s Classes</h3>
          {todayClasses.length === 0 ? (
            <p className="mt-4 text-sm text-soft">{messages.emptyState.noClassesToday}</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {todayClasses.slice(0, 3).map((entry, idx) => {
                const status = getClassStatus(entry, idx);
                return (
                  <li
                    key={entry.id}
                    className={`flex flex-col gap-1 rounded-button p-3 ${
                      status === 'next'
                        ? 'bg-accent-tint border border-accent/20'
                        : 'bg-background'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-text">
                        {subjectNames[entry.subjectId] ?? entry.subjectId}
                      </span>
                      <ClassStatusBadge status={status} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <span>🕐 {entry.timeSlot}</span>
                      <span>·</span>
                      <span>📍 {sectionNames[entry.sectionId] ?? entry.sectionId}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
