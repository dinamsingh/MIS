-- ============================================================================
-- Migration: 0032_quiz_attempt_sessions
-- Make quiz timers server-authoritative.
--
-- Access grant only exposes the quiz. `start_quiz_attempt` creates/resumes the
-- timed session, and `submit_attempt` rejects missing/expired sessions.
-- ============================================================================

create table if not exists public.quiz_attempt_sessions (
    quiz_id    uuid not null references public.quizzes (id) on delete cascade,
    student_id uuid not null references public.students (id) on delete cascade,
    started_at timestamptz not null default now(),
    primary key (quiz_id, student_id)
);

alter table public.quiz_attempt_sessions enable row level security;

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
    v_attempt   public.quiz_attempts%rowtype;
    v_session   public.quiz_attempt_sessions%rowtype;
    v_questions jsonb;
    v_total     numeric;
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

    select coalesce(
        jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text, 'options', q.options) order by q.id),
        '[]'::jsonb
    )
    into v_questions
    from public.questions q
    where q.quiz_id = v_quiz.id;

    if v_quiz.owner_id is not null and v_quiz.owner_id = v_uid then
        return jsonb_build_object(
            'status', 'granted',
            'preview', true,
            'quiz', jsonb_build_object(
                'id', v_quiz.id, 'title', v_quiz.title, 'unitId', v_quiz.unit_id,
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

    select * into v_session
    from public.quiz_attempt_sessions
    where quiz_id = v_quiz.id and student_id = v_student.id;

    v_total := coalesce(v_quiz.time_limit_minutes, 15);
    if found and now() > v_session.started_at + make_interval(mins => v_total::integer) + interval '30 seconds' then
        return jsonb_build_object('status', 'denied', 'reason', 'time-expired');
    end if;

    return jsonb_build_object(
        'status', 'granted',
        'quiz', jsonb_build_object(
            'id', v_quiz.id, 'title', v_quiz.title, 'unitId', v_quiz.unit_id,
            'timeLimitMinutes', v_quiz.time_limit_minutes,
            'shareToken', v_quiz.share_token, 'questions', v_questions
        ),
        'attemptSession', case when found then jsonb_build_object(
            'startedAt', v_session.started_at,
            'serverNow', now(),
            'timeLimitMinutes', v_quiz.time_limit_minutes
        ) else null end
    );
end;
$$;

create or replace function public.start_quiz_attempt(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid     uuid := auth.uid();
    v_email   text := auth.email();
    v_quiz    public.quizzes%rowtype;
    v_roster  public.student_roster%rowtype;
    v_student public.students%rowtype;
    v_attempt public.quiz_attempts%rowtype;
    v_session public.quiz_attempt_sessions%rowtype;
begin
    if v_uid is null or v_email is null then
        return jsonb_build_object('status', 'denied', 'reason', 'not-authenticated');
    end if;

    select * into v_quiz from public.quizzes where id = p_quiz_id;
    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'quiz-not-found');
    end if;

    if exists (select 1 from public.teachers t where lower(t.email) = lower(v_email)) then
        return jsonb_build_object('status', 'denied', 'reason', 'teacher-account');
    end if;

    select * into v_roster
    from public.student_roster
    where lower(email) = lower(v_email)
    limit 1;
    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    select * into v_student from public.students where id = v_uid;
    if not found then
        select * into v_student from public.students where lower(email) = lower(v_email);
    end if;
    if not found
       or v_student.enrollment_number is null
       or v_student.enrollment_number <> v_roster.enrollment_number then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    if v_quiz.section_id is not null and (
        v_student.section_id is null or v_student.section_id <> v_quiz.section_id
    ) then
        return jsonb_build_object('status', 'denied', 'reason', 'wrong-section');
    end if;

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

    insert into public.quiz_attempt_sessions (quiz_id, student_id)
    values (v_quiz.id, v_student.id)
    on conflict (quiz_id, student_id) do nothing;

    select * into v_session
    from public.quiz_attempt_sessions
    where quiz_id = v_quiz.id and student_id = v_student.id;

    if now() > v_session.started_at + make_interval(mins => coalesce(v_quiz.time_limit_minutes, 15)) + interval '30 seconds' then
        return jsonb_build_object('status', 'denied', 'reason', 'time-expired');
    end if;

    return jsonb_build_object(
        'status', 'started',
        'startedAt', v_session.started_at,
        'serverNow', now(),
        'timeLimitMinutes', v_quiz.time_limit_minutes
    );
end;
$$;

create or replace function public.submit_attempt(
    p_quiz_id uuid,
    p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid           uuid := auth.uid();
    v_email         text := auth.email();
    v_quiz          public.quizzes%rowtype;
    v_roster        public.student_roster%rowtype;
    v_student       public.students%rowtype;
    v_student_found boolean := false;
    v_answers       jsonb := coalesce(p_answers, '{}'::jsonb);
    v_score         numeric;
    v_total         numeric;
    v_existing      public.quiz_attempts%rowtype;
    v_session       public.quiz_attempt_sessions%rowtype;
begin
    if v_uid is null or v_email is null then
        return jsonb_build_object('status', 'denied', 'reason', 'not-authenticated');
    end if;

    select * into v_quiz from public.quizzes where id = p_quiz_id;
    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'quiz-not-found');
    end if;

    if exists (select 1 from public.teachers t where lower(t.email) = lower(v_email)) then
        return jsonb_build_object('status', 'denied', 'reason', 'teacher-account');
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

    if not v_student_found
       or v_student.enrollment_number is null
       or v_student.enrollment_number <> v_roster.enrollment_number then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    v_total := public.quiz_total_marks(v_quiz.id);

    select * into v_existing
    from public.quiz_attempts
    where quiz_id = v_quiz.id and student_id = v_student.id;
    if found then
        return jsonb_build_object(
            'status', 'already-attempted',
            'result', jsonb_build_object('score', v_existing.score, 'totalMarks', v_total)
        );
    end if;

    select * into v_session
    from public.quiz_attempt_sessions
    where quiz_id = v_quiz.id and student_id = v_student.id;
    if not found or now() > v_session.started_at + make_interval(mins => coalesce(v_quiz.time_limit_minutes, 15)) + interval '30 seconds' then
        return jsonb_build_object('status', 'denied', 'reason', 'time-expired');
    end if;

    select coalesce(sum(
        case
            when (v_answers -> q.id::text) = to_jsonb(q.correct_index) and q.marks > 0
            then q.marks
            else 0
        end
    ), 0)
    into v_score
    from public.questions q
    where q.quiz_id = v_quiz.id;

    insert into public.quiz_attempts (quiz_id, student_id, answers, score)
    values (v_quiz.id, v_student.id, v_answers, v_score)
    on conflict (quiz_id, student_id) do nothing;

    if not found then
        select * into v_existing
        from public.quiz_attempts
        where quiz_id = v_quiz.id and student_id = v_student.id;

        return jsonb_build_object(
            'status', 'already-attempted',
            'result', jsonb_build_object('score', v_existing.score, 'totalMarks', v_total)
        );
    end if;

    return jsonb_build_object(
        'status', 'recorded',
        'result', jsonb_build_object('score', v_score, 'totalMarks', v_total)
    );
end;
$$;

grant execute on function public.request_quiz_access(text, text) to authenticated;
grant execute on function public.start_quiz_attempt(uuid) to authenticated;
grant execute on function public.submit_attempt(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
