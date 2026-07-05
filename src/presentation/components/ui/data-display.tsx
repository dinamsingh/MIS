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
        <img src={src} alt={name} loading="lazy" decoding="async" className={cx('rounded-full object-cover', sizeClass[size])} />
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
      className={cx('motion-border relative flex min-h-52 flex-col items-center justify-center overflow-hidden rounded-card border border-dashed border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(247,247,247,0.88))] p-6 text-center shadow-soft motion-page-enter', className)}
      {...props}
    >
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" aria-hidden="true" />
      <div className="relative flex h-16 w-16 animate-empty-float items-center justify-center rounded-full border border-border bg-surface shadow-soft">
        {icon ?? (
          <span className="relative flex h-8 w-8 items-center justify-center rounded-button bg-accent-tint text-sm font-bold text-accent" aria-hidden="true">
            --
          </span>
        )}
      </div>
      <p className="mt-4 text-sm font-semibold text-text">{title}</p>
      {message && <p className="mt-1 max-w-md text-xs leading-5 text-muted">{message}</p>}
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export type ErrorStateKind = 'not-found' | 'server' | 'network' | 'permission';

export interface ErrorStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly kind?: ErrorStateKind;
  readonly title?: ReactNode;
  readonly message?: ReactNode;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

const errorStateCopy: Record<ErrorStateKind, { title: string; message: string; code: string; tone: ComponentTone }> = {
  'not-found': {
    title: 'Page not found',
    message: 'The workspace page you are looking for is unavailable or has moved.',
    code: '404',
    tone: 'info',
  },
  server: {
    title: 'Something went wrong',
    message: 'The app could not complete this request. Try again in a moment.',
    code: '500',
    tone: 'danger',
  },
  network: {
    title: 'Network connection issue',
    message: 'Check your connection and retry the latest action.',
    code: 'NET',
    tone: 'warning',
  },
  permission: {
    title: 'Permission denied',
    message: 'Your account does not have access to this workspace area.',
    code: '403',
    tone: 'danger',
  },
};

export function ErrorState({ kind = 'server', title, message, actionLabel = 'Try again', onAction, className, ...props }: ErrorStateProps) {
  const preset = errorStateCopy[kind];
  const styles = toneClass[preset.tone];

  return (
    <section
      className={cx('flex min-h-[22rem] items-center justify-center rounded-card border border-border bg-surface p-6 shadow-soft motion-page-enter', className)}
      aria-labelledby="error-state-title"
      {...props}
    >
      <div className="max-w-md text-center">
        <div className={cx('mx-auto flex h-20 w-20 items-center justify-center rounded-full border text-lg font-bold', styles.bg, styles.border, styles.text)}>
          {preset.code}
        </div>
        <h1 id="error-state-title" className="mt-5 text-xl font-semibold text-text">{title ?? preset.title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{message ?? preset.message}</p>
        {onAction && (
          <Button className="mt-5" variant={preset.tone === 'danger' ? 'danger' : 'primary'} onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </div>
    </section>
  );
}

export interface SkeletonLoaderProps extends HTMLAttributes<HTMLDivElement> {
  readonly variant?: 'block' | 'text' | 'circle';
}

export function SkeletonLoader({ variant = 'block', className, ...props }: SkeletonLoaderProps) {
  return (
    <div
      className={cx(
        'animate-shimmer bg-border/60',
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
      <span className={cx('animate-spin rounded-full border-current border-t-transparent motion-reduce:animate-none', sizeClass[size])} aria-hidden="true" />
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
        <div className={cx('h-full rounded-full transition-all duration-200 ease-standard motion-reduce:transition-none', toneClass[tone].dot)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export interface ProgressIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  readonly label?: ReactNode;
}

export function ProgressIndicator({ label = 'Loading workspace', className, ...props }: ProgressIndicatorProps) {
  return (
    <div className={cx('w-full space-y-2', className)} {...props}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-text">{label}</span>
        <span className="text-muted">Please wait</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full w-1/3 animate-progress-indeterminate rounded-full bg-accent" />
      </div>
    </div>
  );
}
