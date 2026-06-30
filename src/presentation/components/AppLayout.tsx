import { useState, type ReactNode } from 'react';
import Sidebar from '@presentation/components/Sidebar';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { formatSectionLabel } from '@presentation/format/sectionLabel';

interface AppLayoutProps {
  activePath?: string;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
  children?: ReactNode;
}

/**
 * Application layout shell — sidebar + top bar + content. The top bar holds the
 * single global section selector (driven by the database via
 * {@link useSelectedSection}); switching it changes the active section for
 * every section-aware page at once.
 */
export default function AppLayout({ activePath, onNavigate, onLogout, children }: AppLayoutProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { sections, selectedSectionId, setSelectedSectionId, isLoading } = useSelectedSection();

  const handleNavigate = (path: string) => {
    setIsDrawerOpen(false);
    onNavigate?.(path);
  };

  return (
    <div className="flex min-h-screen w-full bg-background text-text">
      {/* Docked sidebar — desktop */}
      <aside className="hidden shrink-0 lg:block">
        <Sidebar activePath={activePath} onNavigate={handleNavigate} onLogout={onLogout} />
      </aside>

      {/* Mobile drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            aria-hidden="true"
            onClick={() => setIsDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 z-50 shadow-xl">
            <Sidebar activePath={activePath} onNavigate={handleNavigate} onLogout={onLogout} />
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2.5 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setIsDrawerOpen(true)}
              className="rounded-lg p-2 text-soft hover:bg-background lg:hidden"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Single global Section selector (database-driven) */}
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-soft">
              <span className="font-medium text-text">Section</span>
              <span className="text-muted">·</span>
              <div className="relative flex items-center">
                <select
                  value={selectedSectionId ?? ''}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                  disabled={isLoading || sections.length === 0}
                  aria-label="Select section"
                  className="appearance-none bg-transparent pr-4 font-semibold text-text outline-none cursor-pointer disabled:cursor-default disabled:text-muted"
                >
                  {sections.length === 0 ? (
                    <option value="" className="bg-surface text-text">
                      {isLoading ? 'Loading…' : 'No sections'}
                    </option>
                  ) : (
                    sections.map((s) => (
                      <option key={s.id} value={s.id} className="bg-surface text-text">
                        {formatSectionLabel(s)}
                      </option>
                    ))
                  )}
                </select>
                <span className="pointer-events-none absolute right-0 text-muted">▾</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-lg p-2 text-soft hover:bg-background" aria-label="Search">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" />
              </svg>
            </button>
            <button type="button" className="relative rounded-lg p-2 text-soft hover:bg-background" aria-label="Notifications">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-status-red text-[9px] font-bold text-white">
                3
              </span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-5 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
