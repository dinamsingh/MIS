-- Migration 0038_student_email_auth.sql
-- Changes quiz access and submission to use a provided email instead of auth.email()

-- 1. Update request_quiz_access to accept p_provided_email
drop function if exists public.request_quiz_access;

create or replace function public.request_quiz_access(
    p_quiz_id               uuid,
    p_provided_email        text default null,
    p_provided_enrollment   text default null
) returns jsonb
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_quiz      public.quizzes%rowtype;
    v_roster    public.student_roster%rowtype;
    v_student   public.students%rowtype;
    v_email     text := lower(trim(p_provided_email));
    v_enroll    text := upper(trim(p_provided_enrollment));
begin
    -- 1. Does the quiz exist?
    select * into v_quiz from public.quizzes where id = p_quiz_id;
    if not found then
        return jsonb_build_object('status', 'not-found');
    end if;

    -- 2. Is it active right now?
    if (v_quiz.active_from is not null and now() < v_quiz.active_from) or
       (v_quiz.active_until is not null and now() > v_quiz.active_until) then
        return jsonb_build_object('status', 'not-active');
    end if;

    -- 3. If there is no email provided, they are not authenticated.
    if v_email is null or v_email = '' then
        return jsonb_build_object('status', 'unauthenticated');
    end if;

    -- 4. Do we know this email?
    -- First check if the student is already in the roster via this email
    select * into v_roster
    from public.student_roster
    where lower(email) = v_email
    limit 1;

    -- If we don't have a roster entry for this email yet...
    if not found then
        if v_enroll is null or v_enroll = '' then
            -- We don't know who this is, and they didn't provide an enrollment number
            return jsonb_build_object('status', 'needs-enrollment');
        end if;

        -- They provided an enrollment number. Does it exist in the allowlist?
        select * into v_roster
        from public.student_roster
        where enrollment_number = v_enroll;

        if not found then
            return jsonb_build_object('status', 'not-in-roster');
        end if;

        -- Does the roster entry already have a different email?
        if v_roster.email is not null and lower(v_roster.email) != v_email then
            return jsonb_build_object('status', 'enrollment-taken');
        end if;

        -- Does this email belong to a different enrollment number?
        if exists (
            select 1 from public.student_roster
            where lower(email) = v_email and enrollment_number != v_enroll
        ) then
            return jsonb_build_object('status', 'email-bound-elsewhere');
        end if;

        -- Bind the email to the roster entry
        update public.student_roster
        set email = v_email
        where enrollment_number = v_enroll;

        -- And bind the email to the students table entry
        update public.students
        set email = v_email
        where enrollment_number = v_enroll;
    end if;

    -- At this point, v_roster represents the matched student allowlist entry.
    
    -- 5. Is the quiz restricted to a specific section?
    if v_quiz.section_id is not null then
        select * into v_student
        from public.students
        where enrollment_number = v_roster.enrollment_number
          and section_id = v_quiz.section_id;

        if not found then
            return jsonb_build_object('status', 'wrong-section');
        end if;
    else
        -- Global quiz (no section restriction). Just grab any student record.
        select * into v_student
        from public.students
        where enrollment_number = v_roster.enrollment_number
        limit 1;
    end if;

    -- 6. Have they already submitted?
    if exists (
        select 1 from public.quiz_attempts
        where quiz_id = p_quiz_id and student_id = v_student.id and submitted_at is not null
    ) then
        return jsonb_build_object('status', 'already-submitted');
    end if;

    -- 7. Return the access token/success
    return jsonb_build_object(
        'status', 'granted',
        'student_id', v_student.id,
        'name', coalesce(v_student.name, v_student.enrollment_number),
        'enrollment_number', v_student.enrollment_number
    );
end;
$$;

-- 2. Update start_quiz_attempt
drop function if exists public.start_quiz_attempt;

create or replace function public.start_quiz_attempt(
    p_quiz_id uuid,
    p_provided_email text default null
) returns jsonb
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_quiz          public.quizzes%rowtype;
    v_roster        public.student_roster%rowtype;
    v_student_id    uuid;
    v_email         text := lower(trim(p_provided_email));
    v_session_id    uuid;
    v_started_at    timestamptz;
begin
    -- 1. Is the quiz active?
    select * into v_quiz from public.quizzes where id = p_quiz_id;
    if not found or (v_quiz.active_from is not null and now() < v_quiz.active_from) or (v_quiz.active_until is not null and now() > v_quiz.active_until) then
        raise exception 'Quiz is not active';
    end if;

    if v_email is null or v_email = '' then
        raise exception 'Unauthenticated';
    end if;

    -- 2. Find the student
    select * into v_roster from public.student_roster where lower(email) = v_email limit 1;
    if not found then
        raise exception 'Not in roster';
    end if;

    if v_quiz.section_id is not null then
        select id into v_student_id from public.students 
        where enrollment_number = v_roster.enrollment_number and section_id = v_quiz.section_id;
    else
        select id into v_student_id from public.students 
        where enrollment_number = v_roster.enrollment_number limit 1;
    end if;

    if v_student_id is null then
        raise exception 'Not in section';
    end if;

    -- 3. Upsert attempt (create if missing, do not overwrite submitted_at)
    insert into public.quiz_attempts (quiz_id, student_id, started_at)
    values (p_quiz_id, v_student_id, now())
    on conflict (quiz_id, student_id) do nothing
    returning id, started_at into v_session_id, v_started_at;

    if v_started_at is null then
        select started_at into v_started_at from public.quiz_attempts 
        where quiz_id = p_quiz_id and student_id = v_student_id;
    end if;

    return jsonb_build_object(
        'started_at', v_started_at,
        'server_now', now(),
        'time_limit_minutes', v_quiz.time_limit_minutes
    );
