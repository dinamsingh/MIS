-- ============================================================================
-- Migration: 0001_init_schema
-- Teacher Academic MIS â€” base schema (tables, constraints, defaults)
--
-- Scope (task 15.1 ONLY): tables, primary keys, foreign keys, CHECK
-- constraints, unique keys, and default values from the design data model.
--
-- NOT in this migration (handled by later tasks):
--   * RLS enablement and policies           -> task 15.2
--   * SECURITY DEFINER access/grade fns      -> task 15.3
--   * audit trigger                          -> task 15.4
--
-- This migration is ordered so that every referenced table exists before the
-- table that references it, and uses IF NOT EXISTS so it can be applied to a
-- fresh database without error.
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto on older Postgres; ensure it is present.
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Reference / structural tables (no dependencies)
-- ----------------------------------------------------------------------------

-- sections (admin-only)
create table if not exists public.sections (
    id          uuid primary key default gen_random_uuid(),
    name        text not null
);

-- subjects (admin-only)
create table if not exists public.subjects (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    semester    text
);

-- units (admin-only) -> subjects
create table if not exists public.units (
    id           uuid primary key default gen_random_uuid(),
    subject_id   uuid not null references public.subjects (id) on delete cascade,
    name         text not null,
    planned_date date
);

-- topics (admin-only) -> units
create table if not exists public.topics (
    id           uuid primary key default gen_random_uuid(),
    unit_id      uuid not null references public.units (id) on delete cascade,
    name         text not null,
    complete     boolean not null default false,
    planned_date date
);

-- student_roster (admin-only) â€” authoritative allowlist
-- Enrollment number pattern: 4 digits, 2 uppercase letters, 6 digits (Req 21.3).
create table if not exists public.student_roster (
    id                uuid primary key default gen_random_uuid(),
    enrollment_number text not null
        constraint student_roster_enrollment_number_format
        check (enrollment_number ~ '^[0-9]{4}[A-Z]{2}[0-9]{6}$'),
    email             text not null unique,
    name              text,
    created_at        timestamptz not null default now()
);

-- students (admin-managed; student can read own row)
-- id is intended to equal auth.uid() once the student signs in with Google.
-- enrollment_number is nullable until first sign-in; when present it must match
-- the roster pattern.
create table if not exists public.students (
    id                uuid primary key default gen_random_uuid(),
    name              text not null,
    email             text not null unique,
    enrollment_number text
        constraint students_enrollment_number_format
        check (enrollment_number is null
               or enrollment_number ~ '^[0-9]{4}[A-Z]{2}[0-9]{6}$'),
    section_id        uuid references public.sections (id) on delete set null,
    created_at        timestamptz not null default now()
);

-- timetable_entries (admin-only) -> sections, subjects
create table if not exists public.timetable_entries (
    id           uuid primary key default gen_random_uuid(),
    section_id   uuid not null references public.sections (id) on delete cascade,
    subject_id   uuid not null references public.subjects (id) on delete cascade,
    day_of_week  text not null,
    time_slot    text not null
);

-- ----------------------------------------------------------------------------
-- Attendance
-- ----------------------------------------------------------------------------

-- attendance (admin-only) -> students, sections, subjects
-- UNIQUE (student, section, subject, date, time_slot) enforces upsert with no
-- duplicate row per student per period (Req 5.6).
create table if not exists public.attendance (
    id          uuid primary key default gen_random_uuid(),
    student_id  uuid not null references public.students (id) on delete cascade,
    section_id  uuid not null references public.sections (id) on delete cascade,
    subject_id  uuid not null references public.subjects (id) on delete cascade,
    date        date not null,
    time_slot   text not null,
    present     boolean not null default false,
    updated_by  uuid,
    updated_at  timestamptz not null default now(),
    constraint attendance_period_student_unique
        unique (student_id, section_id, subject_id, date, time_slot)
);

-- ----------------------------------------------------------------------------
-- Marks
-- ----------------------------------------------------------------------------

-- mark_components (admin-only) -> subjects
create table if not exists public.mark_components (
    id          uuid primary key default gen_random_uuid(),
    subject_id  uuid not null references public.subjects (id) on delete cascade,
    name        text not null,
    max_value   numeric not null,
    weightage   numeric not null
);

-- mark_values (admin-only) -> students, mark_components
-- The 0 <= value <= max_value rule is enforced in the marks function/trigger
-- (task 15.3/15.4) because max_value lives on the parent component row; here we
-- enforce only the value-is-non-negative floor.
create table if not exists public.mark_values (
    id                      uuid primary key default gen_random_uuid(),
    student_id              uuid not null references public.students (id) on delete cascade,
    component_id            uuid not null references public.mark_components (id) on delete cascade,
    value                   numeric not null
        constraint mark_values_value_non_negative check (value >= 0),
    internal_marks_snapshot numeric,
    updated_by              uuid,
    updated_at              timestamptz not null default now(),
    constraint mark_values_student_component_unique
        unique (student_id, component_id)
);

-- ----------------------------------------------------------------------------
-- Quizzes
-- ----------------------------------------------------------------------------

-- quizzes (admin-only write; access via function) -> units
-- time_limit_minutes defaults to 15 (Req 8.3).
create table if not exists public.quizzes (
    id                 uuid primary key default gen_random_uuid(),
    unit_id            uuid not null references public.units (id) on delete cascade,
    title              text not null,
    time_limit_minutes integer not null default 15,
    share_token        text not null unique,
    created_at         timestamptz not null default now()
);

-- questions (admin-only; correct answer never exposed to students) -> quizzes
-- marks defaults to 1 (Req 8.1).
create table if not exists public.questions (
    id            uuid primary key default gen_random_uuid(),
    quiz_id       uuid not null references public.quizzes (id) on delete cascade,
    text          text not null,
    options       jsonb not null,
    correct_index integer not null,
    marks         integer not null default 1
);

