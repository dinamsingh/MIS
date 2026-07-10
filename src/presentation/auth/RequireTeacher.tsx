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

  // Only an actor resolved as `teacher` may reach the teacher area. Any other
  // kind — anonymous, student, or otherwise — is redirected. Students never
  // navigate here — they use the public /quiz/:token routes.
  if (actor.kind !== 'teacher') {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
