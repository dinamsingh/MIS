import { isFeatureEnabled } from '@domain/featureFlags';
import { navGroups } from '@presentation/navigation';

interface SidebarProps {
  activePath?: string;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
}

/**
 * Left sidebar matching the mockup — grouped nav with icons, badges,
 * AI locked state, and teacher avatar at the bottom.
 */
export default function Sidebar({ activePath, onNavigate, onLogout }: SidebarProps) {
  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-64 flex-col overflow-y-auto border-r border-border bg-surface"
    >
      {/* Logo / Brand */}
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
          A
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-text">Academic MIS</span>
          <span className="text-[10px] text-muted">Teacher Workspace</span>
        </div>
      </div>

      {/* Nav groups */}
      <div className="flex flex-1 flex-col gap-5 px-3 py-2">
        {navGroups.map((group) => (
          <div key={group.id} className="flex flex-col gap-0.5">
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive = activePath === item.path;
                const effectivelyLocked = item.locked && !isFeatureEnabled('ai');
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={isActive ? 'page' : undefined}
                      aria-disabled={effectivelyLocked || undefined}
                      onClick={() => !effectivelyLocked && onNavigate?.(item.path)}
                      className={[
                        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors',
                        effectivelyLocked
                          ? 'cursor-not-allowed text-muted/60'
                          : isActive
                            ? 'bg-accent/10 text-accent'
                            : 'text-soft hover:bg-background hover:text-text',
                      ].join(' ')}
                    >
                      <span className="w-5 text-center text-sm">{item.icon}</span>
                      <span className="flex-1">{item.label}</span>
                      {item.badge && (
                        <span
                          className={[
                            'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase',
                            item.badge === 'AI'
                              ? 'bg-purple-100 text-purple-600'
                              : item.badge === 'NEW'
                                ? 'bg-status-green/10 text-status-green'
                                : 'bg-accent-tint text-accent',
                          ].join(' ')}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Teacher profile footer + logout */}
      <div className="border-t border-border px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
            T
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-text">Teacher</p>
            <p className="truncate text-[10px] text-muted">Dept. of CSE</p>
          </div>
          <button
            type="button"
            onClick={() => onLogout?.()}
            className="rounded-lg p-1.5 text-soft hover:bg-status-red/10 hover:text-status-red transition-colors"
            aria-label="Logout"
            title="Logout"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}
