import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import Sidebar from '@presentation/components/Sidebar';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
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
import { GlobalCommandCenter } from './GlobalCommandCenter';
import { ToastProvider } from './ToastProvider';

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
  } = useSelectedSection();
  const todayLabel = useMemo(() => formatHeaderDate(), []);

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
      setIsDrawerOpen(false);
      onNavigate?.(path);
    },
    [onNavigate],
  );

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
        setIsDrawerOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen]);

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
                onClick={() => setIsDrawerOpen(false)}
                {...overlayBackdropMotion}
              />
              <motion.div className="absolute inset-y-0 left-0 w-[18rem] max-w-[86vw] shadow-overlay" {...drawerMotion('left')}>
                <Sidebar activePath={activePath} onNavigate={handleNavigate} onLogout={onLogout} mobile />
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
          <header className="sticky top-0 z-30 border-b border-border/80 bg-surface/85 px-4 py-3 backdrop-blur-xl lg:px-6">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
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

              <div className="motion-border group flex shrink items-center gap-2 rounded-xl border border-border/80 bg-gradient-to-b from-white to-slate-50 px-3 py-2 shadow-[0_18px_44px_rgba(15,23,42,0.18)] ring-1 ring-white/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_52px_rgba(15,23,42,0.22)] focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15">
                <span className="hidden text-[10px] font-bold uppercase text-muted lg:inline">Section</span>
                <div className="relative flex min-w-0 items-center">
                  <select
                    value={selectedSectionId ?? ''}
                    onChange={(e) => setSelectedSectionId(e.target.value)}
                    disabled={isLoading || sections.length === 0}
                    aria-label="Select section"
                    title={selectedSection ? formatSectionLabel(selectedSection) : undefined}
                    className="w-28 cursor-pointer truncate appearance-none bg-transparent pr-6 text-xs font-bold text-text outline-none disabled:cursor-default disabled:text-muted sm:w-44 lg:w-56"
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
                <div className="motion-border group flex shrink items-center gap-2 rounded-xl border border-border/80 bg-gradient-to-b from-white to-slate-50 px-3 py-2 shadow-[0_18px_44px_rgba(15,23,42,0.18)] ring-1 ring-white/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_52px_rgba(15,23,42,0.22)] focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15">
                  <span className="hidden text-[10px] font-bold uppercase text-muted lg:inline">Subject</span>
                  <div className="relative flex min-w-0 items-center">
                    <select
                      value={selectedSubjectId ?? ''}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      disabled={isSubjectsLoading || subjects.length === 0}
                      aria-label="Select subject"
                      title={subjects.find((s) => s.id === selectedSubjectId)?.name}
                      className="w-28 cursor-pointer truncate appearance-none bg-transparent pr-6 text-xs font-bold text-text outline-none disabled:cursor-default disabled:text-muted sm:w-44 lg:w-56"
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

              <div className="flex min-w-0 items-center justify-end gap-2">
                <button
                  type="button"
                  aria-label="Open command palette"
                  onClick={() => setIsCommandOpen(true)}
                  className="motion-interactive hidden h-touch min-w-0 items-center gap-2 rounded-xl border border-border/80 bg-white px-3 text-left text-xs font-semibold text-soft shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition-[width,background-color,color,box-shadow,transform] duration-200 hover:w-36 hover:bg-secondary hover:text-text focus-visible:w-36 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:flex sm:w-28"
                >
                  <span className="truncate">Search</span>
                  <kbd className="rounded-sm border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted">Ctrl K</kbd>
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
                <div className="motion-border hidden h-touch items-center gap-2 rounded-xl border border-border/80 bg-white px-3 text-left shadow-[0_8px_24px_rgba(15,23,42,0.06)] md:flex">
                  <span className="text-[10px] font-semibold uppercase text-muted">Today</span>
                  <span className="text-xs font-semibold text-text">{todayLabel}</span>
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
