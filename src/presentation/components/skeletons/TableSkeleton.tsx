/**
 * Generic table skeleton loading state.
 * Reusable for Attendance, Marks, Leaderboard, and Quizzes pages.
 * Renders a pulsing table header + configurable number of rows.
 */

import SkeletonPulse from './SkeletonPulse';

interface TableSkeletonProps {
  /** Number of rows to render (default: 8) */
  rows?: number;
  /** Number of columns (default: 5) */
  columns?: number;
}

export default function TableSkeleton({ rows = 8, columns = 5 }: TableSkeletonProps) {
  return (
    <div className="card overflow-hidden">
      {/* Toolbar area */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <SkeletonPulse width="w-48" height="h-8" rounded="button" />
        <div className="flex gap-2">
          <SkeletonPulse width="w-24" height="h-8" rounded="button" />
          <SkeletonPulse width="w-24" height="h-8" rounded="button" />
        </div>
      </div>

      {/* Table header */}
      <div className="grid gap-4 px-4 py-3 border-b border-border" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonPulse key={i} width="w-full" height="h-3" />
        ))}
      </div>

      {/* Table rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="grid gap-4 px-4 py-3 border-b border-border/50 last:border-b-0"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map((_, colIdx) => (
            <SkeletonPulse
              key={colIdx}
              width={colIdx === 0 ? 'w-3/4' : 'w-full'}
              height="h-4"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
