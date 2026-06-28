/**
 * Card grid skeleton loading state.
 * Used for Material and Assignments pages that display items in a card grid.
 */

import SkeletonPulse from './SkeletonPulse';

interface CardGridSkeletonProps {
  /** Number of card placeholders (default: 6) */
  cards?: number;
}

export default function CardGridSkeleton({ cards = 6 }: CardGridSkeletonProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Page header area */}
      <div className="flex items-center justify-between">
        <SkeletonPulse width="w-48" height="h-7" />
        <SkeletonPulse width="w-28" height="h-9" rounded="button" />
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="card flex flex-col gap-3 p-5">
            {/* Card icon / type indicator */}
            <div className="flex items-center gap-2">
              <SkeletonPulse width="w-8" height="h-8" rounded="button" />
              <SkeletonPulse width="w-16" height="h-4" rounded="button" />
            </div>
            {/* Title */}
            <SkeletonPulse width="w-full" height="h-5" />
            {/* Description lines */}
            <SkeletonPulse width="w-3/4" height="h-3" />
            <SkeletonPulse width="w-1/2" height="h-3" />
            {/* Footer meta */}
            <div className="flex items-center justify-between mt-2 pt-3 border-t border-border/50">
              <SkeletonPulse width="w-20" height="h-3" />
              <SkeletonPulse width="w-16" height="h-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
