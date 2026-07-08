-- ============================================================================
-- Migration: 0025_quiz_specific_access_errors
-- Return precise quiz access denial reasons instead of collapsing every failure
-- into "not-registered". Safe to run after 0024; it only replaces the RPC.
-- ============================================================================

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
    v_uid       uuid := auth.uid();
    v_email     text := auth.email();
    v_quiz      public.quizzes%rowtype;
    v_roster    public.student_roster%rowtype;
    v_student   public.students%rowtype;
    v_questions jsonb;
begin
    if v_uid is null or v_email is null then
        return jsonb_build_object('status', 'denied', 'reason', 'not-authenticated');
    end if;

    select * into v_quiz
    from public.quizzes
    where share_token = p_quiz_id or id::text = p_quiz_id
    order by case when share_token = p_quiz_id then 0 else 1 end
    limit 1;
    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'quiz-not-found');
    end if;

    if v_quiz.owner_id is not null and v_quiz.owner_id = v_uid then
        select coalesce(
            jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text, 'options', q.options) order by q.id),
            '[]'::jsonb
        )
        into v_questions
        from public.questions q
        where q.quiz_id = v_quiz.id;

        return jsonb_build_object(
            'status', 'granted',
            'preview', true,
            'quiz', jsonb_build_object(
                'id', v_quiz.id, 'unitId', v_quiz.unit_id,
                'timeLimitMinutes', v_quiz.time_limit_minutes,
                'shareToken', v_quiz.share_token, 'questions', v_questions
            )
        );
    end if;

    select * into v_roster
    from public.student_roster
    where lower(email) = lower(v_email)
    limit 1;

    if not found then
        if p_provided_enrollment is null then
            return jsonb_build_object('status', 'enrollment-required');
        end if;

        if v_quiz.section_id is not null and not exists (
            select 1
            from public.students st
            where st.enrollment_number = p_provided_enrollment
              and st.section_id = v_quiz.section_id
        ) then
            return jsonb_build_object('status', 'denied', 'reason', 'wrong-section');
        end if;

        select * into v_roster
        from public.student_roster
        where enrollment_number = p_provided_enrollment
        limit 1;

        if not found then
            return jsonb_build_object('status', 'denied', 'reason', 'enrollment-not-found');
        end if;

        if v_roster.email is not null and lower(v_roster.email) <> lower(v_email) then
            return jsonb_build_object('status', 'denied', 'reason', 'enrollment-already-bound');
        end if;

        update public.student_roster
           set email = v_email
         where id = v_roster.id
        returning * into v_roster;
    end if;

    insert into public.students (name, email, enrollment_number)
    values (coalesce(v_roster.name, v_email), v_email, v_roster.enrollment_number)
    on conflict (enrollment_number) do update
        set email = excluded.email,
            name  = coalesce(public.students.name, excluded.name)
    returning * into v_student;

    if v_quiz.section_id is not null and (
        v_student.section_id is null or v_student.section_id <> v_quiz.section_id
    ) then
        return jsonb_build_object('status', 'denied', 'reason', 'wrong-section');
    end if;

    declare
        v_attempt public.quiz_attempts%rowtype;
    begin
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
    end;

    if (v_quiz.active_from is not null and now() < v_quiz.active_from)
       or (v_quiz.active_until is not null and now() > v_quiz.active_until) then
        return jsonb_build_object('status', 'denied', 'reason', 'not-active');
    end if;

    select coalesce(
        jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text, 'options', q.options) order by q.id),
        '[]'::jsonb
    )
    into v_questions
    from public.questions q
    where q.quiz_id = v_quiz.id;

    return jsonb_build_object(
        'status', 'granted',
        'quiz', jsonb_build_object(
            'id', v_quiz.id, 'unitId', v_quiz.unit_id,
            'timeLimitMinutes', v_quiz.time_limit_minutes,
            'shareToken', v_quiz.share_token, 'questions', v_questions
        )
    );
end;
$$;

grant execute on function public.request_quiz_access(text, text) to authenticated;

notify pgrst, 'reload schema';
