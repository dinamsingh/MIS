import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { isFeatureEnabled } from '@domain/featureFlags';
import { useAuth } from '@presentation/auth';
import { useUserRole } from '@presentation/auth/useUserRole';
import { supabase } from '@data/supabase';
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
  onClose?: () => void;
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
  onClose,
}: SidebarProps) {
  const isCollapsed = collapsed && !mobile;
  const { actor } = useAuth();
  const { isAdmin } = useUserRole();
  // The `admin` nav group is statically present in navGroups (other
  // consumers like GlobalCommandCenter and AppLayout's activeTrail
  // computation read the same array), but only rendered here for an admin
  // actor — this is the sole visibility gate (Req 1.9, 1.10).
  const visibleNavGroups = useMemo(
    () => navGroups.filter((group) => group.id !== 'admin' || isAdmin),
    [isAdmin],
  );
  const fallbackTeacherName = actor.kind === 'teacher' ? nameFromEmail(actor.email) || 'Teacher' : 'Teacher';
  const [teacherName, setTeacherName] = useState(fallbackTeacherName);
  const displayTeacherName = useMemo(() => compactTeacherName(teacherName), [teacherName]);
  const teacherInitial = displayTeacherName.charAt(0).toUpperCase() || 'T';

  const [visitedFeatures, setVisitedFeatures] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    
    // First try localStorage for instant load
    try {
      const stored = window.localStorage.getItem('visited_features');
      if (stored) {
        setVisitedFeatures(JSON.parse(stored));
      }
    } catch {}

    // Then sync with database (Supabase user_metadata)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (active && user?.user_metadata?.visited_features) {
        setVisitedFeatures(user.user_metadata.visited_features);
      }
    }).catch(() => {});

    return () => { active = false; };
  }, []);

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

  const handleSidebarNavigate = (path: string) => {
    if (!visitedFeatures[path]) {
      const next = { ...visitedFeatures, [path]: Date.now() };
      setVisitedFeatures(next);
      
      // Save locally for instant UI updates next time
      try {
        window.localStorage.setItem('visited_features', JSON.stringify(next));
      } catch {}
      
      // Save to database
      supabase.auth.updateUser({
        data: { visited_features: next }
      }).catch(console.error);
    }
    
    if (mobile) {
      onClose?.();
    }
    onNavigate?.(path);
  };

  const getBadge = (item: any) => {
    if (item.badge !== 'NEW') return item.badge;
    const visitedTime = visitedFeatures[item.path];
    if (!visitedTime) return 'NEW';
    if (Date.now() - visitedTime < 48 * 60 * 60 * 1000) return 'NEW';
    return undefined;
  };

  return (
    <nav
      aria-label="Primary"
      className={[
        'relative flex h-full max-h-screen flex-col overflow-hidden border-r border-sidebar-border/80 bg-[linear-gradient(180deg,rgb(var(--color-surface))_0%,rgb(var(--color-sidebar))_46%,rgb(var(--color-secondary))_100%)] text-sidebar-foreground shadow-[6px_0_30px_rgb(var(--color-text)/0.06)] transition-[width] duration-slow ease-entrance motion-reduce:transition-none',
        isCollapsed ? 'w-20' : 'w-72',
      ].join(' ')}
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-border to-transparent" aria-hidden="true" />

      <div className={`relative flex h-[4.25rem] shrink-0 items-center border-b border-sidebar-border/70 bg-surface/70 px-4 backdrop-blur-xl ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
        {!isCollapsed && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-[linear-gradient(135deg,rgb(var(--color-accent))_0%,rgb(var(--color-text-soft))_100%)] text-sm font-black text-surface shadow-elevated ring-1 ring-border/60">
            A
          </span>
        )}
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              className="min-w-0 flex-1"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: motionDurations.fast, ease: motionEase }}
            >
              <p className="truncate text-sm font-black tracking-tight text-text">Academic MIS</p>
              <p className="truncate text-[11px] font-semibold text-muted">Teacher Workspace</p>
            </motion.div>
          )}
        </AnimatePresence>
        {!mobile && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="icon-btn h-8 w-8 shrink-0 border border-border/70 bg-surface/80 shadow-soft hover:border-border hover:bg-secondary"
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
        {mobile && (
          <button
            type="button"
            onPointerDown={onClose}
            onClick={onClose}
            className="icon-btn h-9 w-9 shrink-0 border border-border/70 bg-surface/85 shadow-soft hover:border-border hover:bg-secondary"
            aria-label="Close navigation"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-3 py-4">
        {visibleNavGroups.map((group) => (
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
                const isActive = activePath === item.path || item.children?.some((child) => child.path === activePath);
                const effectivelyLocked = item.locked && !isFeatureEnabled('ai');
                return (
                  <li key={item.id} className="group flex flex-col gap-1">
                    <motion.button
                      layout
                      type="button"
                      title={isCollapsed ? item.label : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      aria-disabled={effectivelyLocked || undefined}
                      onClick={() => !effectivelyLocked && handleSidebarNavigate(item.path)}
                      className={[
                        'motion-interactive group relative flex min-h-touch w-full touch-manipulation items-center rounded-control border text-left text-[13px] font-semibold transition-[transform,border-color,background-color,color,box-shadow] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
                        isCollapsed ? 'justify-center px-0' : 'gap-3 px-3',
                        effectivelyLocked
                          ? 'cursor-not-allowed border-transparent text-muted/60'
                          : isActive
                            ? 'border-teal-200/20 bg-[linear-gradient(140deg,rgb(6,78,75)_0%,rgb(13,116,106)_52%,rgb(20,184,166)_100%)] text-white shadow-[0_14px_32px_rgba(13,116,106,0.28)] ring-1 ring-teal-100/20'
                            : 'border-transparent text-soft hover:border-accent/20 hover:bg-[linear-gradient(135deg,rgb(var(--color-accent-tint))_0%,rgb(var(--color-surface))_58%,rgb(var(--color-secondary))_100%)] hover:text-text hover:shadow-elevated',
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
                          {getBadge(item) && (
                            <motion.span
                              key="badge"
                              className={[
                                'rounded-sm border px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none',
                                getBadge(item) === 'AI'
                                  ? 'border-accent/10 bg-accent-tint text-accent'
                                  : getBadge(item) === 'NEW'
                                    ? 'border-status-green/10 bg-status-green/10 text-status-green'
                                    : 'border-accent/10 bg-accent-tint text-accent',
                              ].join(' ')}
                              initial={{ opacity: 0, scale: 0.96 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.96 }}
                              transition={{ duration: motionDurations.fast, ease: motionEase }}
                            >
                              {getBadge(item)}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      )}
                    </motion.button>
                    {!isCollapsed && item.children && item.children.length > 0 && (
                      <motion.ul
                        className={[
                          'ml-10 flex flex-col gap-1 overflow-hidden border-l border-sidebar-border/70 pl-2 transition-all duration-fast ease-standard',
                          isActive ? 'max-h-28 opacity-100' : 'max-h-0 opacity-0 group-hover:max-h-28 group-hover:opacity-100 group-focus-within:max-h-28 group-focus-within:opacity-100',
                        ].join(' ')}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: motionDurations.fast, ease: motionEase }}
                      >
                        {item.children.map((child) => {
                          const childActive = activePath === child.path;
                          return (
                            <li key={child.id}>
                              <button
                                type="button"
                                onClick={() => handleSidebarNavigate(child.path)}
                                aria-current={childActive ? 'page' : undefined}
                                className={[
                                  'group flex min-h-8 w-full items-center gap-2 rounded-button border px-2 text-left text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                  childActive
                                    ? 'border-accent/20 bg-accent-tint text-accent'
                                    : 'border-transparent text-muted hover:border-accent/15 hover:bg-surface hover:text-text',
                                ].join(' ')}
                              >
                                <span className="flex h-5 min-w-5 items-center justify-center rounded-sm bg-surface text-[9px] font-black text-soft ring-1 ring-border/70">
                                  {child.icon}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{child.label}</span>
                                {child.badge && (
                                  <span className="rounded-sm border border-status-green/10 bg-status-green/10 px-1 py-0.5 text-[8px] font-bold uppercase leading-none text-status-green">
                                    {child.badge}
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </motion.ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="relative shrink-0 border-t border-sidebar-border/70 bg-surface/65 p-3 backdrop-blur-xl">
        <div
          className={[
            'motion-border flex items-center rounded-control border border-border/80 bg-[linear-gradient(135deg,rgb(var(--color-surface))_0%,rgb(var(--color-secondary))_100%)] p-2 shadow-elevated',
            isCollapsed ? 'justify-center' : 'gap-2',
          ].join(' ')}
        >
          <button
            type="button"
            onClick={() => handleSidebarNavigate('/profile')}
            aria-current={activePath === '/profile' ? 'page' : undefined}
            title="Profile"
            className={[
              'motion-interactive flex min-w-0 items-center rounded-button border text-left transition-[border-color,background-color,box-shadow,transform] duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              activePath === '/profile'
                ? 'border-border bg-surface shadow-soft'
                : 'border-transparent hover:border-border/80 hover:bg-surface/90 hover:shadow-soft',
              isCollapsed ? 'justify-center p-1' : 'flex-1 gap-3 p-1',
            ].join(' ')}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent/10 bg-accent/10 text-sm font-black text-accent shadow-soft">
              {teacherInitial}
            </span>
            {!isCollapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-text">{displayTeacherName}</span>
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
