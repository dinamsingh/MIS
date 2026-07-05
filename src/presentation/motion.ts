export const motionDurations = {
  instant: 0,
  fast: 0.12,
  standard: 0.18,
  page: 0.2,
  overlay: 0.18,
  max: 0.22,
} as const;

export const motionEase = [0.2, 0, 0, 1] as const;
export const motionEaseOut = [0.16, 1, 0.3, 1] as const;
export const MOTION_DISABLED_STORAGE_KEY = 'mis_motion_disabled_v1';
export const MOTION_PREFERENCE_EVENT = 'mis-motion-preference-change';

export const pageMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: motionDurations.page, ease: motionEase },
} as const;

export const overlayBackdropMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: motionDurations.overlay, ease: motionEase },
} as const;

export const dialogMotion = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: 4 },
  transition: { duration: motionDurations.overlay, ease: motionEaseOut },
} as const;

export const menuMotion = {
  initial: { opacity: 0, scale: 0.98, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: -4 },
  transition: { duration: motionDurations.fast, ease: motionEase },
} as const;

export function drawerMotion(side: 'left' | 'right' | 'bottom') {
  const hidden =
    side === 'left'
      ? { opacity: 0, x: '-100%' }
      : side === 'right'
        ? { opacity: 0, x: '100%' }
        : { opacity: 0, y: '100%' };

  return {
    initial: hidden,
    animate: { opacity: 1, x: 0, y: 0 },
    exit: hidden,
    transition: { duration: motionDurations.max, ease: motionEase },
  } as const;
}

export function readMotionDisabledPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MOTION_DISABLED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeMotionDisabledPreference(disabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MOTION_DISABLED_STORAGE_KEY, String(disabled));
  } catch {
    // Motion preference is presentational and must never block rendering.
  }
}

export function applyMotionDisabledPreference(disabled: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('motion-disabled', disabled);
}
