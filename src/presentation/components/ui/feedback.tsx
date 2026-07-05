import { type HTMLAttributes, type ReactNode } from 'react';
import { Button, IconButton } from './foundation';
import { cx, toneClass, type ComponentTone } from './utils';

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly tone?: ComponentTone;
  readonly title?: ReactNode;
  readonly action?: ReactNode;
}

export function Alert({ tone = 'info', title, action, children, className, ...props }: AlertProps) {
  const styles = toneClass[tone];

  return (
    <div className={cx('flex items-start gap-3 rounded-card border p-4', styles.bg, styles.border, className)} role="status" {...props}>
      <span className={cx('mt-1 h-2 w-2 shrink-0 rounded-full', styles.dot)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className={cx('text-sm font-semibold', styles.text)}>{title}</p>}
        {children && <div className="mt-1 text-sm leading-6 text-soft">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export interface ToastProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly tone?: ComponentTone;
  readonly title: ReactNode;
  readonly message?: ReactNode;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly onClose?: () => void;
}

export function Toast({
  tone = 'neutral',
  title,
  message,
  actionLabel,
  onAction,
  onClose,
  className,
  ...props
}: ToastProps) {
  const styles = toneClass[tone];

  return (
    <div className={cx('flex w-full max-w-sm items-start gap-3 rounded-dialog border border-border bg-surface p-4 shadow-overlay', className)} role="status" {...props}>
      <span className={cx('mt-1 h-2 w-2 shrink-0 rounded-full', styles.dot)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">{title}</p>
        {message && <p className="mt-1 text-xs leading-5 text-muted">{message}</p>}
        {actionLabel && onAction && (
          <Button variant="ghost" size="sm" className="mt-2 min-h-8 px-0" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </div>
      {onClose && <IconButton icon="x" label="Dismiss notification" size="sm" onClick={onClose} />}
    </div>
  );
}
