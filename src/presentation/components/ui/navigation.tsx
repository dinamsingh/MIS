import { type HTMLAttributes, type ReactNode } from 'react';
import { Dialog } from './overlays';
import { SearchInput } from './forms';
import { cx, focusRing } from './utils';

export interface BreadcrumbItem {
  readonly label: ReactNode;
  readonly href?: string;
  readonly current?: boolean;
}

export interface BreadcrumbProps extends HTMLAttributes<HTMLElement> {
  readonly items: readonly BreadcrumbItem[];
}

export function Breadcrumb({ items, className, ...props }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cx('flex min-w-0 items-center gap-1 text-xs text-muted', className)} {...props}>
      {items.map((item, index) => (
        <span key={index} className="flex min-w-0 items-center gap-1">
          {index > 0 && <span aria-hidden="true">/</span>}
          {item.href && !item.current ? (
            <a href={item.href} className={cx('truncate hover:text-text', focusRing)}>
              {item.label}
            </a>
          ) : (
            <span className={cx('truncate', item.current && 'font-medium text-soft')} aria-current={item.current ? 'page' : undefined}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

export interface TabItem {
  readonly value: string;
  readonly label: ReactNode;
  readonly badge?: ReactNode;
  readonly disabled?: boolean;
}

export interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  readonly items: readonly TabItem[];
  readonly value: string;
  readonly onValueChange: (value: string) => void;
}

export function Tabs({ items, value, onValueChange, className, ...props }: TabsProps) {
  return (
    <div className={cx('inline-flex max-w-full overflow-x-auto rounded-control border border-border bg-surface-muted p-1', className)} role="tablist" {...props}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onValueChange(item.value)}
            className={cx(
              'inline-flex min-h-9 shrink-0 items-center gap-2 rounded-button px-3 text-xs font-semibold transition-all duration-fast',
              active ? 'bg-surface text-text shadow-soft' : 'text-muted hover:text-text',
              item.disabled && 'pointer-events-none opacity-50',
              focusRing,
            )}
          >
            {item.label}
            {item.badge && <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] text-muted">{item.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface CommandMenuItem {
  readonly id: string;
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly shortcut?: ReactNode;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
}

export interface CommandMenuProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly items: readonly CommandMenuItem[];
  readonly title?: ReactNode;
}

export function CommandMenu({
  open,
  onOpenChange,
  query,
  onQueryChange,
  items,
  title = 'Command menu',
}: CommandMenuProps) {
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? items.filter((item) => String(item.label).toLowerCase().includes(normalized))
    : items;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <div className="space-y-4">
        <SearchInput value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search commands" />
        <div className="max-h-80 overflow-auto rounded-card border border-border">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">No commands found.</p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={item.disabled}
                    onClick={() => {
                      item.onSelect();
                      onOpenChange(false);
                    }}
                    className={cx('flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-fast hover:bg-surface-muted', item.disabled && 'pointer-events-none opacity-50', focusRing)}
                  >
                    <span>
                      <span className="block text-sm font-medium text-text">{item.label}</span>
                      {item.description && <span className="block text-xs leading-5 text-muted">{item.description}</span>}
                    </span>
                    {item.shortcut && <kbd className="rounded-sm border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted">{item.shortcut}</kbd>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  );
}
