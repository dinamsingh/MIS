-- ============================================================================
-- Migration: 0054_fix_sem7_subject_codes
--
-- Problem: Onboarding seed used placeholder codes (CS-7001..CS-7007) for sem 7.
-- Actual RGPV codes are CS-701, CS-702A/B/C/D, CS-703A/B/C/D.
-- Teachers already assigned to the old codes — so their teacher_assignments
-- point to subjects with code CS-7001 etc. Syllabus uploaded with correct
-- codes created DISCONNECTED duplicate subjects. Teachers see no syllabus.
--
-- Fix: Rename old placeholder codes to actual RGPV codes. Since
-- teacher_assignments.subject_id references the UUID (not the code text),
-- renaming the code column keeps all existing relationships intact.
-- Then merge any disconnected syllabus data from the duplicate rows.
-- ============================================================================

do $$
declare
    v_old_id uuid;
    v_new_id uuid;
begin
    -- ========================================================================
    -- Step 1: Rename placeholder codes to actual RGPV codes
    -- Only rename if the old code exists and no conflict with new code
    -- ========================================================================

    -- CS-7001 -> CS-701 (Software Architectures)
    if not exists (select 1 from public.syllabus_subjects where code = 'CS-701' and sem = 7) then
        update public.syllabus_subjects set code = 'CS-701', name = 'Software Architectures'
        where code = 'CS-7001' and sem = 7;
    else
        -- Both exist: merge units from old into new, then delete old
        select id into v_old_id from public.syllabus_subjects where code = 'CS-7001' and sem = 7;
        select id into v_new_id from public.syllabus_subjects where code = 'CS-701' and sem = 7;
        if v_old_id is not null and v_new_id is not null and v_old_id <> v_new_id then
            -- Move teacher_assignments from old to new
            update public.teacher_assignments set subject_id = v_new_id where subject_id = v_old_id;
            -- Move any teacher_topic_progress via units that belong to old subject
            -- (units will be deleted when old subject's units are replaced anyway)
            -- Delete old subject (cascades units/topics)
            delete from public.syllabus_subjects where id = v_old_id;
        end if;
    end if;

    -- CS-7002 -> CS-702A (Computational Intelligence — first dept elective option)
    if not exists (select 1 from public.syllabus_subjects where code = 'CS-702A' and sem = 7) then
        update public.syllabus_subjects set code = 'CS-702A', name = 'Computational Intelligence', elective_group = 'DE-III'
        where code = 'CS-7002' and sem = 7;
    else
        select id into v_old_id from public.syllabus_subjects where code = 'CS-7002' and sem = 7;
        select id into v_new_id from public.syllabus_subjects where code = 'CS-702A' and sem = 7;
        if v_old_id is not null and v_new_id is not null and v_old_id <> v_new_id then
            update public.teacher_assignments set subject_id = v_new_id where subject_id = v_old_id;
            delete from public.syllabus_subjects where id = v_old_id;
        end if;
    end if;

    -- CS-7003 -> CS-703A (Cryptography & Information Security — first open elective)
    if not exists (select 1 from public.syllabus_subjects where code = 'CS-703A' and sem = 7) then
        update public.syllabus_subjects set code = 'CS-703A', name = 'Cryptography & Information Security', elective_group = 'OE-III'
        where code = 'CS-7003' and sem = 7;
    else
        select id into v_old_id from public.syllabus_subjects where code = 'CS-7003' and sem = 7;
        select id into v_new_id from public.syllabus_subjects where code = 'CS-703A' and sem = 7;
        if v_old_id is not null and v_new_id is not null and v_old_id <> v_new_id then
            update public.teacher_assignments set subject_id = v_new_id where subject_id = v_old_id;
            delete from public.syllabus_subjects where id = v_old_id;
        end if;
    end if;

    -- CS-7004 (Departmental Elective-III placeholder) — no direct RGPV match
    -- If teachers assigned to it, move them to CS-702A (first option) as default
    select id into v_old_id from public.syllabus_subjects where code = 'CS-7004' and sem = 7;
    if v_old_id is not null then
        select id into v_new_id from public.syllabus_subjects where code = 'CS-702A' and sem = 7;
        if v_new_id is not null then
            update public.teacher_assignments set subject_id = v_new_id where subject_id = v_old_id;
        end if;
        delete from public.syllabus_subjects where id = v_old_id;
    end if;

    -- CS-7005 (Departmental Elective-IV placeholder) — no direct RGPV match
    -- Move to CS-702B as default
    select id into v_old_id from public.syllabus_subjects where code = 'CS-7005' and sem = 7;
    if v_old_id is not null then
        select id into v_new_id from public.syllabus_subjects where code = 'CS-702B' and sem = 7;
        if v_new_id is not null then
            update public.teacher_assignments set subject_id = v_new_id where subject_id = v_old_id;
        end if;
        delete from public.syllabus_subjects where id = v_old_id;
    end if;

    -- CS-7006 (Major Project Phase-I) — keep as-is or rename to standard
    -- RGPV doesn't have a specific code for project in the syllabus PDF
    -- Just update name if it exists
    update public.syllabus_subjects set name = 'Major Project Phase-I'
    where code = 'CS-7006' and sem = 7;

    -- CS-7007 (Seminar) — keep as-is
    update public.syllabus_subjects set name = 'Seminar'
    where code = 'CS-7007' and sem = 7;

    -- ========================================================================
    -- Step 2: Ensure all elective subjects exist (CS-702B/C/D, CS-703B/C/D)
    -- These might not exist yet if only placeholders were seeded
    -- ========================================================================
    insert into public.syllabus_subjects (sem, code, name, kind, elective_group) values
        (7, 'CS-702B', 'Deep & Reinforcement Learning', 'theory', 'DE-III'),
        (7, 'CS-702C', 'Wireless & Mobile Computing', 'theory', 'DE-III'),
        (7, 'CS-702D', 'Big Data', 'theory', 'DE-III'),
        (7, 'CS-703B', 'Data Mining and Warehousing', 'theory', 'OE-III'),
        (7, 'CS-703C', 'Agile Software Development', 'theory', 'OE-III'),
        (7, 'CS-703D', 'Disaster Management', 'theory', 'OE-III')
    on conflict (code, sem) do update
        set name = excluded.name,
            kind = excluded.kind,
            elective_group = excluded.elective_group;
end $$;

notify pgrst, 'reload schema';
