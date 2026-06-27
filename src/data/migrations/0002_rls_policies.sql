-- ============================================================================
-- Migration: 0002_rls_policies
-- Teacher Academic MIS — Row Level Security (RLS) + is_teacher() helper
--
-- Scope (task 15.2 ONLY):
--   * is_teacher() SQL helper that identifies the single provisioned teacher
--   * Enable RLS on EVERY table (Req 3.1)
--   * Teacher full access across all tables (Req 3.3)
--   * Student own-row access only (Req 3.2, 2.10)
--   * Admin-only tables deny all student read/write (Req 3.5)
--   * Anonymous / unauthenticated denial of protected tables (Req 3.4, 16.5)
--   * audit_log: students fully denied, teacher read-only (Req 19.4)
--
-- NOT in this migration (handled by later tasks):
--   * SECURITY DEFINER access/grade functions     -> task 15.3
--     (student quiz access + public-by-token assignment/quiz reads are served
--      through SECURITY DEFINER functions that bypass these strict RLS rules)
--   * audit trigger                               -> task 15.4 (0004_*)
--
-- Authorization model (see design.md "Authorization Model" / "RLS Policy
-- Summary"): the static client is untrusted, so Postgres RLS is the single
-- authoritative enforcement point. Once RLS is enabled, the default is DENY;
-- access is granted only by the permissive policies defined below. Permissive
-- policies combine with OR, so a teacher policy and a student-own-row policy on
-- the same table coexist: teachers match via is_teacher(), students match via
-- ownership, and everyone else (incl. the anon role) is denied by default.
--
-- This migration is idempotent: it drops each policy before (re)creating it and
-- uses CREATE OR REPLACE for the helper, so it can be re-applied safely.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- is_teacher() — identifies the single provisioned teacher identity.
--
-- A request is treated as the teacher when EITHER:
--   1. the JWT carries an explicit teacher role claim in app_metadata
--      (auth.jwt() -> 'app_metadata' ->> 'role' = 'teacher'), OR
--   2. the authenticated email matches the provisioned teacher email supplied
--      as a database setting (app.teacher_email), e.g.
--          ALTER DATABASE postgres SET app.teacher_email = 'teacher@example.com';
--
-- The function is STABLE (depends only on the current request's JWT) and only
-- reads JWT claims / settings, so it needs no elevated privileges. The second
-- argument `true` to current_setting() makes a missing setting return NULL
-- instead of raising, keeping the helper safe on databases that have not
-- provisioned app.teacher_email.
-- ----------------------------------------------------------------------------
create or replace function public.is_teacher()
returns boolean
language sql
stable
as $$
  select
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'teacher',
      false
    )
    or coalesce(
      nullif(current_setting('app.teacher_email', true), '') is not null
      and lower(auth.jwt() ->> 'email')
            = lower(nullif(current_setting('app.teacher_email', true), '')),
      false
    );
$$;

comment on function public.is_teacher() is
  'Returns true for the single provisioned teacher identity (JWT app_metadata role = teacher, or email matching the app.teacher_email database setting). Used by RLS policies to grant teacher-wide access.';

-- ============================================================================
-- Enable RLS on EVERY table (Req 3.1).
-- With RLS enabled and no matching permissive policy, access is denied — this
-- alone enforces anonymous denial (Req 3.4) for any table without an anon
-- policy (none below grant the anon role).
-- ============================================================================
alter table public.sections                enable row level security;
alter table public.subjects                enable row level security;
alter table public.units                   enable row level security;
alter table public.topics                  enable row level security;
alter table public.student_roster          enable row level security;
alter table public.students                enable row level security;
alter table public.timetable_entries       enable row level security;
alter table public.attendance              enable row level security;
alter table public.mark_components         enable row level security;
alter table public.mark_values             enable row level security;
alter table public.quizzes                 enable row level security;
alter table public.questions               enable row level security;
alter table public.quiz_attempts           enable row level security;
alter table public.files                   enable row level security;
alter table public.assignments             enable row level security;
alter table public.assignment_submissions  enable row level security;
alter table public.lab_manual_submissions  enable row level security;
alter table public.leaderboard_config      enable row level security;
alter table public.settings                enable row level security;
alter table public.audit_log               enable row level security;

-- ============================================================================
-- Admin-only tables (Req 3.3, 3.5): teacher full access; students denied (no
-- policy granted to them); anonymous denied (no anon policy). One permissive
-- ALL policy per table scoped to authenticated teachers.
-- ============================================================================

-- sections
drop policy if exists teacher_all_sections on public.sections;
create policy teacher_all_sections on public.sections
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- subjects
drop policy if exists teacher_all_subjects on public.subjects;
create policy teacher_all_subjects on public.subjects
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- units
drop policy if exists teacher_all_units on public.units;
create policy teacher_all_units on public.units
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- topics
drop policy if exists teacher_all_topics on public.topics;
create policy teacher_all_topics on public.topics
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- student_roster (authoritative allowlist — admin-only)
drop policy if exists teacher_all_student_roster on public.student_roster;
create policy teacher_all_student_roster on public.student_roster
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- timetable_entries
drop policy if exists teacher_all_timetable_entries on public.timetable_entries;
create policy teacher_all_timetable_entries on public.timetable_entries
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- attendance
drop policy if exists teacher_all_attendance on public.attendance;
create policy teacher_all_attendance on public.attendance
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- mark_components
drop policy if exists teacher_all_mark_components on public.mark_components;
create policy teacher_all_mark_components on public.mark_components
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- mark_values
drop policy if exists teacher_all_mark_values on public.mark_values;
create policy teacher_all_mark_values on public.mark_values
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- quizzes (admin-only write/read via RLS; student access served by a
-- SECURITY DEFINER function in task 15.3 that bypasses RLS)
drop policy if exists teacher_all_quizzes on public.quizzes;
create policy teacher_all_quizzes on public.quizzes
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- questions (correct_index must never be exposed to students — admin-only RLS)
drop policy if exists teacher_all_questions on public.questions;
create policy teacher_all_questions on public.questions
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- files (storage metadata — admin-only)
drop policy if exists teacher_all_files on public.files;
create policy teacher_all_files on public.files
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- assignments (admin-only write/read via RLS; public-by-token read served by a
-- SECURITY DEFINER function in task 15.3 that bypasses RLS)
drop policy if exists teacher_all_assignments on public.assignments;
create policy teacher_all_assignments on public.assignments
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- assignment_submissions
drop policy if exists teacher_all_assignment_submissions on public.assignment_submissions;
create policy teacher_all_assignment_submissions on public.assignment_submissions
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- lab_manual_submissions
drop policy if exists teacher_all_lab_manual_submissions on public.lab_manual_submissions;
create policy teacher_all_lab_manual_submissions on public.lab_manual_submissions
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- leaderboard_config
drop policy if exists teacher_all_leaderboard_config on public.leaderboard_config;
create policy teacher_all_leaderboard_config on public.leaderboard_config
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- settings
drop policy if exists teacher_all_settings on public.settings;
create policy teacher_all_settings on public.settings
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- ============================================================================
-- students (Req 3.2, 2.10): teacher full access; student may READ only their
-- own row (students.id is linked to auth.uid() at first sign-in). Writes to a
-- student's own row (e.g. storing enrollment) are performed by a SECURITY
-- DEFINER function in task 15.3, not granted here. Anonymous denied.
-- ============================================================================
drop policy if exists teacher_all_students on public.students;
create policy teacher_all_students on public.students
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

drop policy if exists student_select_own_student on public.students;
create policy student_select_own_student on public.students
  for select to authenticated
  using (id = auth.uid());

-- ============================================================================
-- quiz_attempts (RLS Policy Summary): teacher reads all; student may read and
-- insert ONLY their own attempts (student_id linked to auth.uid()). No
-- update/delete for students — single-attempt is enforced by the unique key
-- and the submit function (task 15.3). Anonymous denied.
-- ============================================================================
drop policy if exists teacher_all_quiz_attempts on public.quiz_attempts;
create policy teacher_all_quiz_attempts on public.quiz_attempts
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

drop policy if exists student_select_own_quiz_attempt on public.quiz_attempts;
create policy student_select_own_quiz_attempt on public.quiz_attempts
  for select to authenticated
  using (student_id = auth.uid());

drop policy if exists student_insert_own_quiz_attempt on public.quiz_attempts;
create policy student_insert_own_quiz_attempt on public.quiz_attempts
  for insert to authenticated
  with check (student_id = auth.uid());

-- ============================================================================
-- audit_log (Req 19.4): students fully denied (no student policy). Teacher is
-- read-only — rows are written by the audit trigger (SECURITY DEFINER, task
-- 15.4) which bypasses RLS, so no client INSERT/UPDATE/DELETE policy is
-- granted. Anonymous denied.
-- ============================================================================
drop policy if exists teacher_read_audit_log on public.audit_log;
create policy teacher_read_audit_log on public.audit_log
  for select to authenticated
  using (public.is_teacher());
