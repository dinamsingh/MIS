/**
 * Form skeleton loading state.
 * Used for Syllabus Tracker, Quiz Creation, and other form-heavy pages.
 */

import SkeletonPulse from './SkeletonPulse';

interface FormSkeletonProps {
  /** Number of field groups to render (default: 5) */
  fields?: number;
}

export default function FormSkeleton({ fields = 5 }: FormSkeletonProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <SkeletonPulse width="w-52" height="h-7" />
        <SkeletonPulse width="w-24" height="h-9" rounded="button" />
      </div>

      {/* Form card */}
      <div className="card p-6 flex flex-col gap-5">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            {/* Label */}
            <SkeletonPulse width="w-28" height="h-3" />
            {/* Input field */}
            <SkeletonPulse
              width="w-full"
              height={i === fields - 1 ? 'h-24' : 'h-10'}
              rounded="button"
            />
          </div>
        ))}

        {/* Action buttons row */}
        <div className="flex items-center gap-3 pt-4 border-t border-border/50">
          <SkeletonPulse width="w-28" height="h-10" rounded="button" />
          <SkeletonPulse width="w-20" height="h-10" rounded="button" />
        </div>
      </div>
    </div>
  );
}
