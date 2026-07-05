import { type HTMLAttributes, type ReactNode } from 'react';
import { Button } from './foundation';
import { EmptyState, ErrorState, LoadingSpinner } from './data-display';
import { cx, focusRing } from './utils';

export interface DataTableColumn<T> {
  readonly id: string;
  readonly header: ReactNode;
  readonly accessor?: keyof T | ((row: T, index: number) => ReactNode);
  readonly align?: 'left' | 'center' | 'right';
  readonly className?: string;
}

export interface PremiumDataTableProps<T> {
  readonly columns: readonly DataTableColumn<T>[];
  readonly data: readonly T[];
  readonly rowKey: keyof T | ((row: T, index: number) => string);
  readonly loading?: boolean;
  readonly error?: ReactNode;
  readonly emptyTitle?: ReactNode;
  readonly emptyMessage?: ReactNode;
  readonly onRowClick?: (row: T, index: number) => void;
  readonly className?: string;
}

export function PremiumDataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  error,
  emptyTitle = 'No records found',
  emptyMessage = 'There is no data to show for the current filters.',
  onRowClick,
  className,
}: PremiumDataTableProps<T>) {
  const alignClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <div className={cx('table-shell motion-border motion-page-enter', className)}>
      {loading ? (
        <div className="flex min-h-48 items-center justify-center motion-page-enter">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <ErrorState kind="network" title="Unable to load table" message={error} className="min-h-64 border-0 shadow-none" />
      ) : data.length === 0 ? (
        <EmptyState title={emptyTitle} message={emptyMessage} />
      ) : (
        <div className="table-scroll">
          <table className="table-base">
            <thead className="table-head">
              <tr>
                {columns.map((column) => (
                  <th key={column.id} className={cx('table-header-cell', alignClass[column.align ?? 'left'], column.className)}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, rowIndex) => {
                const key = typeof rowKey === 'function' ? rowKey(row, rowIndex) : String(row[rowKey]);
                const clickable = Boolean(onRowClick);
                return (
                  <tr
                    key={key}
                    className={cx('table-row motion-table-row', clickable && 'cursor-pointer focus-within:bg-surface-muted')}
                    onClick={clickable ? () => onRowClick?.(row, rowIndex) : undefined}
                  >
                    {columns.map((column) => (
                      <td key={column.id} className={cx('table-cell', alignClass[column.align ?? 'left'], column.className)}>
                        {resolveCell(row, rowIndex, column)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export interface TableToolbarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
}

export function TableToolbar({ title, description, actions, children, className, ...props }: TableToolbarProps) {
  return (
    <div className={cx('motion-border flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-soft lg:flex-row lg:items-center lg:justify-between', className)} {...props}>
      <div className="min-w-0">
        {title && <h2 className="text-card-title">{title}</h2>}
        {description && <p className="mt-1 text-xs leading-5 text-muted">{description}</p>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {children}
        {actions}
      </div>
    </div>
  );
}

export interface FilterBarProps extends HTMLAttributes<HTMLDivElement> {
  readonly leading?: ReactNode;
  readonly actions?: ReactNode;
}

export function FilterBar({ leading, actions, children, className, ...props }: FilterBarProps) {
  return (
    <div className={cx('motion-border flex flex-col gap-3 rounded-control border border-border bg-surface-muted/60 p-3 md:flex-row md:items-center md:justify-between', className)} {...props}>
      {leading && <div className="min-w-0">{leading}</div>}
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export interface PaginationProps extends HTMLAttributes<HTMLDivElement> {
  readonly page: number;
  readonly pageCount: number;
  readonly onPageChange: (page: number) => void;
  readonly disabled?: boolean;
}

export function Pagination({ page, pageCount, onPageChange, disabled = false, className, ...props }: PaginationProps) {
  const currentPage = Math.min(Math.max(page, 1), Math.max(pageCount, 1));
  const pages = buildPageList(currentPage, pageCount);

  return (
    <nav className={cx('flex flex-wrap items-center justify-between gap-3 text-sm', className)} aria-label="Pagination" {...props}>
      <p className="text-xs text-muted">
        Page <span className="font-semibold text-text">{currentPage}</span> of {Math.max(pageCount, 1)}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={disabled || currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
          Previous
        </Button>
        {pages.map((item, index) =>
          item === 'gap' ? (
            <span key={`${item}-${index}`} className="px-2 text-muted">
              ...
            </span>
          ) : (
            <button
              key={item}
              type="button"
              disabled={disabled}
              aria-current={item === currentPage ? 'page' : undefined}
              onClick={() => onPageChange(item)}
              className={cx(
                'motion-interactive h-8 min-w-8 rounded-button px-2 text-xs font-semibold transition-colors duration-fast',
                item === currentPage ? 'bg-accent text-surface' : 'text-soft hover:bg-secondary hover:text-text',
                focusRing,
              )}
            >
              {item}
            </button>
          ),
        )}
        <Button variant="ghost" size="sm" disabled={disabled || currentPage >= pageCount} onClick={() => onPageChange(currentPage + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}

function resolveCell<T>(row: T, index: number, column: DataTableColumn<T>): ReactNode {
  if (typeof column.accessor === 'function') return column.accessor(row, index);
  if (column.accessor) return String(row[column.accessor] ?? '');
  return null;
}

function buildPageList(page: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sorted = Array.from(pages)
    .filter((item) => item >= 1 && item <= pageCount)
    .sort((a, b) => a - b);
  const result: Array<number | 'gap'> = [];
  sorted.forEach((item, index) => {
    if (index > 0 && item - sorted[index - 1] > 1) result.push('gap');
    result.push(item);
  });
  return result;
}
