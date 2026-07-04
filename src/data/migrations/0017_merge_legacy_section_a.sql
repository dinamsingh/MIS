-- ============================================================================
-- Migration: 0017_merge_legacy_section_a
-- Reunite section A's roster: move the 12 real students stuck in the legacy
-- 'CS-5A' section into the real 'CSE-5A', then drop the empty legacy section.
--
-- Root cause
-- ----------
-- An early demo seed created section 'CS-5A' (id a0000000-…, batch NULL) holding
-- the first 12 section-A students (roll 0131CS241001–…012). When the real roster
-- seed later inserted all 66 section-A students, those 12 collided on the UNIQUE
-- `students.email` and were skipped (ON CONFLICT), so they stayed in 'CS-5A'
-- while the remaining 54 went into 'CSE-5A' (aa000000-…). The dashboard therefore
-- showed 54 instead of 66 for CSE-5A.
--
-- Fix
-- ---
-- Repoint every child row (students + any attendance/timetable) from the legacy
-- section to the real CSE-5A section, then delete the now-empty legacy section.
-- Students keep all their data; only their section_id changes.
--
-- Guarded by existence checks and scoped to the two known ids, so it is a no-op
-- once applied (the legacy section no longer exists on re-run).
-- ============================================================================

do $$
declare
    v_legacy uuid := 'a0000000-0000-0000-0000-000000000001'; -- 'CS-5A', batch NULL
    v_real   uuid := 'aa000000-0000-0000-0000-000000000001'; -- 'CSE-5A', batch 2024-28
begin
    -- Only act if both sections still exist.
    if exists (select 1 from public.sections where id = v_legacy)
       and exists (select 1 from public.sections where id = v_real) then

        -- Move students from the legacy section into the real one.
        update public.students
        set section_id = v_real
        where section_id = v_legacy;

        -- Move any teacher records that referenced the legacy section.
        update public.attendance
        set section_id = v_real
        where section_id = v_legacy;

        update public.timetable_entries
        set section_id = v_real
        where section_id = v_legacy;

        -- Remove the now-empty legacy section.
        delete from public.sections where id = v_legacy;
    end if;
end $$;
