/**
 * Skeleton loading state for the Dashboard page.
 * Matches DashboardView layout: greeting header, 5 stat cards, chart area, bottom row.
 */

import SkeletonPulse from './SkeletonPulse';

export default function DashboardSkeleton() {
  return (
    <section className="flex flex-col gap-6">
      {/* Greeting header */}
      <div className="flex flex-col gap-2">
        <SkeletonPulse width="w-64" height="h-7" />
        <SkeletonPulse width="w-96" height="h-4" />
      </div>

      {/* 5 stat cards row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card flex flex-col gap-3 p-4">
            <SkeletonPulse width="w-20" height="h-3" />
            <SkeletonPulse width="w-16" height="h-8" />
          </div>
        ))}
      </div>

      {/* Attendance trend chart area */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <SkeletonPulse width="w-36" height="h-4" />
          <SkeletonPulse width="w-20" height="h-3" />
        </div>
        <div className="flex items-end gap-3 h-40">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <SkeletonPulse width="w-8" height="h-3" rounded="button" />
              <SkeletonPulse
                width="w-8"
                height={`h-${[20, 28, 16, 32, 24, 20][i]}`}
                rounded="button"
                className="mt-auto"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom row: needs attention + today's classes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Needs attention list */}
        <div className="card p-5 lg:col-span-2">
          <SkeletonPulse width="w-36" height="h-4" className="mb-4" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-button bg-background px-3 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <SkeletonPulse width="w-7" height="h-7" rounded="full" />
                  <SkeletonPulse width="w-32" height="h-4" />
                </div>
                <SkeletonPulse width="w-12" height="h-5" rounded="button" />
              </div>
            ))}
          </div>
        </div>

        {/* Today's classes */}
        <div className="card p-5 lg:col-span-1">
          <SkeletonPulse width="w-32" height="h-4" className="mb-4" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-button bg-background p-3">
                <div className="flex items-center justify-between mb-2">
                  <SkeletonPulse width="w-24" height="h-4" />
                  <SkeletonPulse width="w-16" height="h-5" rounded="button" />
                </div>
                <SkeletonPulse width="w-40" height="h-3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