-- quiz_attempts (student owns own; teacher reads all) -> quizzes, students
-- UNIQUE (quiz_id, student_id) enforces exactly one attempt (Req 8.11).
create table if not exists public.quiz_attempts (
    id           uuid primary key default gen_random_uuid(),
    quiz_id      uuid not null references public.quizzes (id) on delete cascade,
    student_id   uuid not null references public.students (id) on delete cascade,
    answers      jsonb not null default '{}'::jsonb,
    score        numeric,
    submitted_at timestamptz not null default now(),
    constraint quiz_attempts_quiz_student_unique
        unique (quiz_id, student_id)
);

-- ----------------------------------------------------------------------------
-- Files & assignments
-- ----------------------------------------------------------------------------

-- files (admin-only metadata)
-- storage_type CHECK restricts to the two supported stores (Req 16.1).
create table if not exists public.files (
    id           uuid primary key default gen_random_uuid(),
    category     text not null,
    storage_type text not null
        constraint files_storage_type_allowed
        check (storage_type in ('supabase', 'cloudinary')),
    url_or_path  text not null,
    mime_type    text,
    size_bytes   bigint,
    created_at   timestamptz not null default now()
);

-- assignments (admin-only write; public read via share token) -> subjects, units, files
create table if not exists public.assignments (
    id          uuid primary key default gen_random_uuid(),
    title       text not null,
    subject_id  uuid not null references public.subjects (id) on delete cascade,
    unit_id     uuid not null references public.units (id) on delete cascade,
    due_date    date,
    file_id     uuid references public.files (id) on delete set null,
    share_token text not null unique
);

-- assignment_submissions (admin-only) -> assignments, students, units
create table if not exists public.assignment_submissions (
    id            uuid primary key default gen_random_uuid(),
    assignment_id uuid not null references public.assignments (id) on delete cascade,
    student_id    uuid not null references public.students (id) on delete cascade,
    unit_id       uuid not null references public.units (id) on delete cascade,
    status        text not null default 'not-submitted',
    constraint assignment_submissions_unique
        unique (assignment_id, student_id, unit_id)
);

-- lab_manual_submissions (admin-only, independent of assignment tracker) -> students, units
create table if not exists public.lab_manual_submissions (
    id          uuid primary key default gen_random_uuid(),
    student_id  uuid not null references public.students (id) on delete cascade,
    unit_id     uuid not null references public.units (id) on delete cascade,
    status      text not null default 'not-submitted',
    constraint lab_manual_submissions_unique
        unique (student_id, unit_id)
);

-- ----------------------------------------------------------------------------
-- Configuration & audit
-- ----------------------------------------------------------------------------

-- leaderboard_config (admin-only)
create table if not exists public.leaderboard_config (
    id                 uuid primary key default gen_random_uuid(),
    enabled            boolean not null default false,
    weight_internal    numeric not null default 0,
    weight_quiz        numeric not null default 0,
    weight_attendance  numeric not null default 0
);

-- settings (admin-only)
-- performance_threshold defaults to 60 percent (Req 12.1).
create table if not exists public.settings (
    id                    uuid primary key default gen_random_uuid(),
    performance_threshold numeric not null default 60,
    feature_ai            boolean not null default false
);

