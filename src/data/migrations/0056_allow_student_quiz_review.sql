-- ============================================================================
-- Migration: 0056_allow_student_quiz_review
-- Allow students who have completed a quiz attempt to view their answer review.
-- ============================================================================

create or replace function public.quiz_review(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid       uuid := auth.uid();
    v_email     text := auth.email();
    v_quiz      public.quizzes%rowtype;
    v_student   public.students%rowtype;
    v_attempt   public.quiz_attempts%rowtype;
    v_review    jsonb;
begin
    if v_uid is null or v_email is null then
        return null;
    end if;

    select * into v_quiz
    from public.quizzes
    where id = p_quiz_id
    limit 1;

    if not found then
        return null;
    end if;

    select * into v_student
    from public.students
    where lower(email) = lower(v_email)
    limit 1;

    if not found then
        return null;
    end if;

    select * into v_attempt
    from public.quiz_attempts
    where quiz_id = v_quiz.id and student_id = v_student.id;

    if not found then
        return null;
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'questionId', q.id,
                'text', q.text,
                'options', q.options,
                'correctIndex', q.correct_index,
                'marks', q.marks,
                'studentAnswerIndex', (v_attempt.answers->>q.id::text)::int
            )
            order by q.position asc
        ),
        '[]'::jsonb
    )
    into v_review
    from public.questions q
    where q.quiz_id = v_quiz.id;

    return v_review;
end;
$$;

grant execute on function public.quiz_review(uuid) to authenticated;

notify pgrst, 'reload schema';
