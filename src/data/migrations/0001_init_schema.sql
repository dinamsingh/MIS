-- ============================================================================
-- Migration: 0001_init_schema
-- Teacher Academic MIS — base schema (tables, constraints, defaults)
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

-- student_roster (admin-only) — authoritative allowlist
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

-- audit_log (admin read-only; students fully denied — Req 19.4)
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
