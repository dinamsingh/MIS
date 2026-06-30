import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cx, disabledState, focusRing, toneClass, type ComponentSize, type ComponentTone } from './utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';

const buttonVariantClass: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-surface hover:bg-accent-hover',
  secondary: 'bg-accent-tint text-accent hover:bg-accent/10',
  ghost: 'bg-transparent text-soft hover:bg-secondary hover:text-text',
  danger: 'bg-destructive text-surface hover:bg-destructive/90',
  outline: 'border border-border bg-surface text-text hover:bg-surface-muted',
};

const buttonSizeClass: Record<ComponentSize, string> = {
  sm: 'min-h-9 px-3 py-1.5 text-xs',
  md: 'min-h-control px-4 py-2 text-sm',
  lg: 'min-h-touch px-5 py-2.5 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ComponentSize;
  readonly loading?: boolean;
  readonly leftIcon?: ReactNode;
  readonly rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    children,
    className,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-button font-medium transition-all duration-fast ease-standard',
        buttonVariantClass[variant],
        buttonSizeClass[size],
        focusRing,
        disabledState,
        className,
      )}
      {...props}
    >
      {loading ? <LoadingDot /> : leftIcon}
      <span className="truncate">{children}</span>
      {!loading && rightIcon}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly icon: ReactNode;
  readonly label: string;
  readonly size?: ComponentSize;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = 'md', className, ...props },
  ref,
) {
  const sizeClass: Record<ComponentSize, string> = {
    sm: 'h-9 w-9',
    md: 'h-control w-control',
    lg: 'h-touch w-touch',
  };

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cx(
        'inline-flex items-center justify-center rounded-button text-soft transition-all duration-fast ease-standard hover:bg-secondary hover:text-text',
        sizeClass[size],
        focusRing,
        disabledState,
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
});

export interface CardProps extends HTMLAttributes<HTMLElement> {
  readonly as?: ElementType;
  readonly interactive?: boolean;
  readonly padded?: boolean;
}

export function Card({ as: Component = 'section', interactive = false, padded = true, className, ...props }: CardProps) {
  return (
    <Component
      className={cx(
        'rounded-card border border-border bg-surface shadow-soft',
        padded && 'p-5',
        interactive &&
          'transition-all duration-fast ease-standard hover:-translate-y-0.5 hover:border-ring hover:shadow-elevated motion-reduce:hover:translate-y-0',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('mb-4 flex items-start justify-between gap-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cx('text-card-title', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('min-w-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('mt-5 flex items-center justify-end gap-2 border-t border-border pt-4', className)} {...props} />;
}

export interface StatsCardProps extends ComponentPropsWithoutRef<'article'> {
  readonly icon?: ReactNode;
  readonly label: string;
  readonly value: ReactNode;
  readonly description?: ReactNode;
  readonly trend?: ReactNode;
  readonly tone?: ComponentTone;
  readonly loading?: boolean;
}

export function StatsCard({
  icon,
  label,
  value,
  description,
  trend,
  tone = 'neutral',
  loading = false,
  className,
  ...props
}: StatsCardProps) {
  const toneStyles = toneClass[tone];

  return (
    <article className={cx('card relative min-h-[7.5rem] overflow-hidden p-4', className)} {...props}>
      <div className={cx('absolute right-3 top-3 h-14 w-14 rounded-full opacity-60 blur-xl', toneStyles.bg)} />
      {loading ? (
        <div className="relative space-y-3">
          <div className="h-8 w-8 animate-pulse rounded-button bg-border/60" />
          <div className="h-3 w-24 animate-pulse rounded-button bg-border/60" />
          <div className="h-7 w-20 animate-pulse rounded-button bg-border/60" />
        </div>
      ) : (
        <div className="relative flex h-full flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            {icon && (
              <span className={cx('flex h-8 w-8 items-center justify-center rounded-button text-sm ring-1', toneStyles.bg, toneStyles.text, toneStyles.border)}>
                {icon}
              </span>
            )}
            {trend && <span className={cx('rounded-sm px-1.5 py-0.5 text-[10px] font-semibold leading-4', toneStyles.bg, toneStyles.text)}>{trend}</span>}
          </div>
          <div>
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1.5 text-2xl font-semibold leading-none text-text">{value}</p>
            {description && <p className="mt-1 truncate text-[11px] leading-4 text-muted">{description}</p>}
          </div>
        </div>
      )}
    </article>
  );
}

export interface SectionHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly eyebrow?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
}

export function SectionHeader({ eyebrow, title, description, actions, className, ...props }: SectionHeaderProps) {
  return (
    <div className={cx('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)} {...props}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{eyebrow}</p>}
        <h1 className="truncate text-page-title">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-body">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

function LoadingDot() {
  return <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />;
}
