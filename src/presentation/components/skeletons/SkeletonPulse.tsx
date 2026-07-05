/**
 * Generic animated skeleton block with configurable dimensions.
 * Uses the shared shimmer animation with bg-border/60 and rounded styling.
 * Pure presentational — no data, no hooks.
 */

interface SkeletonPulseProps {
  /** Width class or inline value (default: "w-full") */
  width?: string;
  /** Height class or inline value (default: "h-4") */
  height?: string;
  /** Additional Tailwind classes */
  className?: string;
  /** Whether to use rounded-card (default) or rounded-full for circular shapes */
  rounded?: 'card' | 'full' | 'button';
}

export default function SkeletonPulse({
  width = 'w-full',
  height = 'h-4',
  className = '',
  rounded = 'card',
}: SkeletonPulseProps) {
  const roundedClass =
    rounded === 'full'
      ? 'rounded-full'
      : rounded === 'button'
        ? 'rounded-button'
        : 'rounded-card';

  return (
    <div
      className={`animate-shimmer bg-border/60 ${roundedClass} ${width} ${height} ${className}`}
    />
  );
}