-- audit_log (admin read-only; students fully denied â€” Req 19.4)
create table if not exists public.audit_log (
    id          uuid primary key default gen_random_uuid(),
    actor_id    uuid,
    record_ref  text,
    change_type text
        constraint audit_log_change_type_allowed
        check (change_type in ('create', 'update', 'delete')),
    table_name  text,
    "timestamp" timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Helpful secondary indexes for the foreign keys most used by reads.
-- ----------------------------------------------------------------------------
create index if not exists idx_units_subject_id            on public.units (subject_id);
create index if not exists idx_topics_unit_id              on public.topics (unit_id);
create index if not exists idx_students_section_id         on public.students (section_id);
create index if not exists idx_attendance_student_id       on public.attendance (student_id);
create index if not exists idx_mark_values_student_id      on public.mark_values (student_id);
create index if not exists idx_mark_components_subject_id  on public.mark_components (subject_id);
create index if not exists idx_questions_quiz_id           on public.questions (quiz_id);
create index if not exists idx_quiz_attempts_student_id    on public.quiz_attempts (student_id);
create index if not exists idx_assignment_submissions_student_id on public.assignment_submissions (student_id);
create index if not exists idx_lab_manual_submissions_student_id on public.lab_manual_submissions (student_id);
-- ============================================================================
-- Migration: 0002_rls_policies
-- Teacher Academic MIS â€” Row Level Security (RLS) + is_teacher() helper
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
-- is_teacher() â€” identifies the single provisioned teacher identity.
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
-- With RLS enabled and no matching permissive policy, access is denied â€” this
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

-- student_roster (authoritative allowlist â€” admin-only)
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

-- questions (correct_index must never be exposed to students â€” admin-only RLS)
drop policy if exists teacher_all_questions on public.questions;
create policy teacher_all_questions on public.questions
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- files (storage metadata â€” admin-only)
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
-- update/delete for students â€” single-attempt is enforced by the unique key
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
-- read-only â€” rows are written by the audit trigger (SECURITY DEFINER, task
-- 15.4) which bypasses RLS, so no client INSERT/UPDATE/DELETE policy is
-- granted. Anonymous denied.
-- ============================================================================
drop policy if exists teacher_read_audit_log on public.audit_log;
create policy teacher_read_audit_log on public.audit_log
  for select to authenticated
  using (public.is_teacher());
-- ============================================================================
-- Migration: 0003_quiz_functions
-- Teacher Academic MIS â€” SECURITY DEFINER access & grading functions
--
-- Scope (task 15.3 ONLY): the two privileged Postgres functions that gate and
-- grade quiz attempts server-side, plus a small grading helper.
--
--   * request_quiz_access(quiz_id, provided_enrollment)
--       Mirrors domain `rosterService.resolveQuizAccess`: roster check by the
--       Google-captured email, first-sign-in enrollment store / returning
--       verify, already-attempted short-circuit, and a correct-answer-free
--       quiz payload on grant.
--   * submit_attempt(quiz_id, answers)
--       Mirrors domain `quizService.gradeAttempt` + the single-attempt upsert:
--       grades server-side with no negative marking, enforces exactly one
--       stored attempt per (quiz, student) preserving the first result, and
--       persists the score.
--   * quiz_total_marks(quiz_id)
--       Shared helper for the total available marks (mirrors
--       `quizService.totalAvailableMarks`).
--
-- These run as SECURITY DEFINER so they can read the answer key and the roster
-- (which RLS denies to students in task 15.2) while applying their own internal
-- authorization checks. The answer key is NEVER returned to the client.
--
-- NOT in this migration (handled by other tasks):
--   * RLS enablement and policies   -> task 15.2
--   * audit trigger                 -> task 15.4
--   * integration tests             -> tasks 15.5/15.6
--
-- Requirements: 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 2.5, 2.7, 2.8
-- ============================================================================

-- ----------------------------------------------------------------------------
-- quiz_total_marks â€” total available marks across a quiz's questions.
-- Mirrors `totalAvailableMarks`: a question with a non-positive marks value
-- contributes nothing, keeping the total well-defined and non-negative.
-- ----------------------------------------------------------------------------
create or replace function public.quiz_total_marks(p_quiz_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(sum(case when marks > 0 then marks else 0 end), 0)
    from public.questions
    where quiz_id = p_quiz_id;
$$;

-- ----------------------------------------------------------------------------
-- request_quiz_access â€” resolve whether the signed-in student may attempt a
-- quiz (Requirements 2.5, 2.6, 2.7, 2.8, 8.5, 8.6, 8.10).
--
-- The caller's identity is taken from the Supabase JWT (auth.uid() / the
-- Google-captured email), never from a client-supplied argument, so a student
-- cannot impersonate another. Returns a JSON tagged union matching the domain
-- `QuizAccess` type:
--   { status: 'denied', reason: 'not-registered' }
--   { status: 'enrollment-required' }
--   { status: 'already-attempted', result: { score, totalMarks } }
--   { status: 'granted', quiz: { id, unitId, timeLimitMinutes, shareToken,
--                                questions: [{ id, text, options }] } }
-- ----------------------------------------------------------------------------
create or replace function public.request_quiz_access(
    p_quiz_id uuid,
    p_provided_enrollment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid                 uuid := auth.uid();
    v_email               text := auth.email();
    v_roster              public.student_roster%rowtype;
    v_student             public.students%rowtype;
    v_student_found       boolean := false;
    v_effective_enrollment text;
    v_attempt             public.quiz_attempts%rowtype;
    v_quiz                public.quizzes%rowtype;
    v_questions           jsonb;
begin
    -- An unauthenticated caller has no roster identity -> not-registered.
    if v_uid is null or v_email is null then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    -- 1. Roster lookup by email (case-insensitive, as the domain store keys it).
    --    Email not on the roster -> denied (Requirements 2.6, 8.6).
    select * into v_roster
    from public.student_roster
    where lower(email) = lower(v_email)
    limit 1;

    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    -- Resolve the student record: primarily by auth.uid(), falling back to a
    -- pre-existing row matched by email (e.g. seeded before first sign-in).
    select * into v_student from public.students where id = v_uid;
    if found then
        v_student_found := true;
    else
        select * into v_student from public.students where lower(email) = lower(v_email);
        if found then
            v_student_found := true;
        end if;
    end if;

    -- 2. Effective enrollment: a returning student's stored value takes
    --    precedence (Req 2.8), else the value entered at first sign-in (Req 2.7).
    v_effective_enrollment := coalesce(
        case when v_student_found then v_student.enrollment_number else null end,
        p_provided_enrollment
    );

    -- 3. Nothing known yet -> prompt once for the enrollment number (Req 2.7).
    if v_effective_enrollment is null then
        return jsonb_build_object('status', 'enrollment-required');
    end if;

    -- 4. Enrollment must equal the roster entry's enrollment (Req 2.5, 8.5).
    if v_effective_enrollment <> v_roster.enrollment_number then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    -- Persist identity + enrollment so a returning student skips the prompt
    -- (Req 2.7 store-once, Req 2.8 reuse). Keyed by auth.uid().
    if not v_student_found then
        insert into public.students (id, name, email, enrollment_number)
        values (v_uid, coalesce(v_roster.name, v_email), v_email, v_effective_enrollment)
        on conflict (id) do update
            set enrollment_number = excluded.enrollment_number
        returning * into v_student;
    elsif v_student.enrollment_number is null then
        update public.students
            set enrollment_number = v_effective_enrollment
        where id = v_student.id
        returning * into v_student;
    end if;

    -- 5. A prior attempt short-circuits to already-attempted (Req 8.10).
    select * into v_attempt
    from public.quiz_attempts
    where quiz_id = p_quiz_id and student_id = v_student.id;

    if found then
        return jsonb_build_object(
            'status', 'already-attempted',
            'result', jsonb_build_object(
                'score', v_attempt.score,
                'totalMarks', public.quiz_total_marks(p_quiz_id)
            )
        );
    end if;

    -- 6. Grant: return the quiz payload WITHOUT correct answers (the answer key
    --    never leaves the database).
    select * into v_quiz from public.quizzes where id = p_quiz_id;
    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object('id', q.id, 'text', q.text, 'options', q.options)
            order by q.id
        ),
        '[]'::jsonb
    )
    into v_questions
    from public.questions q
    where q.quiz_id = p_quiz_id;

    return jsonb_build_object(
        'status', 'granted',
        'quiz', jsonb_build_object(
            'id', v_quiz.id,
            'unitId', v_quiz.unit_id,
            'timeLimitMinutes', v_quiz.time_limit_minutes,
            'shareToken', v_quiz.share_token,
            'questions', v_questions
        )
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- submit_attempt â€” grade and persist a quiz submission (Requirements 8.7, 8.8,
-- 8.9, 8.10, 8.11).
--
-- Grading happens entirely server-side against the stored correct_index, with
-- no negative marking (mirrors `gradeAttempt`): a question scores its marks
-- only when the submitted option index equals the stored correct index; wrong,
-- missing, or out-of-range answers contribute zero. `answers` is a JSON object
-- mapping question id -> selected option index, so an auto-submit on timer
-- expiry simply submits whatever has been answered so far (Req 8.7).
--
-- Exactly one stored attempt per (quiz, student) is enforced by the UNIQUE
-- constraint plus an insert-if-absent; a second submission preserves and
-- returns the first result as already-attempted (Requirements 8.10, 8.11).
--
-- Returns a JSON object: { status: 'recorded' | 'already-attempted' | 'denied',
--                          result?: { score, totalMarks }, reason? }.
-- ----------------------------------------------------------------------------
create or replace function public.submit_attempt(
    p_quiz_id uuid,
    p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid             uuid := auth.uid();
    v_email           text := auth.email();
    v_roster          public.student_roster%rowtype;
    v_student         public.students%rowtype;
    v_student_found   boolean := false;
    v_answers         jsonb := coalesce(p_answers, '{}'::jsonb);
    v_score           numeric;
    v_total           numeric;
    v_existing        public.quiz_attempts%rowtype;
begin
    -- Unauthenticated callers cannot submit.
    if v_uid is null or v_email is null then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    -- Re-apply the roster + enrollment gate server-side so submission cannot
    -- bypass access control (Requirements 2.5, 8.5, 8.6).
    select * into v_roster
    from public.student_roster
    where lower(email) = lower(v_email)
    limit 1;

    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    select * into v_student from public.students where id = v_uid;
    if found then
        v_student_found := true;
    else
        select * into v_student from public.students where lower(email) = lower(v_email);
        if found then
            v_student_found := true;
        end if;
    end if;

    if not v_student_found
       or v_student.enrollment_number is null
       or v_student.enrollment_number <> v_roster.enrollment_number then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    v_total := public.quiz_total_marks(p_quiz_id);

    -- Server-side auto-grade: sum the marks of questions whose submitted option
    -- index equals the stored correct index. Comparing as jsonb avoids any cast
    -- error on malformed client input; a missing answer yields NULL (no match).
    select coalesce(sum(
        case
            when (v_answers -> q.id::text) = to_jsonb(q.correct_index) and q.marks > 0
            then q.marks
            else 0
        end
    ), 0)
    into v_score
    from public.questions q
    where q.quiz_id = p_quiz_id;

    -- Single-attempt upsert: insert only when no attempt exists for the pair.
    insert into public.quiz_attempts (quiz_id, student_id, answers, score)
    values (p_quiz_id, v_student.id, v_answers, v_score)
    on conflict (quiz_id, student_id) do nothing;

    -- FOUND is false when the conflict suppressed the insert: a prior attempt
    -- exists, so preserve and return the first result (Requirements 8.10, 8.11).
    if not found then
        select * into v_existing
        from public.quiz_attempts
        where quiz_id = p_quiz_id and student_id = v_student.id;

        return jsonb_build_object(
            'status', 'already-attempted',
            'result', jsonb_build_object('score', v_existing.score, 'totalMarks', v_total)
        );
    end if;

    -- Recorded: return the freshly graded score (Req 8.8, 8.9).
    return jsonb_build_object(
        'status', 'recorded',
        'result', jsonb_build_object('score', v_score, 'totalMarks', v_total)
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- Execute privileges. Signed-in students are Supabase `authenticated` users;
-- the functions perform their own internal authorization, so direct table
-- access stays denied by RLS (task 15.2) while these entry points are allowed.
-- ----------------------------------------------------------------------------
grant execute on function public.quiz_total_marks(uuid) to authenticated;
grant execute on function public.request_quiz_access(uuid, text) to authenticated;
grant execute on function public.submit_attempt(uuid, jsonb) to authenticated;
-- ============================================================================
-- Migration: 0004_audit_trigger
-- Teacher Academic MIS â€” audit logging trigger
--
-- Scope (task 15.4 ONLY): a single plpgsql trigger function plus AFTER
-- row-level triggers on `attendance`, `mark_values`, and `mark_components`.
-- Each insert / update / delete writes exactly ONE `audit_log` row capturing:
--   * actor       -> auth.uid()  (the acting authenticated user)
--   * record_ref  -> the affected row's primary key
--   * change_type -> 'create' (INSERT) | 'update' (UPDATE) | 'delete' (DELETE)
--   * table_name  -> the source table
--   * timestamp   -> now() (column default)
--
-- Requirements: 5.7, 7.7, 19.1, 19.2, 19.3
--
-- NOT in this migration (handled by other tasks):
--   * RLS enablement and policies            -> task 15.2
--   * SECURITY DEFINER access/grade fns       -> task 15.3
--   * integration tests                       -> task 15.7
--
-- Idempotent: the function uses CREATE OR REPLACE and each trigger is dropped
-- before being (re)created so the migration can be re-applied safely.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Trigger function: write one audit_log row per row-level change.
--
-- Declared SECURITY DEFINER so the insert into audit_log succeeds regardless of
-- the writer's own table privileges, and search_path is pinned to avoid
-- function-hijacking via a mutable search path.
-- ----------------------------------------------------------------------------
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_change_type text;
    v_record_id   uuid;
    v_actor       uuid;
begin
    -- Map the SQL operation onto the audit_log change_type domain
    -- ('create' | 'update' | 'delete').
    if (tg_op = 'INSERT') then
        v_change_type := 'create';
        v_record_id   := NEW.id;
    elsif (tg_op = 'UPDATE') then
        v_change_type := 'update';
        v_record_id   := NEW.id;
    elsif (tg_op = 'DELETE') then
        v_change_type := 'delete';
        v_record_id   := OLD.id;
    end if;

    -- Acting user identity. auth.uid() is the authenticated Supabase user; it
    -- resolves to NULL when no user context is present (e.g. server-side jobs).
    begin
        v_actor := auth.uid();
    exception
        when others then
            v_actor := null;
    end;

    insert into public.audit_log (actor_id, record_ref, change_type, table_name)
    values (
        v_actor,
        tg_table_name || ':' || coalesce(v_record_id::text, ''),
        v_change_type,
        tg_table_name
    );

    -- AFTER triggers ignore the return value, but returning the affected row
    -- keeps the function correct if it is ever reused as a BEFORE trigger.
    if (tg_op = 'DELETE') then
        return OLD;
    end if;
    return NEW;
end;
$$;

-- ----------------------------------------------------------------------------
-- attendance â€” Req 5.7, 19.3
-- ----------------------------------------------------------------------------
drop trigger if exists trg_audit_attendance on public.attendance;
create trigger trg_audit_attendance
    after insert or update or delete on public.attendance
    for each row execute function public.write_audit_log();

-- ----------------------------------------------------------------------------
-- mark_values â€” Req 7.7, 19.2
-- ----------------------------------------------------------------------------
drop trigger if exists trg_audit_mark_values on public.mark_values;
create trigger trg_audit_mark_values
    after insert or update or delete on public.mark_values
    for each row execute function public.write_audit_log();

-- ----------------------------------------------------------------------------
-- mark_components â€” Req 7.7, 19.2
-- ----------------------------------------------------------------------------
drop trigger if exists trg_audit_mark_components on public.mark_components;
create trigger trg_audit_mark_components
    after insert or update or delete on public.mark_components
    for each row execute function public.write_audit_log();
-- ============================================================================
-- Seed Data: Teacher Academic MIS
-- Subject: Internet and Web Technology (5th Semester)
-- Students: 12 named students with pattern-conforming enrollment numbers
-- Produces non-uniform dashboard/leaderboard/analytics/heatmap results
-- ============================================================================

-- Use fixed UUIDs so seed is idempotent and foreign keys are easy to reference.

-- ----------------------------------------------------------------------------
-- Section
-- ----------------------------------------------------------------------------
INSERT INTO public.sections (id, name) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'CS-5A')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Subject: Internet and Web Technology, 5th Semester
-- ----------------------------------------------------------------------------
INSERT INTO public.subjects (id, name, semester) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'Internet and Web Technology', '5th Semester')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Units for IWT
-- ----------------------------------------------------------------------------
INSERT INTO public.units (id, subject_id, name, planned_date) VALUES
    ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Unit 1: Internet Fundamentals', '2024-08-15'),
    ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Unit 2: HTML and CSS', '2024-09-01'),
    ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'Unit 3: JavaScript and DOM', '2024-09-20'),
    ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'Unit 4: Server-Side Programming', '2024-10-10'),
    ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', 'Unit 5: Web Security and APIs', '2024-11-01')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Topics per Unit (varied completion for non-uniform syllabus progress)
