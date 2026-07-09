-- ============================================================================
-- Migration: 0033_quiz_teacher_control
-- Teacher control foundations for quizzes.
--
-- Problem
-- -------
-- The UI could not schedule/reschedule quizzes, quiz creation inserted the quiz
-- before questions one-by-one, and question order was UUID-based instead of the
-- teacher's authoring order.
--
-- Fix
-- ---
-- Add instructions + question position, create quizzes with questions in one
-- SECURITY DEFINER RPC, expose an owner-scoped schedule update RPC, and return
-- questions ordered by position for students/teacher preview.
-- ============================================================================

alter table public.quizzes
    add column if not exists instructions text;

alter table public.questions
    add column if not exists position integer not null default 0;

with ranked as (
    select id, row_number() over (partition by quiz_id order by id)::integer as rn
    from public.questions
    where position = 0
)
update public.questions q
set position = ranked.rn
from ranked
where q.id = ranked.id;

create index if not exists idx_questions_quiz_position
    on public.questions (quiz_id, position, id);

create or replace function public.create_quiz_with_questions(
    p_quiz jsonb,
    p_questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid       uuid := auth.uid();
    v_quiz_id   uuid;
    v_question  jsonb;
    v_position  integer := 0;
begin
    if v_uid is null or not public.is_teacher() then
        raise exception 'not authorized';
    end if;

    if p_quiz is null or p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
        raise exception 'invalid quiz payload';
    end if;

    insert into public.quizzes (
        unit_id,
        title,
        section_id,
        time_limit_minutes,
        share_token,
        active_from,
        active_until,
        instructions,
        owner_id
    )
    values (
        (p_quiz ->> 'unitId')::uuid,
        nullif(trim(p_quiz ->> 'title'), ''),
        nullif(p_quiz ->> 'sectionId', '')::uuid,
        greatest(coalesce((p_quiz ->> 'timeLimitMinutes')::integer, 15), 1),
        nullif(trim(p_quiz ->> 'shareToken'), ''),
        nullif(p_quiz ->> 'activeFrom', '')::timestamptz,
        nullif(p_quiz ->> 'activeUntil', '')::timestamptz,
        nullif(trim(coalesce(p_quiz ->> 'instructions', '')), ''),
        v_uid
    )
    returning id into v_quiz_id;

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
            v_quiz_id,
            nullif(trim(v_question ->> 'text'), ''),
            coalesce(v_question -> 'options', '[]'::jsonb),
            coalesce((v_question ->> 'correctIndex')::integer, 0),
            greatest(coalesce((v_question ->> 'marks')::integer, 1), 1),
            coalesce((v_question ->> 'position')::integer, v_position),
            v_uid
        );
    end loop;

    return v_quiz_id;
end;
$$;

create or replace function public.update_quiz_window(
    p_quiz_id uuid,
    p_active_from timestamptz default null,
    p_active_until timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null or not public.is_teacher() then
        raise exception 'not authorized';
    end if;

    update public.quizzes
    set active_from = p_active_from,
        active_until = p_active_until
    where id = p_quiz_id
      and owner_id = auth.uid();

    if not found then
        raise exception 'quiz not found';
    end if;
end;
$$;

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
        jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text, 'options', q.options) order by q.position, q.id),
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
                'instructions', v_quiz.instructions,
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
            'instructions', v_quiz.instructions,
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

grant execute on function public.create_quiz_with_questions(jsonb, jsonb) to authenticated;
grant execute on function public.update_quiz_window(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.request_quiz_access(text, text) to authenticated;

notify pgrst, 'reload schema';
