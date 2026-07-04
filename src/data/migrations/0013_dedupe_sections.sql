-- ============================================================================
-- Migration: 0013_dedupe_sections
-- Remove duplicate section rows and prevent them from recurring.
--
-- Problem
-- -------
-- The onboarding "get-or-create real section" logic matched an existing section
-- by (name, batch) but the table had no unique constraint on that pair. When
-- several teachers onboarded overlapping batches/sections, each create attempt
-- inserted a NEW row, producing duplicates like two `CSE-1A / 2026-30` rows.
-- The client read then used `.maybeSingle()`, which errors on >1 row, breaking
-- the entire global section dropdown ("No sections").
--
-- Fix
-- ---
-- 1. Repoint any child rows (students, timetable_entries, attendance) that
--    reference a duplicate section to the surviving (lowest-id) row for the
--    same (name, batch).
-- 2. Delete the now-orphaned duplicate section rows.
-- 3. Add a UNIQUE index on (name, batch) so future get-or-create is race-safe
--    and duplicates can never be inserted again.
--
-- Rows with a NULL batch (legacy seed rows) are left untouched: Postgres treats
-- NULLs as distinct, and they are not part of the onboarding flow.
--
-- Note: `id` is a uuid, which has no `min()` aggregate but IS orderable, so the
-- surviving row is chosen with `first_value(id) OVER (... ORDER BY id)`.
--
-- Idempotent: safe to re-run (dedupe is a no-op once unique, and the index uses
-- IF NOT EXISTS).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Repoint children of duplicate sections to the surviving (lowest-id) row.
-- ----------------------------------------------------------------------------
with survivors as (
    select
        id,
        first_value(id) over (partition by name, batch order by id) as keep_id
    from public.sections
    where batch is not null
),
dupes as (
    select id as dup_id, keep_id
    from survivors
    where id <> keep_id
)
update public.students s
set section_id = d.keep_id
from dupes d
where s.section_id = d.dup_id;

with survivors as (
    select id, first_value(id) over (partition by name, batch order by id) as keep_id
    from public.sections
    where batch is not null
),
dupes as (
    select id as dup_id, keep_id from survivors where id <> keep_id
)
update public.timetable_entries te
set section_id = d.keep_id
from dupes d
where te.section_id = d.dup_id;

with survivors as (
    select id, first_value(id) over (partition by name, batch order by id) as keep_id
    from public.sections
    where batch is not null
),
dupes as (
    select id as dup_id, keep_id from survivors where id <> keep_id
)
update public.attendance a
set section_id = d.keep_id
from dupes d
where a.section_id = d.dup_id;

-- ----------------------------------------------------------------------------
-- Delete the duplicate section rows (children now point at the survivor).
-- ----------------------------------------------------------------------------
with survivors as (
    select id, first_value(id) over (partition by name, batch order by id) as keep_id
    from public.sections
    where batch is not null
)
delete from public.sections s
using survivors sv
where s.id = sv.id
  and sv.id <> sv.keep_id;

-- ----------------------------------------------------------------------------
-- Prevent recurrence: one section per (name, batch).
-- ----------------------------------------------------------------------------
create unique index if not exists sections_name_batch_unique
    on public.sections (name, batch)
    where batch is not null;
