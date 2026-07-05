import { type HTMLAttributes, type ReactNode } from 'react';
import { EmptyState, SkeletonLoader } from './data-display';
import { Card, CardHeader, CardTitle } from './foundation';
import { cx } from './utils';

export interface GenericChartContainerProps extends HTMLAttributes<HTMLDivElement> {
  readonly loading?: boolean;
  readonly empty?: boolean;
  readonly emptyTitle?: ReactNode;
  readonly emptyMessage?: ReactNode;
  readonly minHeightClass?: string;
}

export function GenericChartContainer({
  loading = false,
  empty = false,
  emptyTitle = 'No chart data',
  emptyMessage = 'There is not enough data to render this chart yet.',
  minHeightClass = 'min-h-64',
  className,
  children,
  ...props
}: GenericChartContainerProps) {
  return (
    <div className={cx('motion-border relative w-full rounded-card border border-border bg-background p-4 animate-chart-fade', minHeightClass, className)} {...props}>
      {loading ? (
        <div className="space-y-3">
          <SkeletonLoader className="h-4 w-32" variant="text" />
          <SkeletonLoader className="h-44 w-full" />
        </div>
      ) : empty ? (
        <EmptyState title={emptyTitle} message={emptyMessage} />
      ) : (
        children
      )}
    </div>
  );
}

export interface ChartCardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly loading?: boolean;
  readonly empty?: boolean;
  readonly emptyTitle?: ReactNode;
  readonly emptyMessage?: ReactNode;
}

export function ChartCard({
  title,
  description,
  action,
  loading = false,
  empty = false,
  emptyTitle,
  emptyMessage,
  className,
  children,
  ...props
}: ChartCardProps) {
  return (
    <Card as="section" interactive className={className} {...props}>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <p className="mt-1 text-xs leading-5 text-muted">{description}</p>}
        </div>
        {action}
      </CardHeader>
      <GenericChartContainer loading={loading} empty={empty} emptyTitle={emptyTitle} emptyMessage={emptyMessage}>
        {children}
      </GenericChartContainer>
    </Card>
  );
}
