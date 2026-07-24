-- ============================================================================
-- Migration: 0052_admin_syllabus_upload
-- Admin-only bulk syllabus save RPC, for the PDF-upload-and-review flow
-- (Admin uploads a semester's syllabus PDF, an AI-assisted extraction
-- proposes subjects/units/topics, the admin reviews/edits, then this RPC
-- persists the reviewed structure in one call).
--
-- save_syllabus_structure(p_sem, p_subjects):
--   - is_admin()-gated (reuses public.is_admin() from migration 0043).
--   - p_subjects is a JSON array, one entry per subject:
--       { "code": "CS-601", "name": "...", "kind": "theory",
--         "labName": null, "electiveGroup": null,
--         "units": [ { "unitNo": 1, "name": "...",
--                       "topics": ["...", "..."] }, ... ] }
--   - Upserts each subject by (code, sem) — matches the existing seed
--     convention (onboarding_seed.sql). Existing subjects are updated in
--     place (name/kind/labName/electiveGroup), never duplicated.
--   - For each subject, units/topics are REPLACED wholesale: existing
--     syllabus_units for that subject are deleted (topics cascade via FK)
--     and the reviewed set is inserted fresh. This matches the admin
--     workflow (they are re-uploading/correcting a semester's structure,
--     not incrementally patching it) and keeps the RPC simple/atomic rather
--     than doing a fragile row-by-row diff.
--   - Never touches teacher_topic_progress rows directly; deleting a unit
--     cascades to its topics, which cascades to progress rows for that
--     topic (acceptable: the admin is correcting/replacing the curriculum
--     structure itself, not routine data — same tradeoff already accepted
--     by the "delete units to re-seed" note in sem5_syllabus_seed.sql).
-- ============================================================================

-- Normalizes a subject code for matching purposes only (uppercase, strip
-- everything but letters/digits) — e.g. "CS 702 (A)" and "CS-702A" and
-- "cs702a" all normalize to "CS702A". Storage keeps the admin's original
-- code text; this is used ONLY to find an existing subject to update rather
-- than accidentally inserting a duplicate for the same real-world subject
-- (bugfix: syllabus-upload-duplicate-subjects — an AI-extracted code like
-- "CS 702 (A)" previously failed to match the already-seeded "CS-7002",
-- because the exact-text (code, sem) unique key only catches identical
-- strings, so the upload created a second, disconnected subject row whose
-- units/topics teachers assigned to the ORIGINAL code never saw).
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

        -- Find an existing subject this semester whose code normalizes to
        -- the same value (see normalize_subject_code above), so re-uploading
        -- with slightly different code punctuation/spacing updates the SAME
        -- subject instead of creating a disconnected duplicate.
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

        -- Replace this subject's units/topics wholesale (see header note).
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
  'Admin-only: bulk-saves a semester''s reviewed subject/unit/topic structure from the PDF-upload workflow. Upserts syllabus_subjects by (code, sem); replaces each subject''s syllabus_units/syllabus_topics wholesale.';

-- (code, sem) must be unique for the ON CONFLICT upsert above to work —
-- add it if an earlier migration never enforced it.
create unique index if not exists idx_syllabus_subjects_code_sem
    on public.syllabus_subjects (code, sem);

grant execute on function public.save_syllabus_structure(integer, jsonb) to authenticated;

notify pgrst, 'reload schema';
