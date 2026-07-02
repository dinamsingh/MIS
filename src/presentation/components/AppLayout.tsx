import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Sidebar from '@presentation/components/Sidebar';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { formatSectionLabel } from '@presentation/format/sectionLabel';
import { navGroups } from '@presentation/navigation';

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
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { sections, selectedSectionId, setSelectedSectionId, isLoading } = useSelectedSection();
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

  const handleLogout = useCallback(() => {
    setIsUserMenuOpen(false);
    onLogout?.();
  }, [onLogout]);

  useEffect(() => {
    if (!isDrawerOpen && !isUserMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDrawerOpen(false);
        setIsUserMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen, isUserMenuOpen]);

  return (
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

      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button
            type="button"
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px] motion-standard animate-foundation-fade-in"
            aria-label="Close navigation"
            onClick={() => setIsDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[18rem] max-w-[86vw] animate-foundation-slide-up shadow-overlay">
            <Sidebar activePath={activePath} onNavigate={handleNavigate} onLogout={onLogout} mobile />
          </div>
        </div>
      )}

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

              <div className="hidden min-w-0 flex-col gap-0.5 md:flex">
                <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-xs text-muted">
                  <span className="truncate">{activeTrail.group}</span>
                  <span aria-hidden="true">/</span>
                  <span className="truncate font-medium text-soft">{activeTrail.item}</span>
                </nav>
                <p className="truncate text-sm font-semibold text-text">{activeTrail.item}</p>
              </div>

              <div className="flex min-w-0 items-center gap-2 rounded-control border border-border bg-background px-3 py-2 text-xs text-soft shadow-soft">
                <span className="hidden font-medium text-text sm:inline">Section</span>
                <span className="hidden text-muted sm:inline" aria-hidden="true">/</span>
                <div className="relative flex min-w-0 items-center">
                  <select
                    value={selectedSectionId ?? ''}
                    onChange={(e) => setSelectedSectionId(e.target.value)}
                    disabled={isLoading || sections.length === 0}
                    aria-label="Select section"
                    className="max-w-[52vw] cursor-pointer appearance-none bg-transparent pr-5 text-xs font-semibold text-text outline-none disabled:cursor-default disabled:text-muted sm:max-w-[18rem]"
                  >
                    {sections.length === 0 ? (
                      <option value="" className="bg-surface text-text">
                        {isLoading ? 'Loading...' : 'No sections'}
                      </option>
                    ) : (
                      sections.map((section) => (
                        <option key={section.id} value={section.id} className="bg-surface text-text">
                          {formatSectionLabel(section)}
                        </option>
                      ))
                    )}
                  </select>
                  <span className="pointer-events-none absolute right-0 text-muted" aria-hidden="true">
                    v
                  </span>
                </div>
              </div>
            </div>

            <div className="flex min-w-0 items-center justify-end gap-2">
              <label className="hidden h-touch min-w-[14rem] items-center gap-2 rounded-control border border-border bg-background px-3 text-sm text-muted shadow-soft transition-colors duration-fast ease-standard focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25 xl:flex">
                <span aria-hidden="true">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="11" cy="11" r="8" />
                    <path strokeLinecap="round" d="m21 21-4.35-4.35" />
                  </svg>
                </span>
                <span className="sr-only">Search workspace</span>
                <input
                  type="search"
                  placeholder="Search"
                  className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted"
                />
                <kbd className="rounded-sm border border-border bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-muted">
                  /
                </kbd>
              </label>

              <button type="button" className="icon-btn h-touch w-touch xl:hidden" aria-label="Search">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" />
                  <path strokeLinecap="round" d="m21 21-4.35-4.35" />
                </svg>
              </button>

              <div className="hidden h-touch items-center gap-2 rounded-control border border-border bg-background px-3 text-left shadow-soft md:flex">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Today</span>
                <span className="text-xs font-semibold text-text">{todayLabel}</span>
              </div>

              <button type="button" className="icon-btn relative h-touch w-touch" aria-label="Notifications">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
                </svg>
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-status-red ring-2 ring-surface" />
              </button>

              <div className="relative">
                <button
                  type="button"
                  className="flex h-touch items-center gap-2 rounded-control border border-border bg-background px-1.5 pr-2 text-left shadow-soft transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label="Open user menu"
                  aria-haspopup="menu"
                  aria-expanded={isUserMenuOpen}
                  onClick={() => setIsUserMenuOpen((value) => !value)}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-surface">
                    T
                  </span>
                  <span className="hidden min-w-0 flex-col lg:flex">
                    <span className="truncate text-xs font-semibold text-text">Teacher</span>
                    <span className="truncate text-[10px] text-muted">CSE</span>
                  </span>
                  <span className="hidden text-muted lg:inline" aria-hidden="true">v</span>
                </button>

                {isUserMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-56 animate-foundation-scale-in rounded-dialog border border-border bg-surface p-2 shadow-overlay"
                  >
                    <div className="border-b border-border px-3 py-2">
                      <p className="text-sm font-semibold text-text">Teacher</p>
                      <p className="text-xs text-muted">Dept. of CSE</p>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      className="mt-2 flex w-full items-center justify-between rounded-button px-3 py-2 text-left text-sm font-medium text-status-red transition-colors duration-fast ease-standard hover:bg-status-red/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span>Logout</span>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-clip px-4 py-5 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
