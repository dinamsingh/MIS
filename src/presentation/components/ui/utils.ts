export type ComponentSize = 'sm' | 'md' | 'lg';
export type ComponentTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export const disabledState = 'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50';

export const toneClass: Record<ComponentTone, { text: string; bg: string; border: string; dot: string }> = {
  neutral: {
    text: 'text-soft',
    bg: 'bg-secondary',
    border: 'border-border',
    dot: 'bg-muted',
  },
  success: {
    text: 'text-status-green',
    bg: 'bg-status-green/10',
    border: 'border-status-green/20',
    dot: 'bg-status-green',
  },
  warning: {
    text: 'text-status-amber',
    bg: 'bg-status-amber/10',
    border: 'border-status-amber/20',
    dot: 'bg-status-amber',
  },
  danger: {
    text: 'text-status-red',
    bg: 'bg-status-red/10',
    border: 'border-status-red/20',
    dot: 'bg-status-red',
  },
  info: {
    text: 'text-status-blue',
    bg: 'bg-status-blue/10',
    border: 'border-status-blue/20',
    dot: 'bg-status-blue',
  },
};
