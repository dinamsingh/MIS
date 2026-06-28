/**
 * Chart skeleton loading state for the Analytics page.
 * Renders two chart-sized boxes side by side.
 */

import SkeletonPulse from './SkeletonPulse';

export default function ChartSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <SkeletonPulse width="w-40" height="h-7" />
        <div className="flex gap-2">
          <SkeletonPulse width="w-28" height="h-8" rounded="button" />
          <SkeletonPulse width="w-28" height="h-8" rounded="button" />
        </div>
      </div>

      {/* Two chart boxes side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card p-5 flex flex-col gap-4">
            {/* Chart title */}
            <div className="flex items-center justify-between">
              <SkeletonPulse width="w-32" height="h-4" />
              <SkeletonPulse width="w-20" height="h-4" rounded="button" />
            </div>
            {/* Chart area */}
            <SkeletonPulse width="w-full" height="h-56" />
            {/* Legend */}
            <div className="flex gap-4">
              <SkeletonPulse width="w-16" height="h-3" />
              <SkeletonPulse width="w-16" height="h-3" />
              <SkeletonPulse width="w-16" height="h-3" />
            </div>
          </div>
        ))}
      </div>

      {/* Summary stats row below charts */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 flex flex-col gap-2">
            <SkeletonPulse width="w-20" height="h-3" />
            <SkeletonPulse width="w-12" height="h-6" />
          </div>
        ))}
      </div>
    </div>
  );
}
