-- ============================================================================
-- Migration: 0053_fix_syllabus_upload_duplicate_codes
-- Bugfix: syllabus-upload-duplicate-subjects
--
-- Problem: save_syllabus_structure() (migration 0052) matched an existing
-- subject to update via an EXACT-TEXT (code, sem) unique key. An AI-extracted
-- code with different punctuation/spacing than the already-seeded code for
-- the same real subject (e.g. "CS 702 (A)" vs the seeded "CS-7002") failed
-- that exact match, so the upload INSERTED a second, disconnected subject
-- row. Its units/topics went onto the new row's id — but teachers'
-- `teacher_assignments` rows still pointed at the ORIGINAL subject id, so
-- the Syllabus Tracker showed nothing for them (Requirement: uploaded
-- syllabus must appear for the subject teachers already teach).
--
-- Fix: replace save_syllabus_structure() to match existing subjects by a
-- NORMALIZED code (uppercase, non-alphanumeric characters stripped) before
-- falling back to inserting a new row, so "CS 702 (A)", "CS-702-A", and
-- "cs702a" are all recognized as the same subject.
-- ============================================================================

create or replace function public.normalize_subject_code(p_code text)
returns text
language sql
immutable
as $$
    select upper(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));
$$;

create or replace function public.save_syllabus_structure(
    p_sem integer,
    p_subjects jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_subject_json jsonb;
    v_unit_json    jsonb;
    v_subject_id   uuid;
    v_unit_id      uuid;
    v_existing_code text;
    v_subjects_saved integer := 0;
    v_units_saved    integer := 0;
    v_topics_saved   integer := 0;
begin
    if not public.is_admin() then
        return jsonb_build_object('status', 'denied', 'reason', 'not-admin');
    end if;

    if p_sem is null or p_sem < 1 or p_sem > 8 then
        return jsonb_build_object('status', 'denied', 'reason', 'invalid-semester');
    end if;

    if p_subjects is null or jsonb_typeof(p_subjects) <> 'array' then
        return jsonb_build_object('status', 'denied', 'reason', 'invalid-payload');
    end if;

    for v_subject_json in select * from jsonb_array_elements(p_subjects)
    loop
        if v_subject_json->>'code' is null or v_subject_json->>'name' is null then
            continue;
        end if;

        select code into v_existing_code
        from public.syllabus_subjects
        where sem = p_sem
          and public.normalize_subject_code(code) = public.normalize_subject_code(v_subject_json->>'code')
        limit 1;

        insert into public.syllabus_subjects (sem, code, name, kind, lab_name, elective_group)
        values (
            p_sem,
            coalesce(v_existing_code, v_subject_json->>'code'),
            v_subject_json->>'name',
            coalesce(v_subject_json->>'kind', 'theory'),
            v_subject_json->>'labName',
            v_subject_json->>'electiveGroup'
        )
        on conflict (code, sem) do update
            set name = excluded.name,
                kind = excluded.kind,
                lab_name = excluded.lab_name,
                elective_group = excluded.elective_group
        returning id into v_subject_id;

        v_subjects_saved := v_subjects_saved + 1;

        delete from public.syllabus_units where subject_id = v_subject_id;

        if v_subject_json->'units' is not null and jsonb_typeof(v_subject_json->'units') = 'array' then
            for v_unit_json in select * from jsonb_array_elements(v_subject_json->'units')
            loop
                insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
                values (
                    v_subject_id,
                    coalesce((v_unit_json->>'unitNo')::integer, 1),
                    coalesce(v_unit_json->>'name', 'Unit'),
                    coalesce((v_unit_json->>'unitNo')::integer, 1)
                )
                returning id into v_unit_id;

                v_units_saved := v_units_saved + 1;

                if v_unit_json->'topics' is not null and jsonb_typeof(v_unit_json->'topics') = 'array' then
                    insert into public.syllabus_topics (unit_id, name, sort_order)
                    select v_unit_id, topic.value #>> '{}', topic.ordinality
                    from jsonb_array_elements(v_unit_json->'topics') with ordinality as topic;

                    v_topics_saved := v_topics_saved + jsonb_array_length(v_unit_json->'topics');
                end if;
            end loop;
        end if;
    end loop;

    return jsonb_build_object(
        'status', 'saved',
        'subjectsSaved', v_subjects_saved,
        'unitsSaved', v_units_saved,
        'topicsSaved', v_topics_saved
    );
end;
$$;

comment on function public.save_syllabus_structure(integer, jsonb) is
  'Admin-only: bulk-saves a semester''s reviewed subject/unit/topic structure from the PDF-upload workflow. Matches existing subjects by normalized code (bugfix: syllabus-upload-duplicate-subjects) before upserting; replaces each subject''s syllabus_units/syllabus_topics wholesale.';

notify pgrst, 'reload schema';
