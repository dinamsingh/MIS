/**
 * Admin-only layout shell (admin-console-and-scheduling-upgrade).
 *
 * Designed for admin identities that are NOT teachers. Provides a premium,
 * stripped-down layout with only admin-relevant sidebar items and NO
 * section/subject dropdowns in the top bar.
 *
 * Does NOT import or depend on SelectedSectionProvider or useSelectedSection.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useAuth } from '@presentation/auth';
import { adminNavGroups } from '@presentation/adminNavigation';
import {
  applyMotionDisabledPreference,
  drawerMotion,
  MOTION_PREFERENCE_EVENT,
  motionDurations,
  motionEase,
  overlayBackdropMotion,
  pageMotion,
  readMotionDisabledPreference,
} from '@presentation/motion';
import {
  applyThemePreference,
  readThemePreference,
  writeThemePreference,
  type ThemePreference,
} from '@presentation/theme';
import { ToastProvider } from './ToastProvider';

interface AdminLayoutProps {
  activePath?: string;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
  children?: ReactNode;
}

function formatHeaderDate(): string {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatHeaderTime(): string {
  return new Date().toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()).trim();
}

export default function AdminLayout({ activePath, onNavigate, onLogout, children }: AdminLayoutProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [motionDisabled, setMotionDisabled] = useState(() => readMotionDisabledPreference());
  const [theme, setTheme] = useState<ThemePreference>(() => readThemePreference());
  const { actor } = useAuth();

  const todayLabel = useMemo(() => formatHeaderDate(), []);
  const [timeLabel, setTimeLabel] = useState(() => formatHeaderTime());
  const isDarkTheme = theme === 'dark';

  const adminEmail = actor.kind !== 'anonymous' ? actor.email : '';
  const adminName = adminEmail ? nameFromEmail(adminEmail) : 'Admin';
  const adminInitial = adminName.charAt(0).toUpperCase() || 'A';

  const closeMobileDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const activeTrail = useMemo(() => {
    for (const group of adminNavGroups) {
      const item = group.items.find((candidate) => candidate.path === activePath);
      if (item) {
        return { group: group.label, item: item.label };
      }
    }
    return { group: 'Overview', item: 'Admin Dashboard' };
  }, [activePath]);

  const handleNavigate = useCallback(
    (path: string) => {
      closeMobileDrawer();
      window.setTimeout(() => onNavigate?.(path), 0);
    },
    [closeMobileDrawer, onNavigate],
  );

  const toggleTheme = useCallback(() => {
    const nextTheme: ThemePreference = isDarkTheme ? 'light' : 'dark';
    setTheme(nextTheme);
    writeThemePreference(nextTheme);
    applyThemePreference(nextTheme, { animate: true });
  }, [isDarkTheme]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMobileDrawer();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeMobileDrawer, isDrawerOpen]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    if (typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleViewportChange = () => {
      if (mediaQuery.matches) closeMobileDrawer();
    };
    handleViewportChange();
    mediaQuery.addEventListener('change', handleViewportChange);
    return () => mediaQuery.removeEventListener('change', handleViewportChange);
  }, [closeMobileDrawer, isDrawerOpen]);

  useEffect(() => {
    applyMotionDisabledPreference(motionDisabled);
    const handleMotionPreferenceChange = (event: Event) => {
      const disabled = event instanceof CustomEvent ? Boolean(event.detail?.disabled) : readMotionDisabledPreference();
      setMotionDisabled(disabled);
      applyMotionDisabledPreference(disabled);
    };
    window.addEventListener(MOTION_PREFERENCE_EVENT, handleMotionPreferenceChange);
    return () => window.removeEventListener(MOTION_PREFERENCE_EVENT, handleMotionPreferenceChange);
  }, [motionDisabled]);

  useEffect(() => { applyThemePreference(theme); }, [theme]);

  useEffect(() => {
    const interval = window.setInterval(() => setTimeLabel(formatHeaderTime()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    closeMobileDrawer();
  }, [activePath, closeMobileDrawer]);

  const isCollapsed = isSidebarCollapsed;

  // --- Admin Sidebar ---
  const sidebarContent = (
    <nav
      aria-label="Admin navigation"
      className={[
        'relative flex h-full max-h-screen flex-col overflow-hidden border-r border-sidebar-border/80 bg-[linear-gradient(180deg,rgb(var(--color-surface))_0%,rgb(var(--color-sidebar))_46%,rgb(var(--color-secondary))_100%)] text-sidebar-foreground shadow-[6px_0_30px_rgb(var(--color-text)/0.06)] transition-[width] duration-slow ease-entrance motion-reduce:transition-none',
        isCollapsed ? 'w-20' : 'w-72',
      ].join(' ')}
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-border to-transparent" aria-hidden="true" />

      {/* Header with ADMIN badge */}
      <div className="relative flex h-[4.25rem] shrink-0 items-center gap-3 border-b border-sidebar-border/70 bg-surface/70 px-4 backdrop-blur-xl">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-[linear-gradient(135deg,rgb(168,85,247)_0%,rgb(109,40,217)_100%)] text-sm font-black text-white shadow-elevated ring-1 ring-purple-400/30">
          A
        </span>
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              className="min-w-0 flex-1"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: motionDurations.fast, ease: motionEase }}
            >
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-black tracking-tight text-text">Academic MIS</p>
                <span className="rounded-sm border border-purple-400/30 bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none text-purple-400">
                  ADMIN
                </span>
              </div>
              <p className="truncate text-[11px] font-semibold text-muted">Admin Console</p>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={() => setIsSidebarCollapsed((v) => !v)}
          className="icon-btn hidden h-8 w-8 shrink-0 border border-border/70 bg-surface/80 shadow-soft hover:border-border hover:bg-secondary lg:flex"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={isCollapsed}
        >
          <svg
            className={['h-4 w-4 transition-transform duration-fast ease-standard', isCollapsed ? 'rotate-180' : ''].join(' ')}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
          </svg>
        </button>
      </div>

      {/* Navigation items */}
      <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-3 py-4">
        {adminNavGroups.map((group) => (
          <div key={group.id} className="flex flex-col gap-1.5">
            {!isCollapsed ? (
              <motion.p
                className="flex items-center gap-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted"
                initial={{ opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: motionDurations.fast, ease: motionEase }}
              >
                <span>{group.label}</span>
                <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" aria-hidden="true" />
              </motion.p>
            ) : (
              <div className="mx-auto my-1 h-px w-8 bg-gradient-to-r from-transparent via-sidebar-border to-transparent" aria-hidden="true" />
            )}

            <ul className="flex flex-col gap-1">
              {group.items.map((item) => {
                const isActive = activePath === item.path;
                return (
                  <li key={item.id}>
                    <motion.button
                      layout
                      type="button"
                      title={isCollapsed ? item.label : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => handleNavigate(item.path)}
                      className={[
                        'motion-interactive group relative flex min-h-touch w-full touch-manipulation items-center rounded-control border text-left text-[13px] font-semibold transition-[transform,border-color,background-color,color,box-shadow] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
                        isCollapsed ? 'justify-center px-0' : 'gap-3 px-3',
                        isActive
                          ? 'border-purple-200/20 bg-[linear-gradient(140deg,rgb(88,28,135)_0%,rgb(126,34,206)_52%,rgb(168,85,247)_100%)] text-white shadow-[0_14px_32px_rgba(126,34,206,0.28)] ring-1 ring-purple-100/20'
                          : 'border-transparent text-soft hover:border-purple-400/20 hover:bg-[linear-gradient(135deg,rgb(var(--color-accent-tint))_0%,rgb(var(--color-surface))_58%,rgb(var(--color-secondary))_100%)] hover:text-text hover:shadow-elevated',
                      ].join(' ')}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="admin-sidebar-active-indicator"
                          className={[
                            'absolute rounded-full bg-current transition-all duration-fast ease-standard',
                            isCollapsed ? 'left-1 h-6 w-1' : 'left-1 h-5 w-1',
                          ].join(' ')}
                          transition={{ duration: motionDurations.standard, ease: motionEase }}
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className={[
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-button border text-sm transition-[transform,background-color,border-color,color,box-shadow] duration-fast ease-standard group-hover:scale-105 motion-reduce:transition-none',
                          isActive
                            ? 'border-white/25 bg-white/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
                            : 'border-border/70 bg-surface text-soft shadow-soft group-hover:border-border group-hover:text-text',
                        ].join(' ')}
                        aria-hidden="true"
                      >
                        {item.icon}
                      </span>
                      {!isCollapsed && (
                        <AnimatePresence initial={false}>
                          <motion.span
                            key="label"
                            className="min-w-0 flex-1 truncate"
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -4 }}
                            transition={{ duration: motionDurations.fast, ease: motionEase }}
                          >
                            {item.label}
                          </motion.span>
                          {item.badge && (
                            <motion.span
                              key="badge"
                              className="rounded-sm border border-purple-400/10 bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none text-purple-400"
                              initial={{ opacity: 0, scale: 0.96 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.96 }}
                              transition={{ duration: motionDurations.fast, ease: motionEase }}
                            >
                              {item.badge}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      )}
                    </motion.button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* User profile footer */}
      <div className="relative shrink-0 border-t border-sidebar-border/70 bg-surface/65 p-3 backdrop-blur-xl">
        <div
          className={[
            'motion-border flex items-center rounded-control border border-border/80 bg-[linear-gradient(135deg,rgb(var(--color-surface))_0%,rgb(var(--color-secondary))_100%)] p-2 shadow-elevated',
            isCollapsed ? 'justify-center' : 'gap-2',
          ].join(' ')}
        >
          <div
            className={[
              'flex min-w-0 items-center rounded-button border border-transparent p-1',
              isCollapsed ? 'justify-center' : 'flex-1 gap-3',
            ].join(' ')}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-purple-400/20 bg-purple-500/15 text-sm font-black text-purple-400 shadow-soft">
              {adminInitial}
            </span>
            {!isCollapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-text">{adminName}</span>
                <span className="block truncate text-[10px] text-muted">{adminEmail}</span>
              </span>
            )}
          </div>
          {!isCollapsed && (
            <button
              type="button"
              onClick={() => onLogout?.()}
              className="icon-btn h-8 w-8 shrink-0 border border-status-red/20 bg-status-red/10 text-status-red shadow-[0_6px_16px_rgba(220,38,38,0.12)] hover:bg-status-red hover:text-white hover:shadow-[0_10px_22px_rgba(220,38,38,0.2)]"
              aria-label="Logout"
              title="Logout"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </nav>
  );

  return (
    <MotionConfig reducedMotion={motionDisabled ? 'always' : 'user'}>
      <ToastProvider>
        <div className="flex min-h-screen w-full overflow-x-clip bg-secondary text-text">
          {/* Desktop sidebar */}
          <aside className="fixed inset-y-0 left-0 z-40 hidden h-screen max-h-screen shrink-0 lg:block">
            {sidebarContent}
          </aside>

          {/* Mobile drawer */}
          <AnimatePresence>
            {isDrawerOpen && (
              <motion.div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation menu">
                <motion.button
                  type="button"
                  className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
                  aria-label="Close navigation"
                  onPointerDown={closeMobileDrawer}
                  onClick={closeMobileDrawer}
                  {...overlayBackdropMotion}
                />
                <motion.div
                  className="absolute inset-y-0 left-0 w-[min(19rem,calc(100vw-1.5rem))] overflow-hidden shadow-overlay"
                  {...drawerMotion('left')}
                >
                  {sidebarContent}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main content area */}
          <div
            className={[
              'flex min-w-0 flex-1 flex-col transition-[padding-left] duration-slow ease-entrance motion-reduce:transition-none',
              isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72',
            ].join(' ')}
          >
            {/* Top bar — no section/subject dropdowns */}
            <header className="sticky top-0 z-30 border-b border-border/70 bg-surface/90 px-3 py-2 backdrop-blur-xl lg:px-5">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  <button
                    type="button"
                    aria-label="Open navigation"
                    onClick={() => setIsDrawerOpen(true)}
                    className="icon-btn h-touch w-touch lg:hidden"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>

                  <div className="hidden min-w-0 flex-col gap-0.5 xl:flex">
                    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-xs text-muted">
                      <span className="truncate">{activeTrail.group}</span>
                      <span aria-hidden="true">/</span>
                      <span className="truncate font-medium text-soft">{activeTrail.item}</span>
                    </nav>
                    <p className="truncate text-sm font-semibold text-text">{activeTrail.item}</p>
                  </div>
                </div>

                <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
                  {/* Theme toggle */}
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
                          ? 'bg-purple-500/15 shadow-[inset_0_0_0_1px_rgb(168_85_247/0.14)]'
                          : 'bg-purple-100/70 shadow-[inset_0_0_0_1px_rgb(168_85_247/0.12)]',
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

                  {/* Date/time */}
                  <div className="motion-border hidden min-h-9 items-center gap-2 rounded-lg border border-border/80 bg-surface px-2.5 py-1 text-left shadow-soft transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-elevated motion-reduce:transform-none md:flex">
                    <span className="text-[10px] font-semibold uppercase text-muted">Today</span>
                    <span className="flex flex-col leading-none">
                      <span className="whitespace-nowrap text-[11px] font-semibold text-text">{todayLabel}</span>
                      <span className="mt-0.5 whitespace-nowrap text-[10px] font-semibold text-muted">{timeLabel}</span>
                    </span>
                  </div>
                </div>
              </div>
            </header>

            {/* Page content */}
            <main className="min-w-0 flex-1 overflow-x-clip px-4 py-5 lg:px-6">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={activePath ?? 'admin'} {...pageMotion}>
                  {children}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        </div>
      </ToastProvider>
    </MotionConfig>
  );
}