-- ----------------------------------------------------------------------------
INSERT INTO public.topics (id, unit_id, name, complete, planned_date) VALUES
    -- Unit 1: Internet Fundamentals (all complete)
    ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'OSI and TCP/IP Models', true, '2024-08-15'),
    ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'DNS and Domain Names', true, '2024-08-18'),
    ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'HTTP Protocol', true, '2024-08-22'),
    ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'Web Browsers and Servers', true, '2024-08-25'),
    -- Unit 2: HTML and CSS (all complete)
    ('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'HTML5 Semantic Elements', true, '2024-09-01'),
    ('d0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002', 'CSS Selectors and Box Model', true, '2024-09-05'),
    ('d0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000002', 'Responsive Design and Flexbox', true, '2024-09-10'),
    ('d0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000002', 'CSS Grid Layout', true, '2024-09-14'),
    -- Unit 3: JavaScript and DOM (partially complete)
    ('d0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000003', 'JavaScript Basics and ES6', true, '2024-09-20'),
    ('d0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000003', 'DOM Manipulation', true, '2024-09-25'),
    ('d0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000003', 'Event Handling', false, '2024-09-30'),
    ('d0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000003', 'Async JS and Fetch API', false, '2024-10-05'),
    -- Unit 4: Server-Side Programming (one complete, rest not)
    ('d0000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000004', 'Node.js and Express', true, '2024-10-10'),
    ('d0000000-0000-0000-0000-000000000014', 'c0000000-0000-0000-0000-000000000004', 'REST API Design', false, '2024-10-15'),
    ('d0000000-0000-0000-0000-000000000015', 'c0000000-0000-0000-0000-000000000004', 'Database Connectivity', false, '2024-10-20'),
    -- Unit 5: Web Security and APIs (none complete)
    ('d0000000-0000-0000-0000-000000000016', 'c0000000-0000-0000-0000-000000000005', 'Web Security Basics', false, '2024-11-01'),
    ('d0000000-0000-0000-0000-000000000017', 'c0000000-0000-0000-0000-000000000005', 'Authentication and JWT', false, '2024-11-05'),
    ('d0000000-0000-0000-0000-000000000018', 'c0000000-0000-0000-0000-000000000005', 'RESTful API Best Practices', false, '2024-11-10')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 12 Named Students with pattern-conforming enrollment numbers
-- Pattern: ^[0-9]{4}[A-Z]{2}[0-9]{6}$  (e.g., 0131CS241001)
-- ----------------------------------------------------------------------------
INSERT INTO public.students (id, name, email, enrollment_number, section_id) VALUES
    ('e0000000-0000-0000-0000-000000000001', 'Aarav Mehta',   'aarav.mehta@student.edu',   '0131CS241001', 'a0000000-0000-0000-0000-000000000001'),
    ('e0000000-0000-0000-0000-000000000002', 'Aditi Kumar',   'aditi.kumar@student.edu',   '0131CS241002', 'a0000000-0000-0000-0000-000000000001'),
    ('e0000000-0000-0000-0000-000000000003', 'Ishan Verma',   'ishan.verma@student.edu',   '0131CS241003', 'a0000000-0000-0000-0000-000000000001'),
    ('e0000000-0000-0000-0000-000000000004', 'Kabir Joshi',   'kabir.joshi@student.edu',   '0131CS241004', 'a0000000-0000-0000-0000-000000000001'),
    ('e0000000-0000-0000-0000-000000000005', 'Neha Singh',    'neha.singh@student.edu',    '0131CS241005', 'a0000000-0000-0000-0000-000000000001'),
    ('e0000000-0000-0000-0000-000000000006', 'Rahul Mehta',   'rahul.mehta@student.edu',   '0131CS241006', 'a0000000-0000-0000-0000-000000000001'),
    ('e0000000-0000-0000-0000-000000000007', 'Priya Kapoor',  'priya.kapoor@student.edu',  '0131CS241007', 'a0000000-0000-0000-0000-000000000001'),
    ('e0000000-0000-0000-0000-000000000008', 'Simran Gill',   'simran.gill@student.edu',   '0131CS241008', 'a0000000-0000-0000-0000-000000000001'),
    ('e0000000-0000-0000-0000-000000000009', 'Rohit Verma',   'rohit.verma@student.edu',   '0131CS241009', 'a0000000-0000-0000-0000-000000000001'),
    ('e0000000-0000-0000-0000-000000000010', 'Mohit Tyagi',   'mohit.tyagi@student.edu',   '0131CS241010', 'a0000000-0000-0000-0000-000000000001'),
    ('e0000000-0000-0000-0000-000000000011', 'Arjun Khanna',  'arjun.khanna@student.edu',  '0131CS241011', 'a0000000-0000-0000-0000-000000000001'),
    ('e0000000-0000-0000-0000-000000000012', 'Sana Nair',     'sana.nair@student.edu',     '0131CS241012', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Mirror students in the roster for quiz access
INSERT INTO public.student_roster (id, enrollment_number, email, name) VALUES
    ('f0000000-0000-0000-0000-000000000001', '0131CS241001', 'aarav.mehta@student.edu',  'Aarav Mehta'),
    ('f0000000-0000-0000-0000-000000000002', '0131CS241002', 'aditi.kumar@student.edu',  'Aditi Kumar'),
    ('f0000000-0000-0000-0000-000000000003', '0131CS241003', 'ishan.verma@student.edu',  'Ishan Verma'),
    ('f0000000-0000-0000-0000-000000000004', '0131CS241004', 'kabir.joshi@student.edu',  'Kabir Joshi'),
    ('f0000000-0000-0000-0000-000000000005', '0131CS241005', 'neha.singh@student.edu',   'Neha Singh'),
    ('f0000000-0000-0000-0000-000000000006', '0131CS241006', 'rahul.mehta@student.edu',  'Rahul Mehta'),
    ('f0000000-0000-0000-0000-000000000007', '0131CS241007', 'priya.kapoor@student.edu', 'Priya Kapoor'),
    ('f0000000-0000-0000-0000-000000000008', '0131CS241008', 'simran.gill@student.edu',  'Simran Gill'),
    ('f0000000-0000-0000-0000-000000000009', '0131CS241009', 'rohit.verma@student.edu',  'Rohit Verma'),
    ('f0000000-0000-0000-0000-000000000010', '0131CS241010', 'mohit.tyagi@student.edu',  'Mohit Tyagi'),
    ('f0000000-0000-0000-0000-000000000011', '0131CS241011', 'arjun.khanna@student.edu', 'Arjun Khanna'),
    ('f0000000-0000-0000-0000-000000000012', '0131CS241012', 'sana.nair@student.edu',    'Sana Nair')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Timetable entries for the section (weekly schedule)
-- ----------------------------------------------------------------------------
INSERT INTO public.timetable_entries (id, section_id, subject_id, day_of_week, time_slot) VALUES
    ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Monday', '09:00-10:00'),
    ('10000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Tuesday', '11:00-12:00'),
    ('10000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Wednesday', '10:00-11:00'),
    ('10000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Thursday', '14:00-16:00'),
    ('10000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Friday', '09:00-10:00')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Attendance records â€” varied across 10 dates Ã— 2 periods each = 20 periods
-- Produces non-uniform heatmap and defaulter results.
-- Present = true, Absent = false
-- Students have attendance ranging from ~30% (defaulter) to ~95% (high)
-- ----------------------------------------------------------------------------

-- Attendance dates and time slots used:
-- 2024-09-02 09:00-10:00, 2024-09-02 11:00-12:00
-- 2024-09-04 10:00-11:00, 2024-09-05 14:00-16:00
-- 2024-09-09 09:00-10:00, 2024-09-10 11:00-12:00
-- 2024-09-11 10:00-11:00, 2024-09-12 14:00-16:00
-- 2024-09-16 09:00-10:00, 2024-09-17 11:00-12:00
-- 2024-09-18 10:00-11:00, 2024-09-19 14:00-16:00
-- 2024-09-23 09:00-10:00, 2024-09-24 11:00-12:00
-- 2024-09-25 10:00-11:00, 2024-09-26 14:00-16:00
-- 2024-09-30 09:00-10:00, 2024-10-01 11:00-12:00
-- 2024-10-02 10:00-11:00, 2024-10-03 14:00-16:00

-- Student attendance patterns (out of 20 periods):
-- Aarav Mehta:   19/20 = 95% (top)
-- Aditi Kumar:   18/20 = 90%
-- Ishan Verma:   16/20 = 80%
-- Kabir Joshi:   14/20 = 70% (defaulter, <75%)
-- Neha Singh:    17/20 = 85%
-- Rahul Mehta:   12/20 = 60% (defaulter)
-- Priya Kapoor:  19/20 = 95% (top)
-- Simran Gill:   15/20 = 75% (exactly at threshold)
-- Rohit Verma:    6/20 = 30% (severe defaulter)
-- Mohit Tyagi:   13/20 = 65% (defaulter)
-- Arjun Khanna:  17/20 = 85%
-- Sana Nair:     18/20 = 90%

INSERT INTO public.attendance (student_id, section_id, subject_id, date, time_slot, present) VALUES
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '09:00-10:00', false),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '11:00-12:00', false),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '11:00-12:00', false),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '11:00-12:00', false),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '11:00-12:00', false),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-02', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-04', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-04', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-04', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-04', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-04', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-04', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-04', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-04', '10:00-11:00', false),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-04', '10:00-11:00', false),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-04', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-04', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-04', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-05', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-05', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-05', '14:00-16:00', false),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-05', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-05', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-05', '14:00-16:00', false),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-05', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-05', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-05', '14:00-16:00', false),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-05', '14:00-16:00', false),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-05', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-05', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-09', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-09', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-09', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-09', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-09', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-09', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-09', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-09', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-09', '09:00-10:00', false),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-09', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-09', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-09', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-10', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-10', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-10', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-10', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-10', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-10', '11:00-12:00', false),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-10', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-10', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-10', '11:00-12:00', false),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-10', '11:00-12:00', false),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-10', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-10', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-11', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-11', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-11', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-11', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-11', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-11', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-11', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-11', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-11', '10:00-11:00', false),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-11', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-11', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-11', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-12', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-12', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-12', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-12', '14:00-16:00', false),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-12', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-12', '14:00-16:00', false),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-12', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-12', '14:00-16:00', false),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-12', '14:00-16:00', false),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-12', '14:00-16:00', false),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-12', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-12', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-16', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-16', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-16', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-16', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-16', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-16', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-16', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-16', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-16', '09:00-10:00', false),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-16', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-16', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-16', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-17', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-17', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-17', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-17', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-17', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-17', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-17', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-17', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-17', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-17', '11:00-12:00', false),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-17', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-17', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-18', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-18', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-18', '10:00-11:00', false),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-18', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-18', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-18', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-18', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-18', '10:00-11:00', false),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-18', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-18', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-18', '10:00-11:00', false),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-18', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-19', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-19', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-19', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-19', '14:00-16:00', false),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-19', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-19', '14:00-16:00', false),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-19', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-19', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-19', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-19', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-19', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-19', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-23', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-23', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-23', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-23', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-23', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-23', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-23', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-23', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-23', '09:00-10:00', false),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-23', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-23', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-23', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-24', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-24', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-24', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-24', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-24', '11:00-12:00', false),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-24', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-24', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-24', '11:00-12:00', false),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-24', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-24', '11:00-12:00', false),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-24', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-24', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-25', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-25', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-25', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-25', '10:00-11:00', false),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-25', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-25', '10:00-11:00', false),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-25', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-25', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-25', '10:00-11:00', false),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-25', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-25', '10:00-11:00', false),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-25', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-26', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-26', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-26', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-26', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-26', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-26', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-26', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-26', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-26', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-26', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-26', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-26', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-30', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-30', '09:00-10:00', false),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-30', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-30', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-30', '09:00-10:00', false),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-30', '09:00-10:00', false),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-30', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-30', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-30', '09:00-10:00', false),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-30', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-30', '09:00-10:00', true),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-09-30', '09:00-10:00', false),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-01', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-01', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-01', '11:00-12:00', false),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-01', '11:00-12:00', false),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-01', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-01', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-01', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-01', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-01', '11:00-12:00', false),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-01', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-01', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-01', '11:00-12:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-02', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-02', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-02', '10:00-11:00', false),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-02', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-02', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-02', '10:00-11:00', false),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-02', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-02', '10:00-11:00', false),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-02', '10:00-11:00', false),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-02', '10:00-11:00', false),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-02', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-02', '10:00-11:00', true),
    ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-03', '14:00-16:00', false),
    ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-03', '14:00-16:00', false),
    ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-03', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-03', '14:00-16:00', false),
    ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-03', '14:00-16:00', false),
    ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-03', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-03', '14:00-16:00', false),
    ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-03', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-03', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-03', '14:00-16:00', true),
    ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-03', '14:00-16:00', false),
    ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2024-10-03', '14:00-16:00', false)
