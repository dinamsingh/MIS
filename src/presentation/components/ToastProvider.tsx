import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Toast } from '@presentation/components/ui';
import type { ComponentTone } from '@presentation/components/ui/utils';
import { motionDurations, motionEase } from '@presentation/motion';

export interface ToastInput {
  readonly tone?: ComponentTone;
  readonly title: ReactNode;
  readonly message?: ReactNode;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly durationMs?: number;
}

interface ToastMessage extends ToastInput {
  readonly id: number;
}

interface ToastContextValue {
  readonly notify: (toast: ToastInput) => number;
  readonly dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const MAX_VISIBLE_TOASTS = 4;
const DEFAULT_TOAST_DURATION_MS = 4500;

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((toast: ToastInput) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => [...current, { ...toast, id }]);
    return id;
  }, []);

  const value = useMemo(() => ({ notify, dismiss }), [dismiss, notify]);
  const visibleToasts = toasts.slice(0, MAX_VISIBLE_TOASTS);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[70] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:right-5"
        aria-live="polite"
        aria-relevant="additions removals"
      >
        <AnimatePresence initial={false}>
          {visibleToasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.98 }}
              transition={{ duration: motionDurations.standard, ease: motionEase }}
            >
              <QueuedToast toast={toast} onDismiss={dismiss} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

function QueuedToast({ toast, onDismiss }: { readonly toast: ToastMessage; readonly onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (toast.durationMs === 0) return undefined;
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.durationMs ?? DEFAULT_TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.durationMs, toast.id]);

  return (
    <Toast
      tone={toast.tone}
      title={toast.title}
      message={toast.message}
      actionLabel={toast.actionLabel}
      onAction={toast.onAction}
      onClose={() => onDismiss(toast.id)}
    />
  );
}
