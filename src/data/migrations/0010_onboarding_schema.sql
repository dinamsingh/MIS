-- ============================================================================
-- Migration: 0010_onboarding_schema
-- First-Time Teacher Onboarding feature.
--
-- Adds four tables used ONLY by the onboarding wizard. It deliberately does NOT
-- touch the existing `public.subjects` table (id, name, semester) used by the
-- dashboard/analytics/attendance features — the onboarding master syllabus
-- lives in a separate `syllabus_subjects` table to avoid any collision.
--
-- Tables:
--   teachers            - teacher profile keyed by auth.uid(); holds `onboarded`
--   batches             - read-only list of live batches (to derive live sems)
--   syllabus_subjects   - master syllabus (sem, code, name, kind, lab_name)
--   teacher_assignments - OUTPUT of onboarding (teacher × subject × batch × section)
--
-- RLS: a teacher may read subjects/batches, and read/write only their own
-- `teachers` row and their own `teacher_assignments`.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- teachers — profile row, id equals auth.uid()
-- ----------------------------------------------------------------------------
create table if not exists public.teachers (
    id         uuid primary key,
    name       text,
    email      text,
    onboarded  boolean not null default false,
    created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- batches — read-only; drives which semesters are "live" during onboarding
-- ----------------------------------------------------------------------------
create table if not exists public.batches (
    id          text primary key,          -- e.g. '2024-28'
    start_year  integer not null,
    current_sem integer not null check (current_sem between 1 and 8),
    status      text not null default 'classes'
        check (status in ('classes', 'exams', 'graduated'))
);

-- ----------------------------------------------------------------------------
-- syllabus_subjects — master syllabus (separate from public.subjects)
-- ----------------------------------------------------------------------------
create table if not exists public.syllabus_subjects (
    id       uuid primary key default gen_random_uuid(),
    sem      integer not null check (sem between 1 and 8),
    code     text not null,
    name     text not null,
    kind     text not null default 'theory'
        check (kind in ('theory', 'lab', 'project', 'elective', 'special')),
    lab_name text
);

create index if not exists idx_syllabus_subjects_sem on public.syllabus_subjects (sem);

-- ----------------------------------------------------------------------------
-- teacher_assignments — the output the wizard writes
-- ----------------------------------------------------------------------------
create table if not exists public.teacher_assignments (
    id          uuid primary key default gen_random_uuid(),
    teacher_id  uuid not null references public.teachers (id) on delete cascade,
    subject_id  uuid not null references public.syllabus_subjects (id) on delete cascade,
    batch_id    text not null references public.batches (id) on delete cascade,
    section     text not null check (section in ('A', 'B', 'C')),
    is_lab      boolean not null default false,
    created_at  timestamptz not null default now(),
    constraint teacher_assignments_unique
        unique (teacher_id, subject_id, batch_id, section, is_lab)
);

create index if not exists idx_teacher_assignments_teacher on public.teacher_assignments (teacher_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.teachers            enable row level security;
alter table public.batches             enable row level security;
alter table public.syllabus_subjects   enable row level security;
alter table public.teacher_assignments enable row level security;

-- teachers: a teacher may read/insert/update ONLY their own row (id = auth.uid())
drop policy if exists teachers_select_own on public.teachers;
create policy teachers_select_own on public.teachers
  for select to authenticated using (id = auth.uid());

drop policy if exists teachers_insert_own on public.teachers;
create policy teachers_insert_own on public.teachers
  for insert to authenticated with check (id = auth.uid());

drop policy if exists teachers_update_own on public.teachers;
create policy teachers_update_own on public.teachers
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- batches: read-only for any authenticated user
drop policy if exists batches_read on public.batches;
create policy batches_read on public.batches
  for select to authenticated using (true);

-- syllabus_subjects: read-only for any authenticated user
drop policy if exists syllabus_subjects_read on public.syllabus_subjects;
create policy syllabus_subjects_read on public.syllabus_subjects
  for select to authenticated using (true);

-- teacher_assignments: a teacher may read/write ONLY their own rows
drop policy if exists teacher_assignments_select_own on public.teacher_assignments;
create policy teacher_assignments_select_own on public.teacher_assignments
  for select to authenticated using (teacher_id = auth.uid());

drop policy if exists teacher_assignments_insert_own on public.teacher_assignments;
create policy teacher_assignments_insert_own on public.teacher_assignments
  for insert to authenticated with check (teacher_id = auth.uid());

drop policy if exists teacher_assignments_delete_own on public.teacher_assignments;
create policy teacher_assignments_delete_own on public.teacher_assignments
  for delete to authenticated using (teacher_id = auth.uid());
