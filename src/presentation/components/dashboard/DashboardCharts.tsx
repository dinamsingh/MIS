import { memo, useMemo } from 'react';
import type { AttendanceTrendPoint } from '@presentation/views/DashboardView';
import { DashboardEmptyState } from './DashboardWidgets';

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function SectionTitle({
  title,
  detail,
  action,
}: {
  readonly title: string;
  readonly detail: string;
  readonly action?: { readonly label: string; readonly href: string };
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-card-title">{title}</h2>
        <p className="mt-1 text-xs text-muted">{detail}</p>
      </div>
      {action && (
        <a
          href={action.href}
          className="shrink-0 rounded-button border border-border bg-surface px-3 py-2 text-xs font-semibold text-accent shadow-sm transition-colors hover:bg-accent-tint focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          {action.label}
        </a>
      )}
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
      <SectionTitle
        title="Attendance Trend"
        detail="Average attendance across the recent window."
        action={{ label: 'Smart Analytics', href: '/analytics' }}
      />
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

export default function DashboardCharts({
  trendPoints,
}: {
  readonly trendPoints: readonly AttendanceTrendPoint[];
}) {
  return (
    <div className="grid grid-cols-1 gap-5">
      <AttendanceTrendChart points={trendPoints} />
    </div>
  );
}