end;
$$;


-- 3. Update submit_attempt
drop function if exists public.submit_attempt;

create or replace function public.submit_attempt(
    p_quiz_id uuid,
    p_answers jsonb,
    p_provided_email text default null
) returns jsonb
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_quiz          public.quizzes%rowtype;
    v_roster        public.student_roster%rowtype;
    v_student_id    uuid;
    v_email         text := lower(trim(p_provided_email));
    v_total_score   numeric := 0;
    v_q_id          text;
    v_opt_idx       int;
    v_q_record      record;
begin
    -- 1. Validate email
    if v_email is null or v_email = '' then
        return jsonb_build_object('status', 'unauthenticated');
    end if;

    select * into v_roster from public.student_roster where lower(email) = v_email limit 1;
    if not found then
        return jsonb_build_object('status', 'not-in-roster');
    end if;

    select * into v_quiz from public.quizzes where id = p_quiz_id;
    if not found then
        return jsonb_build_object('status', 'not-found');
    end if;

    if v_quiz.section_id is not null then
        select id into v_student_id from public.students 
        where enrollment_number = v_roster.enrollment_number and section_id = v_quiz.section_id;
    else
        select id into v_student_id from public.students 
        where enrollment_number = v_roster.enrollment_number limit 1;
    end if;

    if v_student_id is null then
        return jsonb_build_object('status', 'not-in-roster');
    end if;

    -- 2. Check if already submitted
    if exists (
        select 1 from public.quiz_attempts
        where quiz_id = p_quiz_id and student_id = v_student_id and submitted_at is not null
    ) then
        return jsonb_build_object('status', 'already-submitted');
    end if;

    -- 3. Calculate score
    for v_q_id, v_opt_idx in select key, (value#>>'{}')::int from jsonb_each(p_answers) loop
        select * into v_q_record from public.questions where id = v_q_id::uuid and quiz_id = p_quiz_id;
        if found then
            if v_q_record.correct_index = v_opt_idx then
                v_total_score := v_total_score + coalesce(v_q_record.marks, 1);
            end if;
            
            insert into public.student_answers (quiz_id, student_id, question_id, selected_index)
            values (p_quiz_id, v_student_id, v_q_id::uuid, v_opt_idx)
            on conflict (quiz_id, student_id, question_id) 
            do update set selected_index = v_opt_idx;
        end if;
    end loop;

    -- 4. Mark submitted
    update public.quiz_attempts
    set score = v_total_score,
        submitted_at = now()
    where quiz_id = p_quiz_id and student_id = v_student_id;

    if not found then
        insert into public.quiz_attempts (quiz_id, student_id, score, submitted_at, started_at)
        values (p_quiz_id, v_student_id, v_total_score, now(), now());
    end if;

    return jsonb_build_object('status', 'success', 'score', v_total_score);
end;
$$;


-- 4. Update quiz_review
drop function if exists public.quiz_review;

create or replace function public.quiz_review(
    p_quiz_id uuid,
    p_provided_email text default null
) returns jsonb
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_quiz          public.quizzes%rowtype;
    v_roster        public.student_roster%rowtype;
    v_student_id    uuid;
    v_email         text := lower(trim(p_provided_email));
    v_result        jsonb;
begin
    -- 1. Validate email
    if v_email is null or v_email = '' then
        return null;
    end if;

    select * into v_roster from public.student_roster where lower(email) = v_email limit 1;
    if not found then return null; end if;

    select * into v_quiz from public.quizzes where id = p_quiz_id;
    if not found then return null; end if;

    if v_quiz.section_id is not null then
        select id into v_student_id from public.students 
        where enrollment_number = v_roster.enrollment_number and section_id = v_quiz.section_id;
    else
        select id into v_student_id from public.students 
        where enrollment_number = v_roster.enrollment_number limit 1;
    end if;

    if v_student_id is null then return null; end if;

    -- 2. Verify submission and permissions
    if not exists (
        select 1 from public.quiz_attempts
        where quiz_id = p_quiz_id and student_id = v_student_id and submitted_at is not null
    ) then
        return null; -- Not submitted yet
    end if;

    if coalesce(v_quiz.show_answers_after_close, false) = false then
        return null; -- Review not allowed
    end if;

    if v_quiz.active_until is not null and now() <= v_quiz.active_until then
        return null; -- Not closed yet
    end if;

    -- 3. Return the review data
    select coalesce(jsonb_agg(
        jsonb_build_object(
            'id', q.id,
            'text', q.text,
            'options', q.options,
            'correctIndex', q.correct_index,
            'marks', coalesce(q.marks, 1),
            'selectedIndex', sa.selected_index
        )
    ), '[]'::jsonb) into v_result
    from public.questions q
    left join public.student_answers sa 
        on sa.question_id = q.id and sa.student_id = v_student_id
    where q.quiz_id = p_quiz_id;

    return v_result;
end;
$$;
