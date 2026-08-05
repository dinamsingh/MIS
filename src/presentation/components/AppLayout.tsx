import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import Sidebar from '@presentation/components/Sidebar';
import { useOptionalSelectedSection } from '@presentation/context/SelectedSectionContext';
import { formatSectionLabel } from '@presentation/format/sectionLabel';
import { navGroups } from '@presentation/navigation';
import {
  applyMotionDisabledPreference,
  drawerMotion,
  MOTION_PREFERENCE_EVENT,
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
import { GlobalCommandCenter } from './GlobalCommandCenter';
import { ToastProvider } from './ToastProvider';
import { ThemeToggle } from '@presentation/components/ui/ThemeToggle';

interface AppLayoutProps {
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

/**
 * Application layout shell: responsive sidebar, sticky topbar, global section
 * selector, and content frame. This component owns layout-only state; routes,
 * auth, selected-section behavior, and page data loading remain unchanged.
 */
export default function AppLayout({ activePath, onNavigate, onLogout, children }: AppLayoutProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [motionDisabled, setMotionDisabled] = useState(() => readMotionDisabledPreference());
  const [theme, setTheme] = useState<ThemePreference>(() => readThemePreference());
  // `AdminShell` deliberately renders this layout without a
  // `SelectedSectionProvider` (the Admin Console manages its own sections,
  // per `design.md`) — fall back to an empty/inert section+subject state
  // instead of throwing, so the top bar's section/subject dropdowns simply
  // render as "No sections" for an admin-only identity (bugfix:
  // admin-only-sign-in-redirect).
  const selectedSectionCtx = useOptionalSelectedSection();
  const {
    sections,
    selectedSectionId,
    selectedSection,
    setSelectedSectionId,
    isLoading,
    subjects,
    selectedSubjectId,
    setSelectedSubjectId,
    isSubjectsLoading,
  } = selectedSectionCtx ?? {
    sections: [],
    selectedSectionId: null,
    selectedSection: null,
    setSelectedSectionId: () => {},
    isLoading: false,
    subjects: [],
    selectedSubjectId: null,
    setSelectedSubjectId: () => {},
    isSubjectsLoading: false,
  };
  const todayLabel = useMemo(() => formatHeaderDate(), []);
  const [timeLabel, setTimeLabel] = useState(() => formatHeaderTime());
  const isDarkTheme = theme === 'dark';

  const closeMobileDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const activeTrail = useMemo(() => {
    for (const group of navGroups) {
      const item = group.items.find((candidate) => candidate.path === activePath);
      if (item) {
        return { group: group.label, item: item.label };
      }
    }
    return { group: 'Workspace', item: 'Dashboard' };
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

  // The section dropdown shows ONLY the section (clean). Subjects live in their
  // own global dropdown beside it.
  const sectionOptionLabel = useCallback(
    (section: typeof sections[number]) => formatSectionLabel(section),
    [],
  );

  useEffect(() => {
    if (!isDrawerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMobileDrawer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeMobileDrawer, isDrawerOpen]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    if (typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleViewportChange = () => {
      if (mediaQuery.matches) {
        closeMobileDrawer();
      }
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

  useEffect(() => {
    applyThemePreference(theme);
  }, [theme]);

  useEffect(() => {
    const interval = window.setInterval(() => setTimeLabel(formatHeaderTime()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    closeMobileDrawer();
    setIsCommandOpen(false);
    setIsShortcutsOpen(false);
  }, [activePath, closeMobileDrawer]);

  return (
    <MotionConfig reducedMotion={motionDisabled ? 'always' : 'user'}>
      <ToastProvider>
      <div className="flex min-h-screen w-full overflow-x-clip bg-secondary text-text">
        <aside className="fixed inset-y-0 left-0 z-40 hidden h-screen max-h-screen shrink-0 lg:block">
          <Sidebar
            activePath={activePath}
            collapsed={isSidebarCollapsed}
            onNavigate={handleNavigate}
            onLogout={onLogout}
            onToggleCollapse={() => setIsSidebarCollapsed((value) => !value)}
          />
        </aside>

        <AnimatePresence>
          {isDrawerOpen && (
            <motion.div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
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
                <Sidebar
                  activePath={activePath}
                  onNavigate={handleNavigate}
                  onLogout={onLogout}
                  onClose={closeMobileDrawer}
                  mobile
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className={[
            'flex min-w-0 flex-1 flex-col transition-[padding-left] duration-slow ease-entrance motion-reduce:transition-none',
            isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72',
          ].join(' ')}
        >
          <header className="sticky top-0 z-30 border-b border-border/70 bg-surface/90 px-3 py-2 backdrop-blur-xl lg:px-5">
            <div className="flex flex-wrap min-w-0 items-center justify-between gap-x-2 gap-y-3">
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

              <div className="motion-border group flex min-w-0 shrink items-center gap-1.5 rounded-lg border border-border/70 bg-surface/95 px-2 py-1.5 shadow-soft ring-1 ring-border/45 transition-[transform,border-color,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-surface hover:shadow-elevated focus-within:-translate-y-0.5 focus-within:border-accent/60 focus-within:shadow-elevated focus-within:ring-2 focus-within:ring-accent/15 motion-reduce:transform-none">
                <span className="hidden text-[10px] font-bold uppercase text-muted 2xl:inline">Section</span>
                <div className="relative flex min-w-0 items-center">
                  <select
                    value={selectedSectionId ?? ''}
                    onChange={(e) => setSelectedSectionId(e.target.value)}
                    disabled={isLoading || sections.length === 0}
                    aria-label="Select section"
                    title={selectedSection ? formatSectionLabel(selectedSection) : undefined}
                    className="w-24 cursor-pointer truncate appearance-none bg-transparent pr-5 text-xs font-bold text-text outline-none disabled:cursor-default disabled:text-muted sm:w-32 lg:w-36 xl:w-44"
                  >
                    {sections.length === 0 ? (
                      <option value="" className="bg-surface text-text">
                        {isLoading ? 'Loading...' : 'No sections'}
                      </option>
                    ) : (
                      sections.map((section) => (
                        <option key={section.id} value={section.id} className="bg-surface text-text">
                          {sectionOptionLabel(section)}
                        </option>
                      ))
                    )}
                  </select>
                  <span className="pointer-events-none absolute right-0 text-muted transition-colors group-focus-within:text-accent" aria-hidden="true">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </span>
                </div>
              </div>

              {(subjects.length > 0 || isSubjectsLoading) && (
                <div className="motion-border group flex min-w-0 shrink items-center gap-1.5 rounded-lg border border-border/70 bg-surface/95 px-2 py-1.5 shadow-soft ring-1 ring-border/45 transition-[transform,border-color,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-surface hover:shadow-elevated focus-within:-translate-y-0.5 focus-within:border-accent/60 focus-within:shadow-elevated focus-within:ring-2 focus-within:ring-accent/15 motion-reduce:transform-none">
                  <span className="hidden text-[10px] font-bold uppercase text-muted 2xl:inline">Subject</span>
                  <div className="relative flex min-w-0 items-center">
                    <select
                      value={selectedSubjectId ?? ''}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      disabled={isSubjectsLoading || subjects.length === 0}
                      aria-label="Select subject"
                      title={subjects.find((s) => s.id === selectedSubjectId)?.name}
                      className="w-24 cursor-pointer truncate appearance-none bg-transparent pr-5 text-xs font-bold text-text outline-none disabled:cursor-default disabled:text-muted sm:w-32 lg:w-36 xl:w-44"
                    >
                      {subjects.length === 0 ? (
                        <option value="" className="bg-surface text-text">
                          {isSubjectsLoading ? 'Loading...' : 'No subjects'}
                        </option>
                      ) : (
                        subjects.map((subject) => (
                          <option key={subject.id} value={subject.id} className="bg-surface text-text">
                            {subject.name}
                          </option>
                        ))
                      )}
                    </select>
                    <span className="pointer-events-none absolute right-0 text-muted transition-colors group-focus-within:text-accent" aria-hidden="true">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </span>
                  </div>
                </div>
              )}
            </div>

              <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
                <button
                  type="button"
                  aria-label="Open command palette"
                  onClick={() => setIsCommandOpen(true)}
                  className="motion-interactive hidden h-9 min-w-0 items-center gap-2 rounded-lg border border-border/80 bg-surface px-2.5 text-left text-xs font-semibold text-soft shadow-soft transition-[width,background-color,color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:bg-secondary hover:text-text hover:shadow-elevated focus-visible:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none sm:flex"
                >
                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="9" cy="9" r="5.5" />
                    <path d="m13 13 3 3" strokeLinecap="round" />
                  </svg>
                  <span className="truncate">Search</span>
                </button>
                <button
                  type="button"
                  aria-label="Open command palette"
                  onClick={() => setIsCommandOpen(true)}
                  className="icon-btn h-touch w-touch sm:hidden"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="9" cy="9" r="5.5" />
                    <path d="m13 13 3 3" strokeLinecap="round" />
                  </svg>
                </button>
                <ThemeToggle />
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

          <main className="min-w-0 flex-1 overflow-x-clip px-4 py-5 lg:px-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={activePath ?? 'workspace'} {...pageMotion}>
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
        <GlobalCommandCenter
          activePath={activePath}
          open={isCommandOpen}
          shortcutsOpen={isShortcutsOpen}
          onOpenChange={setIsCommandOpen}
          onShortcutsOpenChange={setIsShortcutsOpen}
          onNavigate={handleNavigate}
        />
      </div>
      </ToastProvider>
    </MotionConfig>
  );
}
