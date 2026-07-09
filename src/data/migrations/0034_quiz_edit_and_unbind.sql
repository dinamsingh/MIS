-- ============================================================================
-- Migration: 0034_quiz_edit_and_unbind
-- Finish teacher-side quiz control: post-publish editing and enrollment unbind.
--
-- Problem
-- -------
-- Teachers could not correct quiz content after publish, and the UI promised an
-- enrollment reset path that did not exist inside the quiz workflow.
--
-- Fix
-- ---
-- Add owner-scoped RPCs for full quiz replacement before any submission,
-- question-text-only fixes after submissions exist, and per-quiz enrollment
-- unbind that clears the shared binding plus only the calling teacher's quiz
-- attempts for that enrollment.
-- ============================================================================

create or replace function public.update_quiz_with_questions(
    p_quiz_id uuid,
    p_quiz jsonb,
    p_questions jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_question jsonb;
    v_position integer := 0;
begin
    if v_uid is null or not public.is_teacher() then
        raise exception 'not authorized';
    end if;

    if not exists (
        select 1
        from public.quizzes q
        where q.id = p_quiz_id
          and q.owner_id = v_uid
    ) then
        raise exception 'quiz not found';
    end if;

    if exists (
        select 1
        from public.quiz_attempts qa
        where qa.quiz_id = p_quiz_id
    ) then
        raise exception 'quiz has submissions';
    end if;

    if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
        raise exception 'invalid questions payload';
    end if;

    update public.quizzes
    set title = coalesce(nullif(trim(p_quiz ->> 'title'), ''), title),
        instructions = nullif(trim(coalesce(p_quiz ->> 'instructions', '')), ''),
        time_limit_minutes = greatest(coalesce((p_quiz ->> 'timeLimitMinutes')::integer, time_limit_minutes), 1)
    where id = p_quiz_id
      and owner_id = v_uid;

    delete from public.questions where quiz_id = p_quiz_id and owner_id = v_uid;

    for v_question in select * from jsonb_array_elements(p_questions)
    loop
        v_position := v_position + 1;
        insert into public.questions (
            quiz_id,
            text,
            options,
            correct_index,
            marks,
            position,
            owner_id
        )
        values (
            p_quiz_id,
            nullif(trim(v_question ->> 'text'), ''),
            coalesce(v_question -> 'options', '[]'::jsonb),
            coalesce((v_question ->> 'correctIndex')::integer, 0),
            greatest(coalesce((v_question ->> 'marks')::integer, 1), 1),
            coalesce((v_question ->> 'position')::integer, v_position),
            v_uid
        );
    end loop;
end;
$$;

create or replace function public.update_quiz_question_texts(
    p_quiz_id uuid,
    p_questions jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_question jsonb;
begin
    if v_uid is null or not public.is_teacher() then
        raise exception 'not authorized';
    end if;

    if not exists (
        select 1
        from public.quizzes q
        where q.id = p_quiz_id
          and q.owner_id = v_uid
    ) then
        raise exception 'quiz not found';
    end if;

    if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
        raise exception 'invalid questions payload';
    end if;

    for v_question in select * from jsonb_array_elements(p_questions)
    loop
        update public.questions
        set text = coalesce(nullif(trim(v_question ->> 'text'), ''), text)
        where quiz_id = p_quiz_id
          and owner_id = v_uid
          and id = (v_question ->> 'id')::uuid;
    end loop;
end;
$$;

create or replace function public.unbind_student_enrollment(
    p_quiz_id uuid,
    p_enrollment text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_section_id uuid;
    v_student_ids uuid[];
    v_cleared integer := 0;
begin
    if v_uid is null or not public.is_teacher() then
        return jsonb_build_object('status', 'denied', 'reason', 'not-teacher');
    end if;

    select q.section_id
    into v_section_id
    from public.quizzes q
    where q.id = p_quiz_id
      and q.owner_id = v_uid;

    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'not-owner');
    end if;

    if not exists (
        select 1
        from public.students st
        where st.enrollment_number = p_enrollment
          and (
              v_section_id is null
              or st.section_id = v_section_id
          )
    ) then
        return jsonb_build_object('status', 'denied', 'reason', 'student-not-found');
    end if;

    select array_agg(st.id)
    into v_student_ids
    from public.students st
    where st.enrollment_number = p_enrollment;

    if v_student_ids is not null then
        delete from public.quiz_attempts qa
        using public.quizzes q
        where qa.student_id = any(v_student_ids)
          and q.id = qa.quiz_id
          and q.owner_id = v_uid;
        get diagnostics v_cleared = row_count;
    end if;

    update public.student_roster
    set email = null
    where enrollment_number = p_enrollment;

    update public.students
    set email = null
    where enrollment_number = p_enrollment;

    return jsonb_build_object(
        'status', 'reset',
        'enrollment', p_enrollment,
        'clearedAttempts', v_cleared
    );
end;
$$;

grant execute on function public.update_quiz_with_questions(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.update_quiz_question_texts(uuid, jsonb) to authenticated;
grant execute on function public.unbind_student_enrollment(uuid, text) to authenticated;

notify pgrst, 'reload schema';
