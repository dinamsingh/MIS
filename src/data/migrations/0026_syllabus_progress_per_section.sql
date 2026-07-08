-- ============================================================================
-- Migration: 0026_syllabus_progress_per_section
-- Fix the Syllabus Tracker "leaking across sections" bug.
--
-- Bug: teacher_topic_progress was keyed by (teacher_id, topic_id) only. A
-- teacher teaching the SAME subject to multiple sections (e.g. CSE-5A and
-- CSE-5B) would see a topic marked "taught" in EVERY section as soon as they
-- ticked it in ONE section, because the key had no section dimension — the
-- subject/unit/topic master rows are shared across sections by design, but the
-- "have I taught this" state is not.
--
-- Fix: add `section_id` to the key, so progress is tracked per
-- (teacher, section, topic). A teacher working two sections now tracks each
-- section's syllabus completion independently.
--
-- Data decision (explicit, per user instruction): RESET. There is no reliable
-- way to guess which section a pre-existing progress row belongs to (the old
-- schema never recorded it), so rather than risk assigning progress to the
-- wrong section, existing rows are cleared. Teachers re-mark taught topics per
-- section going forward — a one-time, low-cost fix given the feature is new.
--
-- Idempotent: safe to re-run (checks column existence; the data wipe only runs
-- once because it's gated on the column being newly added).
-- ============================================================================

do $$
declare
    v_had_section_id boolean;
begin
    select exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'teacher_topic_progress'
          and column_name = 'section_id'
    ) into v_had_section_id;

    if not v_had_section_id then
        -- Reset: old rows have no meaningful section, so they cannot be kept.
        delete from public.teacher_topic_progress;

        alter table public.teacher_topic_progress
            add column section_id uuid references public.sections (id) on delete cascade;

        -- Backfilled rows going forward always carry a section, so enforce it.
        alter table public.teacher_topic_progress
            alter column section_id set not null;

        alter table public.teacher_topic_progress drop constraint if exists teacher_topic_progress_pkey;
        alter table public.teacher_topic_progress
            add primary key (teacher_id, section_id, topic_id);
    end if;
end $$;

create index if not exists idx_ttp_teacher_section on public.teacher_topic_progress (teacher_id, section_id);

notify pgrst, 'reload schema';
