-- ============================================================================
-- Migration: 0041_roster_search_contains
-- Problem: list_quiz_roster_options uses prefix-only matching (ilike prefix||'%')
--          which doesn't help students who want to search by their last 3 digits.
-- Fix:     Change to contains-matching (ilike '%'||search||'%') so typing "005"
--          will find "0131CS241005". All other logic (3-char minimum, limit 5,
--          owner/section scope) is preserved identically.
-- ============================================================================

drop function if exists public.list_quiz_roster_options(text, text);

create or replace function public.list_quiz_roster_options(
    p_quiz_id text,
    p_search_prefix text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_quiz       public.quizzes%rowtype;
    v_subject_id uuid;
    v_rows       jsonb;
begin
    if auth.uid() is null then
        return '[]'::jsonb;
    end if;

    -- Require at least 3 characters for the search to prevent bulk enumeration
    if length(trim(p_search_prefix)) < 3 then
        return '[]'::jsonb;
    end if;

    select * into v_quiz
    from public.quizzes
    where share_token = p_quiz_id or id::text = p_quiz_id
    order by case when share_token = p_quiz_id then 0 else 1 end
    limit 1;

    if not found then
        return '[]'::jsonb;
    end if;

    select subject_id into v_subject_id
    from public.syllabus_units
    where id = v_quiz.unit_id;

    with target_sections as (
        select s.id, s.name, s.batch, s.semester, s.department
        from public.sections s
        where v_quiz.section_id is not null
          and s.id = v_quiz.section_id

        union

        select distinct s.id, s.name, s.batch, s.semester, s.department
        from public.teacher_assignments ta
        join public.sections s
          on s.batch = ta.batch_id
         and upper(right(s.name, 1)) = ta.section
        where v_quiz.section_id is null
          and v_quiz.owner_id is not null
          and ta.teacher_id = v_quiz.owner_id
          and ta.subject_id = v_subject_id
    )
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'enrollmentNumber', st.enrollment_number,
                'name', coalesce(nullif(btrim(st.name), ''), st.enrollment_number),
                'sectionId', ts.id,
                'sectionName', ts.name,
                'batch', ts.batch,
                'semester', ts.semester,
                'department', ts.department
            )
            order by ts.name, st.enrollment_number
        ),
        '[]'::jsonb
    )
    into v_rows
    from (
        select st_inner.*
        from public.students st_inner
        where st_inner.enrollment_number is not null
          and st_inner.enrollment_number ilike ('%' || trim(p_search_prefix) || '%')
        limit 5
    ) st
    join target_sections ts on ts.id = st.section_id;

    return v_rows;
end;
$$;

grant execute on function public.list_quiz_roster_options(text, text) to authenticated;
