/**
 * Teacher route guard (task 17.1; bugfix: student-signin-role-routing-fix).
 *
 * Wraps the administrative (teacher-only) areas of the application. While the
 * role check is still resolving it renders nothing (avoiding a flash of the
 * sign-in view for an already-authenticated teacher); once resolved, a
 * non-teacher role is redirected to the sign-in route and a teacher or
 * pending-teacher role is allowed through (Req 1.5).
 *
 * This is navigation gating only — Postgres RLS is the authoritative boundary,
 * so a redirect here is a UX convenience, not a security control. There is no
 * teacher signup route to fall back to (Req 1.1, 1.7).
 */

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useUserRole } from '@presentation/auth/useUserRole';

interface RequireTeacherProps {
  /** Where to send a non-teacher actor. Defaults to the sign-in route. */
  redirectTo?: string;
  /** Optional element rendered while the role check is in flight. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Render `children` only for a user whose authoritative role (via
 * `get_my_role()`) is `'teacher'` or `'pending-teacher'`; otherwise redirect.
 *
 * `'pending-teacher'` is let through deliberately: this is what keeps a
 * genuinely new, not-yet-onboarded teacher able to reach `/onboarding`
 * without an infinite redirect loop — the same case that made the previous
 * `actor.kind === 'teacher'` attempt fail, except now the check is
 * authoritative (public.teachers + public.allowed_teacher_emails) instead of
 * a session-claim heuristic, so a student can never be misclassified into
 * this branch. Postgres RLS remains the authoritative security boundary —
 * this guard is a UX convenience, not a security control.
 */
export default function RequireTeacher({
  redirectTo = '/sign-in',
  fallback = null,
  children,
}: RequireTeacherProps) {
  const { isTeacher, isPendingTeacher, loading } = useUserRole();

  if (loading) {
    return <>{fallback}</>;
  }

  if (!isTeacher && !isPendingTeacher) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
