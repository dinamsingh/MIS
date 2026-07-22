/**
 * Authoritative role check for routing (admin-console-and-scheduling-upgrade).
 *
 * Wraps the `get_my_role()` RPC, which is the single source of truth for
 * which teacher/admin surfaces the signed-in identity may see. Unlike
 * `actor.kind` (derived client-side from session claims in `actorFromSession`),
 * this consults `public.admins` / `public.teachers` / `public.allowed_teacher_emails`
 * server-side, so it correctly distinguishes a student from a brand-new,
 * not-yet-onboarded (but approved) teacher, and from an admin.
 *
 * `get_my_role()` now returns a `text[]` of role tags (an identity may hold
 * more than one, e.g. an admin who is also a teacher) rather than a single
 * value. `isAdmin`/`isTeacher`/`isPendingTeacher` are derived from `roles`
 * alone — they are never fetched separately.
 *
 * Re-fetches whenever the actor identity changes (sign-in, sign-out, a
 * different user restoring a session) by keying its effect on
 * `actor.kind === 'anonymous' ? null : actor.userId`. While anonymous, the
 * roles are immediately `[]` with no RPC call. On RPC failure, or if the
 * returned array contains any unrecognized tag, the roles resolve to `[]`
 * (fail closed — Property 3).
 */

import { useEffect, useState } from 'react';
import { supabase } from '@data/supabase';
import { useAuth } from './AuthContext';

export type RoleTag = 'admin' | 'teacher' | 'pending-teacher';
const VALID_TAGS: ReadonlySet<string> = new Set(['admin', 'teacher', 'pending-teacher']);

export interface UserRoleStatus {
  /** null while the first check for the current identity is in flight. */
  readonly roles: readonly RoleTag[] | null;
  readonly loading: boolean;
  readonly isAdmin: boolean;
  readonly isTeacher: boolean;
  readonly isPendingTeacher: boolean;
}

export function useUserRole(): UserRoleStatus {
  const { actor, isLoading: authLoading } = useAuth();
  const [roles, setRoles] = useState<readonly RoleTag[] | null>(null);
  const [loading, setLoading] = useState(true);
  // Track the identity key for which `roles` was last resolved, so we can
  // detect when the identity changes mid-render and immediately report
  // loading=true (preventing a one-render window where stale roles from the
  // prior identity are visible — that window caused SignInRoute/RootRedirect
  // to act on stale data and sign the freshly-logged-in user out).
  const [resolvedForKey, setResolvedForKey] = useState<string | null>(null);

  const identityKey = actor.kind === 'anonymous' ? null : actor.userId;

  // If the identity changed since the last resolution, treat as loading
  // regardless of the internal `loading` state (which won't flip to true
  // until the effect fires, one tick later).
  const identityStale = identityKey !== resolvedForKey && identityKey !== null;

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (identityKey === null) {
      // Anonymous — no RPC call needed, and definitely not a teacher or admin.
      setRoles([]);
      setLoading(false);
      setResolvedForKey(null);
      return;
    }

    let active = true;
    setLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_my_role');
        if (!active) return;
        if (error || !Array.isArray(data) || !data.every((r) => VALID_TAGS.has(r))) {
          setRoles([]);
        } else {
          setRoles(data as RoleTag[]);
        }
        setLoading(false);
        setResolvedForKey(identityKey);
      } catch {
        if (active) {
          setRoles([]);
          setLoading(false);
          setResolvedForKey(identityKey);
        }
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey, authLoading]);

  const roleSet = roles ?? [];
  return {
    roles,
    loading: authLoading || loading || identityStale,
    isAdmin: roleSet.includes('admin'),
    isTeacher: roleSet.includes('teacher'),
    isPendingTeacher: roleSet.includes('pending-teacher'),
  };
}
