-- ============================================================================
-- Migration: 0037_quiz_phase4_privacy
-- Add `show_answers_after_close` and `shuffle_questions` to `quizzes`.
-- Secure `list_quiz_roster_options` with a prefix filter (min 3 chars).
-- Add `quiz_review` RPC for post-submit answer sheet access.
-- ============================================================================

alter table public.quizzes
    add column if not exists show_answers_after_close boolean not null default false,
    add column if not exists shuffle_questions boolean not null default false;

-- Replace roster options to require a search prefix
drop function if exists public.list_quiz_roster_options(text);

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

    -- Require at least 3 characters for the search prefix to prevent bulk enumeration
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
          and st_inner.enrollment_number ilike (trim(p_search_prefix) || '%')
        limit 5
    ) st
    join target_sections ts on ts.id = st.section_id;

    return v_rows;
end;
$$;

grant execute on function public.list_quiz_roster_options(text, text) to authenticated;

-- Replace request_quiz_access to remove shareToken and add can_review flag for attempts
drop function if exists public.request_quiz_access(text, text);

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

    -- Teacher preview
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
                'questions', v_questions,
                'shuffleQuestions', v_quiz.shuffle_questions
            )
        );
    end if;

    -- Roster lookup
    select * into v_roster
    from public.student_roster
    where lower(email) = lower(v_email)
    limit 1;

    -- Not bound
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

    -- Upsert student
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

    -- Attempt check
    declare
        v_attempt public.quiz_attempts%rowtype;
        v_can_review boolean;
    begin
        select * into v_attempt
        from public.quiz_attempts
        where quiz_id = v_quiz.id and student_id = v_student.id;
        
        if found then
            v_can_review := false;
            if v_quiz.show_answers_after_close then
                if v_quiz.active_until is null then
                    v_can_review := true;
                elsif v_quiz.active_until < now() then
                    v_can_review := true;
                end if;
            end if;
            
            return jsonb_build_object(
                'status', 'already-attempted',
                'result', jsonb_build_object(
                    'score', v_attempt.score,
                    'totalMarks', public.quiz_total_marks(v_quiz.id),
                    'canReview', v_can_review
                )
            );
        end if;
    end;

    -- Enforce window
    if (v_quiz.active_from is not null and now() < v_quiz.active_from)
       or (v_quiz.active_until is not null and now() > v_quiz.active_until) then
        return jsonb_build_object('status', 'denied', 'reason', 'not-active');
    end if;

    -- Grant
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
            'questions', v_questions,
            'shuffleQuestions', v_quiz.shuffle_questions
        )
    );
end;
$$;

grant execute on function public.request_quiz_access(text, text) to authenticated;


-- Post-submit review endpoint
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

    if not found or not v_quiz.show_answers_after_close then
        return null;
    end if;

    if v_quiz.active_until is not null and v_quiz.active_until > now() then
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
