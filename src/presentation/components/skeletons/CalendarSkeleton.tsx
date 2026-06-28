/**
 * Calendar / Heatmap skeleton loading state.
 * Renders a calendar grid placeholder matching the Heatmap page layout.
 */

import SkeletonPulse from './SkeletonPulse';

export default function CalendarSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <SkeletonPulse width="w-44" height="h-7" />
        <div className="flex gap-2">
          <SkeletonPulse width="w-8" height="h-8" rounded="button" />
          <SkeletonPulse width="w-24" height="h-8" rounded="button" />
          <SkeletonPulse width="w-8" height="h-8" rounded="button" />
        </div>
      </div>

      {/* Calendar card */}
      <div className="card p-5 flex flex-col gap-4">
        {/* Month label */}
        <SkeletonPulse width="w-28" height="h-5" />

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonPulse key={i} width="w-full" height="h-4" rounded="button" />
          ))}
        </div>

        {/* Calendar grid (5 rows × 7 days) */}
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }).map((_, i) => (
            <SkeletonPulse
              key={i}
              width="w-full"
              height="h-10"
              rounded="button"
              className={i < 3 || i > 32 ? 'opacity-30' : ''}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-2">
          <SkeletonPulse width="w-20" height="h-3" />
          <SkeletonPulse width="w-20" height="h-3" />
          <SkeletonPulse width="w-20" height="h-3" />
        </div>
      </div>
    </div>
  );
}