ON CONFLICT ON CONSTRAINT attendance_period_student_unique DO NOTHING;

-- ----------------------------------------------------------------------------
-- Mark Components for IWT (weighted internal marks)
-- Mid-term: max 30, weight 40%
-- Quiz: max 20, weight 25%
-- Assignment: max 20, weight 20%
-- Attendance: max 10, weight 15%
-- ----------------------------------------------------------------------------
INSERT INTO public.mark_components (id, subject_id, name, max_value, weightage) VALUES
    ('20000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Mid-Term Exam', 30, 40),
    ('20000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Quiz Score', 20, 25),
    ('20000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'Assignment', 20, 20),
    ('20000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'Attendance', 10, 15)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Mark Values â€” varied per student to produce non-uniform analytics
-- Internal marks computed as: sum of (value/max * weightage) for each component
-- ----------------------------------------------------------------------------
INSERT INTO public.mark_values (student_id, component_id, value, internal_marks_snapshot) VALUES
    -- Aarav Mehta: 28/30, 18/20, 19/20, 10/10 â†’ high performer
    ('e0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 28, NULL),
    ('e0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 18, NULL),
    ('e0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 19, NULL),
    ('e0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 10, NULL),
    -- Aditi Kumar: 25/30, 16/20, 17/20, 9/10 â†’ good
    ('e0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 25, NULL),
    ('e0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 16, NULL),
    ('e0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 17, NULL),
    ('e0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004', 9, NULL),
    -- Ishan Verma: 22/30, 14/20, 15/20, 8/10 â†’ above average
    ('e0000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 22, NULL),
    ('e0000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 14, NULL),
    ('e0000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 15, NULL),
    ('e0000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000004', 8, NULL),
    -- Kabir Joshi: 18/30, 10/20, 12/20, 7/10 â†’ below average
    ('e0000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 18, NULL),
    ('e0000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 10, NULL),
    ('e0000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000003', 12, NULL),
    ('e0000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', 7, NULL),
    -- Neha Singh: 27/30, 17/20, 18/20, 9/10 â†’ high
    ('e0000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 27, NULL),
    ('e0000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', 17, NULL),
    ('e0000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000003', 18, NULL),
    ('e0000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000004', 9, NULL),
    -- Rahul Mehta: 15/30, 8/20, 10/20, 6/10 â†’ low performer
    ('e0000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', 15, NULL),
    ('e0000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000002', 8, NULL),
    ('e0000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000003', 10, NULL),
    ('e0000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000004', 6, NULL),
    -- Priya Kapoor: 29/30, 19/20, 20/20, 10/10 â†’ top performer
    ('e0000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', 29, NULL),
    ('e0000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000002', 19, NULL),
    ('e0000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000003', 20, NULL),
    ('e0000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000004', 10, NULL),
    -- Simran Gill: 20/30, 12/20, 14/20, 7/10 â†’ average
    ('e0000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000001', 20, NULL),
    ('e0000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000002', 12, NULL),
    ('e0000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000003', 14, NULL),
    ('e0000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000004', 7, NULL),
    -- Rohit Verma: 10/30, 5/20, 6/20, 3/10 â†’ very low (at risk)
    ('e0000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001', 10, NULL),
    ('e0000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000002', 5, NULL),
    ('e0000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000003', 6, NULL),
    ('e0000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000004', 3, NULL),
    -- Mohit Tyagi: 16/30, 9/20, 11/20, 6/10 â†’ below average
    ('e0000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000001', 16, NULL),
    ('e0000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000002', 9, NULL),
    ('e0000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000003', 11, NULL),
    ('e0000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000004', 6, NULL),
    -- Arjun Khanna: 24/30, 15/20, 16/20, 9/10 â†’ good
    ('e0000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000001', 24, NULL),
    ('e0000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000002', 15, NULL),
    ('e0000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000003', 16, NULL),
    ('e0000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000004', 9, NULL),
    -- Sana Nair: 26/30, 17/20, 18/20, 9/10 â†’ high
    ('e0000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000001', 26, NULL),
    ('e0000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000002', 17, NULL),
    ('e0000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000003', 18, NULL),
    ('e0000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000004', 9, NULL)
ON CONFLICT ON CONSTRAINT mark_values_student_component_unique DO NOTHING;

-- ----------------------------------------------------------------------------
-- Quiz: Unit 1 Internet Fundamentals Quiz (5 questions, 1 mark each)
-- ----------------------------------------------------------------------------
INSERT INTO public.quizzes (id, unit_id, title, time_limit_minutes, share_token) VALUES
    ('30000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Internet Fundamentals Quiz', 15, 'iwt-quiz-unit1-abc123')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.questions (id, quiz_id, text, options, correct_index, marks) VALUES
    ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
     'Which layer of the OSI model is responsible for routing?',
     '["Application", "Transport", "Network", "Data Link"]'::jsonb, 2, 1),
    ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
     'What does DNS stand for?',
     '["Domain Name System", "Data Network Service", "Digital Name Server", "Domain Network System"]'::jsonb, 0, 1),
    ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001',
     'Which HTTP method is used to retrieve a resource?',
     '["POST", "PUT", "GET", "DELETE"]'::jsonb, 2, 1),
    ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001',
     'What is the default port for HTTPS?',
     '["80", "443", "8080", "3000"]'::jsonb, 1, 1),
    ('40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001',
     'Which protocol is connectionless?',
     '["TCP", "HTTP", "UDP", "FTP"]'::jsonb, 2, 1)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Quiz Attempts â€” varied scores (out of 5) for non-uniform analytics
-- Not all students have attempted (Rohit and Mohit haven't)
-- ----------------------------------------------------------------------------
INSERT INTO public.quiz_attempts (quiz_id, student_id, answers, score) VALUES
    -- Aarav: 5/5
    ('30000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001',
     '{"0": 2, "1": 0, "2": 2, "3": 1, "4": 2}'::jsonb, 5),
    -- Aditi: 4/5
    ('30000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002',
     '{"0": 2, "1": 0, "2": 2, "3": 1, "4": 0}'::jsonb, 4),
    -- Ishan: 3/5
    ('30000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003',
     '{"0": 2, "1": 0, "2": 0, "3": 1, "4": 1}'::jsonb, 3),
    -- Kabir: 2/5
    ('30000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000004',
     '{"0": 2, "1": 1, "2": 0, "3": 0, "4": 2}'::jsonb, 2),
    -- Neha: 5/5
    ('30000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000005',
     '{"0": 2, "1": 0, "2": 2, "3": 1, "4": 2}'::jsonb, 5),
    -- Rahul: 2/5
    ('30000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000006',
     '{"0": 0, "1": 0, "2": 2, "3": 0, "4": 2}'::jsonb, 2),
    -- Priya: 5/5
    ('30000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000007',
     '{"0": 2, "1": 0, "2": 2, "3": 1, "4": 2}'::jsonb, 5),
    -- Simran: 3/5
    ('30000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000008',
     '{"0": 2, "1": 0, "2": 1, "3": 1, "4": 0}'::jsonb, 3),
    -- Arjun: 4/5
    ('30000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000011',
     '{"0": 2, "1": 0, "2": 2, "3": 0, "4": 2}'::jsonb, 4),
    -- Sana: 4/5
    ('30000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000012',
     '{"0": 2, "1": 0, "2": 2, "3": 1, "4": 0}'::jsonb, 4)
ON CONFLICT ON CONSTRAINT quiz_attempts_quiz_student_unique DO NOTHING;

-- ----------------------------------------------------------------------------
-- Leaderboard Configuration (enabled with balanced weights)
-- ----------------------------------------------------------------------------
INSERT INTO public.leaderboard_config (id, enabled, weight_internal, weight_quiz, weight_attendance) VALUES
    ('50000000-0000-0000-0000-000000000001', true, 50, 30, 20)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Settings (performance threshold 60%, AI disabled)
-- ----------------------------------------------------------------------------
INSERT INTO public.settings (id, performance_threshold, feature_ai) VALUES
    ('60000000-0000-0000-0000-000000000001', 60, false)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- FINAL STEP: Set your teacher email for RLS access
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'teacher',
      false
    )
    OR coalesce(
      lower(auth.jwt() ->> 'email') = lower('singhdindayal394@gmail.com'),
      false
    );
$$;
