-- ============================================================================
-- Migration: 0018_syllabus_master_and_progress
-- Syllabus Tracker — shared master curriculum + per-teacher progress.
--
-- Model
-- -----
-- The official department curriculum is SHARED reference data, keyed to the
-- onboarding `syllabus_subjects` (the same subject identity the global Subject
-- selector uses). Each teacher's "taught" state is PRIVATE.
--
--   syllabus_units        (master)   - units per subject (read-only for teachers)
--   syllabus_topics       (master)   - topics per unit   (read-only for teachers)
--   teacher_topic_progress (private) - presence of a row = this teacher has
--                                      taught that topic (owner = auth.uid())
--
-- This is intentionally independent of the legacy public.subjects/units/topics
-- tables (whose ids never matched syllabus_subjects, which is why the old
-- tracker broke). Master content is inserted via seed SQL run in the SQL editor
-- (service role bypasses RLS); teachers only read master + read/write their own
-- progress.
--
-- Idempotent: IF NOT EXISTS + DROP/CREATE POLICY.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Master: units per syllabus subject
-- ----------------------------------------------------------------------------
create table if not exists public.syllabus_units (
    id         uuid primary key default gen_random_uuid(),
    subject_id uuid not null references public.syllabus_subjects (id) on delete cascade,
    unit_no    integer not null default 1,
    name       text not null,
    sort_order integer not null default 0
);
create index if not exists idx_syllabus_units_subject on public.syllabus_units (subject_id);

-- ----------------------------------------------------------------------------
-- Master: topics per unit
-- ----------------------------------------------------------------------------
create table if not exists public.syllabus_topics (
    id         uuid primary key default gen_random_uuid(),
    unit_id    uuid not null references public.syllabus_units (id) on delete cascade,
    name       text not null,
    sort_order integer not null default 0
);
create index if not exists idx_syllabus_topics_unit on public.syllabus_topics (unit_id);

-- ----------------------------------------------------------------------------
-- Per-teacher progress: presence of a row = this teacher taught this topic.
-- teacher_id defaults to auth.uid() so client inserts self-stamp.
-- ----------------------------------------------------------------------------
create table if not exists public.teacher_topic_progress (
    teacher_id uuid not null default auth.uid(),
    topic_id   uuid not null references public.syllabus_topics (id) on delete cascade,
    taught_at  timestamptz not null default now(),
    primary key (teacher_id, topic_id)
);
create index if not exists idx_ttp_teacher on public.teacher_topic_progress (teacher_id);
create index if not exists idx_ttp_topic   on public.teacher_topic_progress (topic_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.syllabus_units         enable row level security;
alter table public.syllabus_topics         enable row level security;
alter table public.teacher_topic_progress  enable row level security;

-- Master curriculum: any authenticated user may READ; no client writes
-- (content is seeded via SQL editor / migrations as the service role).
drop policy if exists syllabus_units_read on public.syllabus_units;
create policy syllabus_units_read on public.syllabus_units
  for select to authenticated using (true);

drop policy if exists syllabus_topics_read on public.syllabus_topics;
create policy syllabus_topics_read on public.syllabus_topics
  for select to authenticated using (true);

-- Per-teacher progress: a teacher may read/write ONLY their own rows.
drop policy if exists ttp_all_own on public.teacher_topic_progress;
create policy ttp_all_own on public.teacher_topic_progress
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());
