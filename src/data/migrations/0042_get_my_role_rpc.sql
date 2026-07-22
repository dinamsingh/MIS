-- ============================================================================
-- Migration: 0042_get_my_role_rpc
-- Authoritative, client-callable role check for post-authentication routing.
--
-- Problem
-- -------
-- Client-side routing (RootRedirect, SignInRoute, RequireTeacher,
-- OnboardingRoute) currently gates on actor.kind !== 'anonymous', because the
-- client has no reliable way to distinguish "student" from "new teacher not
-- yet onboarded" — both look identical from session claims alone
-- (actorFromSession resolves either case to 'student'). The authoritative
-- answer already exists server-side: public.teachers (is this uid a teacher?)
-- and public.allowed_teacher_emails (is this email approved to become one?).
-- But allowed_teacher_emails is only readable by EXISTING teachers
-- (allowed_teacher_emails_read: using (is_teacher())), so a not-yet-onboarded
-- pending teacher — and every student — cannot consult it directly.
--
-- Fix
-- ---
-- get_my_role() — callable by any authenticated user, SECURITY DEFINER so it
-- can read both tables regardless of the caller's own RLS, returns exactly
-- one of:
--   'teacher'         — a public.teachers row exists for auth.uid()
--   'pending-teacher' — no teachers row, but lower(auth.email()) is present
--                        in public.allowed_teacher_emails
--   'none'            — neither condition holds (every current and future
--                        student, regardless of auth method, resolves here)
-- Fails closed to 'none' when auth.uid() or auth.email() is null.
--
-- Scope: purely additive. No existing function, policy, or trigger is
-- modified. Does not grant write access to allowed_teacher_emails or
-- teachers — this is a read-only status check.
--
-- Idempotent: CREATE OR REPLACE, safe to re-apply.
-- ============================================================================

create or replace function public.get_my_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_uid   uuid := auth.uid();
    v_email text := lower(coalesce(auth.email(), ''));
begin
    if v_uid is null or v_email = '' then
        return 'none';
    end if;

    if exists (select 1 from public.teachers t where t.id = v_uid) then
        return 'teacher';
    end if;

    if exists (
        select 1 from public.allowed_teacher_emails a where lower(a.email) = v_email
    ) then
        return 'pending-teacher';
    end if;

    return 'none';
end;
$$;

comment on function public.get_my_role() is
  'Authoritative role check for client-side routing only. Returns teacher (has a public.teachers row), pending-teacher (no row yet, but email is on public.allowed_teacher_emails), or none (every other authenticated identity, including all students). Fails closed to none on missing uid/email. Does not affect RLS or is_teacher(); RLS remains the authorization boundary.';

grant execute on function public.get_my_role() to authenticated;

notify pgrst, 'reload schema';
