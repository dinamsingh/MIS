import { useState, useEffect } from 'react';
import { readThemePreference, writeThemePreference, applyThemePreference } from '@presentation/theme';

export function ThemeToggle() {
  const [isDarkTheme, setIsDarkTheme] = useState(false);

  useEffect(() => {
    // Check initial state
    setIsDarkTheme(readThemePreference() === 'dark');
  }, []);

  const toggleTheme = () => {
    setIsDarkTheme((prev) => {
      const next = !prev;
      const nextTheme = next ? 'dark' : 'light';
      writeThemePreference(nextTheme);
      applyThemePreference(nextTheme, { animate: true });
      return next;
    });
  };

  return (
    <button
      type="button"
      aria-label={isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDarkTheme}
      title={isDarkTheme ? 'Light mode' : 'Dark mode'}
      onClick={toggleTheme}
      className="motion-interactive relative inline-flex h-touch w-touch items-center justify-center overflow-hidden rounded-lg border border-border/80 bg-surface text-soft shadow-soft transition-[transform,background-color,color,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-ring/70 hover:bg-secondary hover:text-text hover:shadow-elevated focus-visible:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none"
    >
      <span
        className={[
          'absolute inset-1 rounded-md transition-[background-color,box-shadow,opacity] duration-slow ease-standard',
          isDarkTheme
            ? 'bg-accent/15 shadow-[inset_0_0_0_1px_rgb(var(--color-accent)/0.14)]'
            : 'bg-accent-tint/70 shadow-[inset_0_0_0_1px_rgb(var(--color-ring)/0.12)]',
        ].join(' ')}
        aria-hidden="true"
      />
      <span
        className={[
          'absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-slow ease-standard motion-reduce:transition-none',
          isDarkTheme ? 'scale-100 rotate-0 opacity-100' : 'scale-90 -rotate-12 opacity-0',
        ].join(' ')}
        aria-hidden="true"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M16.3 12.4A6.7 6.7 0 0 1 7.6 3.7 6.9 6.9 0 1 0 16.3 12.4Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span
        className={[
          'absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-slow ease-standard motion-reduce:transition-none',
          isDarkTheme ? 'scale-90 rotate-12 opacity-0' : 'scale-100 rotate-0 opacity-100',
        ].join(' ')}
        aria-hidden="true"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="10" cy="10" r="3.25" />
          <path d="M10 1.8v2M10 16.2v2M3.8 3.8l1.4 1.4M14.8 14.8l1.4 1.4M1.8 10h2M16.2 10h2M3.8 16.2l1.4-1.4M14.8 5.2l1.4-1.4" strokeLinecap="round" />
        </svg>
      </span>
    </button>
  );
}
