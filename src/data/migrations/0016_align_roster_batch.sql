-- ============================================================================
-- Migration: 0016_align_roster_batch
-- Align the seeded roster's batch label with the onboarding batch id so the
-- shared roster shows up when a teacher onboards that session.
--
-- Problem
-- -------
-- The real roster (196 students, sections CSE-5A/5B/5C) was seeded with
-- batch = '2024-2028'. The onboarding `batches` table uses id = '2024-28' for
-- the same cohort, and onboarding derives/creates sections with batch '2024-28'.
-- Because '2024-2028' != '2024-28', the section a teacher lands on after
-- onboarding is a DIFFERENT (empty) row than the seeded one that holds the 196
-- students — so the dashboard shows 0 students.
--
-- Fix
-- ---
-- Make the seeded sections use the same batch label as onboarding ('2024-28').
-- Where onboarding already created an empty '2024-28' section with the same
-- name, first move any child rows onto the seeded section, delete the empty
-- duplicate, then relabel the seeded section. Students keep their existing
-- section_id (we only change the section's `batch` column), so the roster stays
-- intact and simply becomes reachable from the onboarding flow.
--
-- The (name, batch) unique index from 0013 is respected: duplicates are removed
-- before the relabel.
--
-- NOTE: adjust the two batch literals below if your cohort uses different
-- labels. This migration is idempotent — once relabelled, the '2024-2028' rows
-- no longer exist so re-running is a no-op.
-- ============================================================================

do $$
declare
    v_old_batch text := '2024-2028';  -- seeded roster label
    v_new_batch text := '2024-28';    -- onboarding batches.id label
begin
    -- 1. Repoint children of empty NEW-batch duplicates onto the seeded
    --    (OLD-batch) section that shares the same name, so nothing is lost when
    --    the empty duplicate is deleted.
    update public.timetable_entries te
    set section_id = seed.id
    from public.sections dup
    join public.sections seed
      on seed.name = dup.name and seed.batch = v_old_batch
    where te.section_id = dup.id
      and dup.batch = v_new_batch;

    update public.attendance a
    set section_id = seed.id
    from public.sections dup
    join public.sections seed
      on seed.name = dup.name and seed.batch = v_old_batch
    where a.section_id = dup.id
      and dup.batch = v_new_batch;

    update public.students st
    set section_id = seed.id
    from public.sections dup
    join public.sections seed
      on seed.name = dup.name and seed.batch = v_old_batch
    where st.section_id = dup.id
      and dup.batch = v_new_batch;

    -- 2. Delete the now-childless NEW-batch duplicates that collide by name
    --    with a seeded OLD-batch section.
    delete from public.sections dup
    using public.sections seed
    where dup.batch = v_new_batch
      and seed.batch = v_old_batch
      and seed.name = dup.name;

    -- 3. Relabel the seeded sections to the onboarding batch id.
    update public.sections
    set batch = v_new_batch
    where batch = v_old_batch;
end $$;
