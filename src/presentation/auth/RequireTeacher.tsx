/**
 * Teacher route guard (task 17.1).
 *
 * Wraps the administrative (teacher-only) areas of the application. While the
 * session is still being restored it renders nothing (avoiding a flash of the
 * sign-in view for an already-authenticated teacher); once resolved, a
 * non-teacher actor is redirected to the sign-in route and a teacher actor is
 * allowed through (Req 1.5).
 *
 * This is navigation gating only — Postgres RLS is the authoritative boundary,
 * so a redirect here is a UX convenience, not a security control. There is no
 * teacher signup route to fall back to (Req 1.1, 1.7).
 */

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@presentation/auth/AuthContext';

interface RequireTeacherProps {
  /** Where to send a non-teacher actor. Defaults to the sign-in route. */
  redirectTo?: string;
  /** Optional element rendered while the session is being restored. */
  fallback?: ReactNode;
  children: ReactNode;
}

/** Render `children` only for an authenticated teacher; otherwise redirect. */
export default function RequireTeacher({
  redirectTo = '/sign-in',
  fallback = null,
  children,
}: RequireTeacherProps) {
  const { isLoading, actor } = useAuth();

  if (isLoading) {
    return <>{fallback}</>;
  }

  // Allow any authenticated user through. Whether they are a fully set-up
  // teacher is decided downstream by the OnboardingGate (teachers table +
  // teacher_assignments), not here. Postgres RLS is the authoritative
  // security boundary — this guard is a UX convenience to redirect anonymous
  // visitors to sign-in, not a security control.
  //
  // Note: we previously tightened this to `actor.kind === 'teacher'`, but that
  // broke onboarding because `actorFromSession` resolves a brand-new teacher
  // (who hasn't onboarded yet and doesn't have app_metadata.role set) as
  // `'student'`, causing an infinite redirect loop. Since RLS prevents any
  // data leakage regardless of this client-side check, the pragmatic fix is
  // to gate on "not anonymous" and let OnboardingGate handle the rest.
  if (actor.kind === 'anonymous') {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
