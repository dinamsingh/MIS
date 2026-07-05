-- ============================================================================
-- Migration: 0021_quiz_share_token_access
-- Resolve student quiz access by the public share token used in /quiz/:token.
--
-- The frontend intentionally shares `quizzes.share_token`, not the internal
-- `quizzes.id`. Earlier versions of `request_quiz_access` accepted a uuid and
-- looked up `quizzes.id`, which made share links deny access even when the
-- quiz existed. This replacement accepts text, resolves by share_token first
-- (falling back to id::text for backward compatibility), and then uses the
-- resolved internal quiz id for attempts, total marks, and question loading.
-- ============================================================================

drop function if exists public.request_quiz_access(uuid, text);

create or replace function public.request_quiz_access(
    p_quiz_id text,
    p_provided_enrollment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid                  uuid := auth.uid();
    v_email                text := auth.email();
    v_roster               public.student_roster%rowtype;
    v_student              public.students%rowtype;
    v_student_found        boolean := false;
    v_effective_enrollment text;
    v_attempt              public.quiz_attempts%rowtype;
    v_quiz                 public.quizzes%rowtype;
    v_questions            jsonb;
begin
    if v_uid is null or v_email is null then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    select * into v_roster
    from public.student_roster
    where lower(email) = lower(v_email)
    limit 1;

    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    select * into v_student from public.students where id = v_uid;
    if found then
        v_student_found := true;
    else
        select * into v_student from public.students where lower(email) = lower(v_email);
        if found then
            v_student_found := true;
        end if;
    end if;

    v_effective_enrollment := coalesce(
        case when v_student_found then v_student.enrollment_number else null end,
        p_provided_enrollment
    );

    if v_effective_enrollment is null then
        return jsonb_build_object('status', 'enrollment-required');
    end if;

    if v_effective_enrollment <> v_roster.enrollment_number then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    if not v_student_found then
        insert into public.students (id, name, email, enrollment_number)
        values (v_uid, coalesce(v_roster.name, v_email), v_email, v_effective_enrollment)
        on conflict (id) do update
            set enrollment_number = excluded.enrollment_number
        returning * into v_student;
    elsif v_student.enrollment_number is null then
        update public.students
            set enrollment_number = v_effective_enrollment
        where id = v_student.id
        returning * into v_student;
    end if;

    select * into v_quiz
    from public.quizzes
    where share_token = p_quiz_id or id::text = p_quiz_id
    order by case when share_token = p_quiz_id then 0 else 1 end
    limit 1;

    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    -- Prior attempt short-circuits (still shown even after the window closes).
    select * into v_attempt
    from public.quiz_attempts
    where quiz_id = v_quiz.id and student_id = v_student.id;

    if found then
        return jsonb_build_object(
            'status', 'already-attempted',
            'result', jsonb_build_object(
                'score', v_attempt.score,
                'totalMarks', public.quiz_total_marks(v_quiz.id)
            )
        );
    end if;

    if (v_quiz.active_from is not null and now() < v_quiz.active_from)
       or (v_quiz.active_until is not null and now() > v_quiz.active_until) then
        return jsonb_build_object('status', 'denied', 'reason', 'not-active');
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object('id', q.id, 'text', q.text, 'options', q.options)
            order by q.id
        ),
        '[]'::jsonb
    )
    into v_questions
    from public.questions q
    where q.quiz_id = v_quiz.id;

    return jsonb_build_object(
        'status', 'granted',
        'quiz', jsonb_build_object(
            'id', v_quiz.id,
            'unitId', v_quiz.unit_id,
            'timeLimitMinutes', v_quiz.time_limit_minutes,
            'shareToken', v_quiz.share_token,
            'questions', v_questions
        )
    );
end;
$$;

grant execute on function public.request_quiz_access(text, text) to authenticated;

notify pgrst, 'reload schema';
