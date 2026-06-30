import { memo, useMemo } from 'react';
import type { StudentMetrics } from '@domain/services/leaderboardService';
import type { AttendanceTrendPoint } from '@presentation/views/DashboardView';
import { DashboardEmptyState } from './DashboardWidgets';

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function SectionTitle({ title, detail }: { readonly title: string; readonly detail: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-card-title">{title}</h2>
        <p className="mt-1 text-xs text-muted">{detail}</p>
      </div>
    </div>
  );
}

export const AttendanceTrendChart = memo(function AttendanceTrendChart({
  points,
}: {
  readonly points: readonly AttendanceTrendPoint[];
}) {
  const buckets = useMemo(() => {
    if (points.length === 0) return [];
    const bucketSize = Math.max(1, Math.ceil(points.length / 8));
    const result: { label: string; percent: number }[] = [];
    for (let i = 0; i < points.length; i += bucketSize) {
      const bucket = points.slice(i, i + bucketSize);
      const average = bucket.reduce((sum, point) => sum + point.percent, 0) / bucket.length;
      result.push({ label: bucket[0].date.slice(5), percent: clampPercent(average) });
    }
    return result.slice(-8);
  }, [points]);

  return (
    <section className="card p-5" aria-labelledby="attendance-trend-title">
      <SectionTitle title="Attendance Trend" detail="Average attendance across the recent window." />
      {buckets.length === 0 ? (
        <DashboardEmptyState
          title="No attendance trend yet"
          message="Attendance trend will appear after daily attendance is recorded."
          actionLabel="Take attendance"
        />
      ) : (
        <div className="mt-6 flex h-56 items-end gap-3" role="img" aria-label="Attendance trend bar chart">
          {buckets.map((bucket, index) => {
            const height = Math.max(8, bucket.percent);
            const strong = bucket.percent >= 75;
            return (
              <div key={`${bucket.label}-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <span className="text-[11px] font-semibold text-text">{bucket.percent.toFixed(0)}%</span>
                <div className="flex h-40 w-full items-end rounded-button bg-surface-muted p-1">
                  <div
                    className={[
                      'w-full rounded-sm transition-all duration-slow ease-entrance',
                      strong ? 'bg-accent' : 'bg-status-amber',
                    ].join(' ')}
                    style={{ height: `${height}%` }}
                  />
                </div>
                <span className="truncate text-[10px] text-muted">{bucket.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
});

export const MarksDistributionChart = memo(function MarksDistributionChart({
  students,
}: {
  readonly students: readonly StudentMetrics[];
}) {
  const buckets = useMemo(() => {
    const ranges = [
      { label: '0-40', min: 0, max: 40, tone: 'bg-status-red' },
      { label: '41-60', min: 41, max: 60, tone: 'bg-status-amber' },
      { label: '61-80', min: 61, max: 80, tone: 'bg-status-blue' },
      { label: '81+', min: 81, max: Number.POSITIVE_INFINITY, tone: 'bg-status-green' },
    ];
    return ranges.map((range) => ({
      ...range,
      count: students.filter((student) => student.internalMarks >= range.min && student.internalMarks <= range.max).length,
    }));
  }, [students]);
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));

  return (
    <section className="card p-5" aria-labelledby="marks-distribution-title">
      <SectionTitle title="Marks Distribution" detail="Internal marks grouped into performance bands." />
      {students.length === 0 ? (
        <DashboardEmptyState title="No marks yet" message="Marks distribution appears after internal marks are recorded." />
      ) : (
        <div className="mt-6 space-y-4" role="img" aria-label="Marks distribution chart">
          {buckets.map((bucket) => (
            <div key={bucket.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-soft">{bucket.label}</span>
                <span className="text-muted">{bucket.count}</span>
              </div>
              <div className="h-3 rounded-full bg-surface-muted">
                <div
                  className={`h-full rounded-full ${bucket.tone} transition-all duration-slow ease-entrance`}
                  style={{ width: `${Math.max(4, (bucket.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
});

export const AssignmentCompletionChart = memo(function AssignmentCompletionChart({
  pending,
  total,
}: {
  readonly pending: number;
  readonly total: number;
}) {
  const complete = Math.max(0, total - pending);
  const percent = total > 0 ? (complete / total) * 100 : 0;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampPercent(percent) / 100) * circumference;

  return (
    <section className="card p-5" aria-labelledby="assignment-completion-title">
      <SectionTitle title="Assignment Completion" detail="Completion proxy from current follow-up workload." />
      {total === 0 ? (
        <DashboardEmptyState title="No assignment signal" message="Completion data appears after assignments and submissions are tracked." />
      ) : (
        <div className="mt-5 flex items-center gap-5">
          <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120" role="img" aria-label={`Assignment completion ${percent.toFixed(0)} percent`}>
            <circle cx="60" cy="60" r={radius} fill="none" stroke="rgb(var(--color-surface-muted))" strokeWidth="12" />
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="rgb(var(--color-accent))"
              strokeLinecap="round"
              strokeWidth="12"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          </svg>
          <div>
            <p className="text-3xl font-semibold text-text">{percent.toFixed(0)}%</p>
            <p className="mt-1 text-sm text-soft">{complete} complete / {pending} pending</p>
          </div>
        </div>
      )}
    </section>
  );
});

export const StudentEngagementChart = memo(function StudentEngagementChart({
  students,
}: {
  readonly students: readonly StudentMetrics[];
}) {
  const engagement = useMemo(() => {
    if (students.length === 0) return [];
    return students.slice(0, 8).map((student) => ({
      id: student.studentId,
      name: student.name,
      value: clampPercent((student.attendancePercent + student.quizScore * 10 + student.internalMarks) / 3),
    }));
  }, [students]);

  return (
    <section className="card p-5" aria-labelledby="student-engagement-title">
      <SectionTitle title="Student Engagement" detail="Composite of attendance, quiz signal, and marks." />
      {engagement.length === 0 ? (
        <DashboardEmptyState title="No engagement data" message="Engagement appears after attendance, quizzes, and marks have data." />
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" role="list" aria-label="Student engagement summary">
          {engagement.map((item) => (
            <div key={item.id} className="rounded-card border border-border bg-background p-3" role="listitem">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-text">{item.name}</span>
                <span className="text-[11px] text-muted">{item.value.toFixed(0)}%</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-status-blue" style={{ width: `${item.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
});

export default function DashboardCharts({
  trendPoints,
  students,
  pendingAssignments,
}: {
  readonly trendPoints: readonly AttendanceTrendPoint[];
  readonly students: readonly StudentMetrics[];
  readonly pendingAssignments: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <AttendanceTrendChart points={trendPoints} />
      <MarksDistributionChart students={students} />
      <AssignmentCompletionChart pending={pendingAssignments} total={students.length} />
      <StudentEngagementChart students={students} />
    </div>
  );
}
