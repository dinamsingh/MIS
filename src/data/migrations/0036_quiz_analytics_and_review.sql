-- ============================================================================
-- Migration: 0036_quiz_analytics_and_review
-- Problem: Teachers need detailed question-level analytics and per-student
-- answer sheets to understand class performance and individual gaps.
-- Fix: Add quiz_question_stats and quiz_attempt_detail RPCs (owner-only).
-- ============================================================================

create or replace function public.quiz_question_stats(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_quiz public.quizzes%rowtype;
    v_total_attempts int;
    v_stats jsonb;
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

    select count(*) into v_total_attempts
    from public.quiz_attempts
    where quiz_id = p_quiz_id;

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'questionId', q.id,
            'text', q.text,
            'options', q.options,
            'correctIndex', q.correct_index,
            'marks', q.marks,
            'position', q.position,
            'totalAttempts', v_total_attempts,
            'pickCounts', coalesce((
                select jsonb_object_agg(sub.opt_idx::text, sub.cnt)
                from (
                    select (qa.answers->>q.id::text)::int as opt_idx, count(*) as cnt
                    from public.quiz_attempts qa
                    where qa.quiz_id = p_quiz_id
                      and qa.answers ? q.id::text
                    group by (qa.answers->>q.id::text)::int
                ) sub
            ), '{}'::jsonb)
        )
        order by q.position asc, q.created_at asc
    ), '[]'::jsonb) into v_stats
    from public.questions q
    where q.quiz_id = p_quiz_id;

    return v_stats;
end;
$$;

create or replace function public.quiz_attempt_detail(p_quiz_id uuid, p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_quiz public.quizzes%rowtype;
    v_attempt public.quiz_attempts%rowtype;
    v_student public.students%rowtype;
    v_questions jsonb;
begin
    if auth.uid() is null then
        return null;
    end if;

    select * into v_quiz
    from public.quizzes
    where id = p_quiz_id
    limit 1;

    if not found or (v_quiz.owner_id is not null and v_quiz.owner_id <> auth.uid()) then
        return null;
    end if;

    select * into v_attempt
    from public.quiz_attempts
    where quiz_id = p_quiz_id and student_id = p_student_id
    limit 1;

    if not found then
        return null;
    end if;

    select * into v_student
    from public.students
    where id = p_student_id
    limit 1;

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'questionId', q.id,
            'text', q.text,
            'options', q.options,
            'correctIndex', q.correct_index,
            'marks', q.marks,
            'position', q.position,
            'studentAnswerIndex', (v_attempt.answers->>q.id::text)::int
        )
        order by q.position asc, q.created_at asc
    ), '[]'::jsonb) into v_questions
    from public.questions q
    where q.quiz_id = p_quiz_id;

    return jsonb_build_object(
        'studentName', v_student.name,
        'enrollmentNumber', v_student.enrollment_number,
        'score', v_attempt.score,
        'submittedAt', v_attempt.submitted_at,
        'questions', v_questions
    );
end;
$$;

grant execute on function public.quiz_question_stats(uuid) to authenticated;
grant execute on function public.quiz_attempt_detail(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
