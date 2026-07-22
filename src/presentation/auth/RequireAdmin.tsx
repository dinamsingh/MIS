/**
 * Admin route guard (task 4.1; admin-console-and-scheduling-upgrade).
 *
 * Wraps the Admin Console (`/admin/*`) surfaces. While the role check is
 * still resolving it renders `fallback` (avoiding a flash of admin-only
 * content for a not-yet-resolved actor); once resolved, a non-admin actor is
 * redirected to `redirectTo` and an admin actor is allowed through.
 *
 * Independent of `RequireTeacher` — an admin who is not a teacher still
 * passes this guard and fails `RequireTeacher`, and vice versa (Req 1.9,
 * 1.10). Postgres RLS and each admin RPC's own `is_admin()` check remain the
 * authoritative boundary; this guard is a UX convenience, not a security
 * control.
 */

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useUserRole } from '@presentation/auth/useUserRole';

interface RequireAdminProps {
  /** Where to send a non-admin actor. Defaults to the dashboard route. */
  redirectTo?: string;
  /** Optional element rendered while the role check is in flight. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Render `children` only for a user whose `get_my_role()` roles include
 * `'admin'`; otherwise redirect.
 */
export default function RequireAdmin({
  redirectTo = '/dashboard',
  fallback = null,
  children,
}: RequireAdminProps) {
  const { isAdmin, loading } = useUserRole();

  if (loading) {
    return <>{fallback}</>;
  }

  if (!isAdmin) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
