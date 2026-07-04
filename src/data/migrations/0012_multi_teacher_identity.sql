-- ============================================================================
-- Migration: 0012_multi_teacher_identity
-- Multi-teacher support — Step 1: membership-based is_teacher().
--
-- Problem
-- -------
-- The original is_teacher() (0002) identifies THE single provisioned teacher by
-- either a JWT `role: teacher` claim OR an email match against the
-- `app.teacher_email` database setting. Every legacy app table
-- (sections, students, attendance, marks, timetable, subjects, ...) has RLS
-- `using (is_teacher())`. Once we moved to the onboarding model, teachers log in
-- with their OWN email (not the single configured one) and carry no role claim,
-- so is_teacher() returns false for them → every read/write to those tables is
-- denied by RLS → after onboarding the dashboard/section selector loads nothing.
--
-- Fix
-- ---
-- Treat ANY user who has a row in `public.teachers` (created by the onboarding
-- wizard) as a teacher, in addition to the two legacy checks (kept for backward
-- compatibility). This removes the hardcoded-email dependency entirely: a user
-- becomes a teacher by completing onboarding, and students (who never create a
-- teachers row) remain outside the teacher area.
--
-- Because RLS policies call is_teacher() while evaluating access to many tables,
-- the function is made SECURITY DEFINER so it can read `public.teachers`
-- regardless of the caller's own RLS. There is no recursion risk: the `teachers`
-- table's own policies gate on `id = auth.uid()`, never on is_teacher().
--
-- Scope: this migration ONLY redefines is_teacher(). It does not add per-teacher
-- ownership of operational data (attendance/marks/timetable/quizzes) — under
-- this step those tables are shared across all teachers (the chosen "shared
-- roster" model). Per-teacher isolation of operational data is a later step.
--
-- Idempotent: uses CREATE OR REPLACE, safe to re-apply.
-- ============================================================================

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- 1. Explicit JWT role claim (fast path, no table read).
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'teacher',
      false
    )
    -- 2. Legacy single-teacher email match (kept for backward compatibility).
    or coalesce(
      nullif(current_setting('app.teacher_email', true), '') is not null
      and lower(auth.jwt() ->> 'email')
            = lower(nullif(current_setting('app.teacher_email', true), '')),
      false
    )
    -- 3. NEW: membership — any authenticated user who has a teachers row
    --    (i.e. has been through onboarding) is treated as a teacher.
    or exists (
      select 1
      from public.teachers t
      where t.id = auth.uid()
    );
$$;

comment on function public.is_teacher() is
  'Returns true for a teacher identity: a JWT app_metadata role = teacher, an email matching the app.teacher_email setting (legacy), OR the presence of a public.teachers row for auth.uid() (onboarding-based, multi-teacher). SECURITY DEFINER so RLS policies can consult the teachers table without recursion.';
