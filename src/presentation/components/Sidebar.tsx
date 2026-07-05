import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { isFeatureEnabled } from '@domain/featureFlags';
import { useAuth } from '@presentation/auth';
import { fetchTeacherProfile } from '../../features/onboarding/api/onboarding';
import { navGroups } from '@presentation/navigation';
import { motionDurations, motionEase } from '@presentation/motion';

interface SidebarProps {
  activePath?: string;
  collapsed?: boolean;
  mobile?: boolean;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
  onToggleCollapse?: () => void;
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()).trim();
}

function compactTeacherName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return parts[0] ?? 'Teacher';
  }

  const fullName = parts.join(' ');
  if (fullName.length <= 18) {
    return fullName;
  }

  return `${parts[0]} ${parts[parts.length - 1]?.charAt(0).toUpperCase() ?? ''}.`;
}

/**
 * Primary navigation shell. The item model remains in navigation.ts; this
 * component only controls layout, responsive behavior, and visual state.
 */
export default function Sidebar({
  activePath,
  collapsed = false,
  mobile = false,
  onNavigate,
  onLogout,
  onToggleCollapse,
}: SidebarProps) {
  const isCollapsed = collapsed && !mobile;
  const { actor } = useAuth();
  const fallbackTeacherName = actor.kind === 'teacher' ? nameFromEmail(actor.email) || 'Teacher' : 'Teacher';
  const [teacherName, setTeacherName] = useState(fallbackTeacherName);
  const displayTeacherName = useMemo(() => compactTeacherName(teacherName), [teacherName]);
  const teacherInitial = displayTeacherName.charAt(0).toUpperCase() || 'T';

  useEffect(() => {
    let active = true;
    setTeacherName(fallbackTeacherName);
    if (actor.kind !== 'teacher') {
      return () => {
        active = false;
      };
    }

    fetchTeacherProfile()
      .then((profile) => {
        if (active) {
          setTeacherName(profile.name.trim() || fallbackTeacherName);
        }
      })
      .catch(() => {
        if (active) {
          setTeacherName(fallbackTeacherName);
        }
      });

    return () => {
      active = false;
    };
  }, [actor.kind, fallbackTeacherName]);

  return (
    <nav
      aria-label="Primary"
      className={[
        'flex h-full max-h-screen flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-soft transition-[width] duration-slow ease-entrance motion-reduce:transition-none',
        isCollapsed ? 'w-20' : 'w-72',
      ].join(' ')}
    >
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent text-sm font-bold text-surface shadow-soft">
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
              <p className="truncate text-sm font-bold text-text">Academic MIS</p>
              <p className="truncate text-[11px] font-medium text-muted">Teacher Workspace</p>
            </motion.div>
          )}
        </AnimatePresence>
        {!mobile && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="icon-btn h-8 w-8 shrink-0"
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
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.id} className="flex flex-col gap-1">
            {!isCollapsed ? (
              <motion.p
                className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted"
                initial={{ opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: motionDurations.fast, ease: motionEase }}
              >
                {group.label}
              </motion.p>
            ) : (
              <div className="mx-auto my-1 h-px w-8 bg-sidebar-border" aria-hidden="true" />
            )}

            <ul className="flex flex-col gap-1">
              {group.items.map((item) => {
                const isActive = activePath === item.path;
                const effectivelyLocked = item.locked && !isFeatureEnabled('ai');
                return (
                  <li key={item.id}>
                    <motion.button
                      layout
                      type="button"
                      title={isCollapsed ? item.label : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      aria-disabled={effectivelyLocked || undefined}
                      onClick={() => !effectivelyLocked && onNavigate?.(item.path)}
                      className={[
                        'motion-interactive group relative flex min-h-touch w-full items-center rounded-control text-left text-[13px] font-medium transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
                        isCollapsed ? 'justify-center px-0' : 'gap-3 px-3',
                        effectivelyLocked
                          ? 'cursor-not-allowed text-muted/60'
                          : isActive
                            ? 'bg-accent text-surface shadow-soft'
                            : 'text-soft hover:bg-sidebar-accent hover:text-text',
                      ].join(' ')}
                    >
                      {isActive && (
                        <motion.span
                          layoutId={mobile ? 'mobile-sidebar-active-indicator' : 'desktop-sidebar-active-indicator'}
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
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-button text-sm transition-transform duration-fast ease-standard group-hover:scale-105 motion-reduce:transition-none',
                          isActive ? 'bg-surface/15' : 'bg-background/70',
                        ].join(' ')}
                        aria-hidden="true"
                      >
                        {item.icon}
                      </span>
                      {!isCollapsed && (
                        <AnimatePresence initial={false}>
                          <motion.span
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
                              className={[
                                'rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none',
                                item.badge === 'AI'
                                  ? 'bg-accent-tint text-accent'
                                  : item.badge === 'NEW'
                                    ? 'bg-status-green/10 text-status-green'
                                    : 'bg-accent-tint text-accent',
                              ].join(' ')}
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

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <div
          className={[
            'flex items-center rounded-control border border-border bg-surface p-2 shadow-soft',
            isCollapsed ? 'justify-center' : 'gap-2',
          ].join(' ')}
        >
          <button
            type="button"
            onClick={() => onNavigate?.('/profile')}
            aria-current={activePath === '/profile' ? 'page' : undefined}
            title="Profile"
            className={[
              'flex min-w-0 items-center rounded-button text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              activePath === '/profile' ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent',
              isCollapsed ? 'justify-center p-1' : 'flex-1 gap-3 p-1',
            ].join(' ')}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
              {teacherInitial}
            </span>
            {!isCollapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-text">{displayTeacherName}</span>
                <span className="block truncate text-[10px] text-muted">View profile</span>
              </span>
            )}
          </button>
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
}
