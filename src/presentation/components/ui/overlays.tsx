import { useEffect, useRef, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { dialogMotion, drawerMotion, menuMotion, overlayBackdropMotion } from '@presentation/motion';
import { Button, IconButton } from './foundation';
import { cx, focusRing } from './utils';

interface OpenLayerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export interface DialogProps extends OpenLayerProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly closeLabel?: string;
  readonly maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full';
}

export function Dialog({ open, onOpenChange, title, description, children, footer, closeLabel = 'Close dialog', maxWidth = 'lg' }: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeDialog = () => onOpenChange(false);
  useEscapeClose(open, onOpenChange);
  useDialogFocus(open, panelRef);
  useFocusTrap(open, panelRef);

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    full: 'max-w-full',
  }[maxWidth];

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
          <motion.button type="button" className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" aria-label={closeLabel} onPointerDown={closeDialog} onClick={closeDialog} {...overlayBackdropMotion} />
          <motion.div
            ref={panelRef}
            className={`relative flex max-h-[88vh] w-full ${maxWidthClass} flex-col overflow-hidden rounded-dialog border border-border bg-surface shadow-overlay`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            {...dialogMotion}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 id="dialog-title" className="text-lg font-semibold text-text">{title}</h2>
                {description && <p className="mt-1 text-xs leading-5 text-muted">{description}</p>}
              </div>
              <IconButton icon="x" label={closeLabel} size="sm" onPointerDown={(event) => event.stopPropagation()} onClick={closeDialog} />
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
            {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface DrawerProps extends OpenLayerProps {
  readonly title?: ReactNode;
  readonly side?: 'left' | 'right' | 'bottom';
  readonly children: ReactNode;
}

export function Drawer({ open, onOpenChange, title, side = 'right', children }: DrawerProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  useEscapeClose(open, onOpenChange);
  useDialogFocus(open, panelRef);
  useFocusTrap(open, panelRef);

  const sideClass = {
    left: 'inset-y-0 left-0 h-full w-[22rem] max-w-[88vw]',
    right: 'inset-y-0 right-0 h-full w-[22rem] max-w-[88vw]',
    bottom: 'inset-x-0 bottom-0 max-h-[86vh] rounded-t-dialog',
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Drawer'}>
          <motion.button type="button" className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" aria-label="Close drawer" onClick={() => onOpenChange(false)} {...overlayBackdropMotion} />
          <motion.aside
            ref={panelRef}
            className={cx('absolute overflow-hidden border-border bg-surface shadow-overlay', side === 'bottom' ? 'border-t' : 'border-x', sideClass[side])}
            {...drawerMotion(side)}
          >
            <div className="flex h-full flex-col">
              {title && (
                <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
                  <h2 className="text-sm font-semibold text-text">{title}</h2>
                  <IconButton icon="x" label="Close drawer" size="sm" onClick={() => onOpenChange(false)} />
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface DropdownMenuItem {
  readonly id: string;
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  readonly onSelect: () => void;
}

export interface DropdownMenuProps extends OpenLayerProps {
  readonly trigger: ReactNode;
  readonly items: readonly DropdownMenuItem[];
  readonly align?: 'left' | 'right';
}

export function DropdownMenu({ open, onOpenChange, trigger, items, align = 'right' }: DropdownMenuProps) {
  useEscapeClose(open, onOpenChange);

  return (
    <div className="relative inline-flex">
      <div onClick={() => onOpenChange(!open)}>{trigger}</div>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            className={cx('absolute top-full z-40 mt-2 w-56 rounded-dialog border border-border bg-surface p-2 shadow-overlay', align === 'right' ? 'right-0' : 'left-0')}
            {...menuMotion}
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect();
                  onOpenChange(false);
                }}
                className={cx(
                  'motion-interactive flex w-full flex-col rounded-button px-3 py-2 text-left transition-colors duration-fast hover:bg-secondary',
                  item.danger ? 'text-status-red' : 'text-text',
                  item.disabled && 'pointer-events-none opacity-50',
                  focusRing,
                )}
              >
                <span className="text-sm font-medium">{item.label}</span>
                {item.description && <span className="text-xs leading-5 text-muted">{item.description}</span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export interface PopoverProps extends OpenLayerProps {
  readonly trigger: ReactNode;
  readonly children: ReactNode;
  readonly widthClass?: string;
}

export function Popover({ open, onOpenChange, trigger, children, widthClass = 'w-72' }: PopoverProps) {
  useEscapeClose(open, onOpenChange);

  return (
    <div className="relative inline-flex">
      <div onClick={() => onOpenChange(!open)}>{trigger}</div>
      <AnimatePresence>
        {open && (
          <motion.div className={cx('absolute right-0 top-full z-40 mt-2 rounded-control border border-border bg-surface p-3 shadow-elevated', widthClass)} {...menuMotion}>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export interface TooltipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'content'> {
  readonly content: ReactNode;
  readonly children: ReactNode;
}

export function Tooltip({ content, children, className, ...props }: TooltipProps) {
  return (
    <span className={cx('group relative inline-flex', className)} {...props}>
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-sm bg-accent px-2 py-1 text-xs font-medium text-surface shadow-elevated group-hover:block group-focus-within:block">
        {content}
      </span>
    </span>
  );
}

export interface ConfirmDialogProps extends OpenLayerProps {
  readonly title: ReactNode;
  readonly message: ReactNode;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
  readonly onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={(
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </>
      )}
    >
      <p className="text-sm leading-6 text-soft">{message}</p>
    </Dialog>
  );
}

function useEscapeClose(open: boolean, onOpenChange: (open: boolean) => void) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange, open]);
}

function useDialogFocus(open: boolean, panelRef: RefObject<HTMLElement>) {
  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const focusable = getFocusableElements(panelRef.current);
      (focusable[0] ?? panelRef.current)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      previouslyFocused?.focus();
    };
  }, [open, panelRef]);
}

function useFocusTrap(open: boolean, panelRef: RefObject<HTMLElement>) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements(panelRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, panelRef]);
}

function getFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
}
