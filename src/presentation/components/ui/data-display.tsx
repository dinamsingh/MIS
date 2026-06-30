import { type HTMLAttributes, type ReactNode } from 'react';
import { Button } from './foundation';
import { cx, toneClass, type ComponentSize, type ComponentTone } from './utils';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: ComponentTone;
  readonly size?: 'sm' | 'md';
  readonly dot?: boolean;
}

export function Badge({ tone = 'neutral', size = 'md', dot = false, className, children, ...props }: BadgeProps) {
  const styles = toneClass[tone];

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-sm font-semibold',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px] leading-4' : 'px-2 py-0.5 text-xs leading-5',
        styles.bg,
        styles.text,
        className,
      )}
      {...props}
    >
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', styles.dot)} aria-hidden="true" />}
      {children}
    </span>
  );
}

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  readonly name?: string;
  readonly src?: string;
  readonly size?: ComponentSize;
  readonly status?: ComponentTone;
}

export function Avatar({ name = 'User', src, size = 'md', status, className, ...props }: AvatarProps) {
  const sizeClass: Record<ComponentSize, string> = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
  };
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';

  return (
    <span className={cx('relative inline-flex shrink-0', className)} {...props}>
      {src ? (
        <img src={src} alt={name} className={cx('rounded-full object-cover', sizeClass[size])} />
      ) : (
        <span className={cx('inline-flex items-center justify-center rounded-full bg-accent text-surface font-semibold', sizeClass[size])}>
          {initials}
        </span>
      )}
      {status && <span className={cx('absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-surface', toneClass[status].dot)} />}
    </span>
  );
}

export interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: ComponentTone;
}

export function StatusChip({ tone = 'neutral', className, children, ...props }: StatusChipProps) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', toneClass[tone].border, toneClass[tone].bg, toneClass[tone].text, className)} {...props}>
      <span className={cx('h-1.5 w-1.5 rounded-full', toneClass[tone].dot)} aria-hidden="true" />
      {children}
    </span>
  );
}

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly icon?: ReactNode;
  readonly title: ReactNode;
  readonly message?: ReactNode;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export function EmptyState({ icon, title, message, actionLabel, onAction, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cx('flex min-h-44 flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface-muted/60 p-6 text-center', className)}
      {...props}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-tint text-accent">
        {icon ?? <span aria-hidden="true">--</span>}
      </div>
      <p className="mt-3 text-sm font-semibold text-text">{title}</p>
      {message && <p className="mt-1 max-w-sm text-xs leading-5 text-muted">{message}</p>}
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export interface SkeletonLoaderProps extends HTMLAttributes<HTMLDivElement> {
  readonly variant?: 'block' | 'text' | 'circle';
}

export function SkeletonLoader({ variant = 'block', className, ...props }: SkeletonLoaderProps) {
  return (
    <div
      className={cx(
        'animate-pulse bg-border/60',
        variant === 'circle' ? 'rounded-full' : variant === 'text' ? 'h-3 rounded-button' : 'rounded-card',
        className,
      )}
      {...props}
    />
  );
}

export interface LoadingSpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  readonly size?: ComponentSize;
  readonly label?: string;
}

export function LoadingSpinner({ size = 'md', label = 'Loading', className, ...props }: LoadingSpinnerProps) {
  const sizeClass: Record<ComponentSize, string> = {
    sm: 'h-4 w-4 border-2',
    md: 'h-6 w-6 border-2',
    lg: 'h-9 w-9 border-4',
  };

  return (
    <span className={cx('inline-flex items-center gap-2 text-sm text-muted', className)} {...props}>
      <span className={cx('animate-spin rounded-full border-current border-t-transparent', sizeClass[size])} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  readonly value: number;
  readonly max?: number;
  readonly tone?: ComponentTone;
  readonly label?: ReactNode;
}

export function ProgressBar({ value, max = 100, tone = 'info', label, className, ...props }: ProgressBarProps) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div className={cx('space-y-2', className)} {...props}>
      {label && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium text-text">{label}</span>
          <span className="text-muted">{Math.round(percent)}%</span>
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <div className={cx('h-full rounded-full transition-all duration-standard ease-standard', toneClass[tone].dot)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
