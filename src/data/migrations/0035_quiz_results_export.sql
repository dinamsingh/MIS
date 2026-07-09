-- ============================================================================
-- Migration: 0035_quiz_results_export
-- Problem: Teachers need to see which students have NOT attempted a quiz, to follow up.
-- Fix: Add list_quiz_non_attempters RPC that returns the section roster minus attempters.
-- ============================================================================

create or replace function public.list_quiz_non_attempters(p_quiz_id uuid)
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

    select * into v_quiz
    from public.quizzes
    where id = p_quiz_id
    limit 1;

    if not found or (v_quiz.owner_id is not null and v_quiz.owner_id <> auth.uid()) then
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
    from public.students st
    join target_sections ts on ts.id = st.section_id
    where st.enrollment_number is not null
      and not exists (
          select 1
          from public.quiz_attempts qa
          where qa.quiz_id = p_quiz_id
            and qa.student_id = st.id
      );

    return v_rows;
end;
$$;

grant execute on function public.list_quiz_non_attempters(uuid) to authenticated;

notify pgrst, 'reload schema';
