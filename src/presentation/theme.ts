export type ThemePreference = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'mis_theme_preference_v1';
export const THEME_CHANGE_EVENT = 'mis-theme-preference-change';

function systemTheme(): ThemePreference {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function readThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'dark' || saved === 'light' ? saved : systemTheme();
  } catch {
    return systemTheme();
  }
}

export function writeThemePreference(theme: ThemePreference): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme preference is presentational and must never block rendering.
  }
}

export function applyThemePreference(theme: ThemePreference, options: { readonly animate?: boolean } = {}): void {
  if (typeof document === 'undefined') return;
  if (options.animate) {
    document.documentElement.classList.add('theme-transitioning');
    window.setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 260);
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function announceThemePreference(theme: ThemePreference): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme } }));
}
