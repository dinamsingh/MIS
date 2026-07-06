-- ============================================================================
-- Migration: 0024_quiz_section_roster_options
-- Store the section a quiz is published for, expose a safe roster dropdown for
-- /quiz/:token, and enforce that section on new section-scoped quizzes.
--
-- Existing quizzes keep section_id = NULL and continue to work as before. New
-- quizzes created by the app save the currently selected section id.
-- ============================================================================

alter table public.quizzes
    add column if not exists section_id uuid references public.sections (id) on delete set null;

create index if not exists idx_quizzes_section_id on public.quizzes (section_id);

create or replace function public.list_quiz_roster_options(p_quiz_id text)
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
        -- Preferred path for quizzes created after this migration.
        select s.id, s.name, s.batch, s.semester, s.department
        from public.sections s
        where v_quiz.section_id is not null
          and s.id = v_quiz.section_id

        union

        -- Backward-compatible path for older quizzes that only know unit/subject.
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
    where st.enrollment_number is not null;

    return v_rows;
end;
$$;

grant execute on function public.list_quiz_roster_options(text) to authenticated;

drop function if exists public.request_quiz_access(text, text);
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
    v_uid       uuid := auth.uid();
    v_email     text := auth.email();
    v_quiz      public.quizzes%rowtype;
    v_roster    public.student_roster%rowtype;
    v_student   public.students%rowtype;
    v_questions jsonb;
begin
    if v_uid is null or v_email is null then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    select * into v_quiz
    from public.quizzes
    where share_token = p_quiz_id or id::text = p_quiz_id
    order by case when share_token = p_quiz_id then 0 else 1 end
    limit 1;
    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    -- Teacher preview: the owning teacher can view their own quiz without
    -- being on the roster. No attempt is recorded; answers stay hidden.
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

    -- 1) Roster lookup by the verified Google email (already-bound students).
    select * into v_roster
    from public.student_roster
    where lower(email) = lower(v_email)
    limit 1;

    -- 2) Not bound by email yet -> enrollment self-registration.
    if not found then
        if p_provided_enrollment is null then
            return jsonb_build_object('status', 'enrollment-required');
        end if;

        -- For new section-scoped quizzes, do not bind an email to an enrollment
        -- unless that enrollment belongs to the quiz's section.
        if v_quiz.section_id is not null and not exists (
            select 1
            from public.students st
            where st.enrollment_number = p_provided_enrollment
              and st.section_id = v_quiz.section_id
        ) then
            return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
        end if;

        select * into v_roster
        from public.student_roster
        where enrollment_number = p_provided_enrollment
        limit 1;

        if not found then
            return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
        end if;

        if v_roster.email is not null and lower(v_roster.email) <> lower(v_email) then
            return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
        end if;

        update public.student_roster
           set email = v_email
         where id = v_roster.id
        returning * into v_roster;
    end if;

    -- 3) Upsert the managed student row, keyed by the stable enrollment number.
    insert into public.students (name, email, enrollment_number)
    values (coalesce(v_roster.name, v_email), v_email, v_roster.enrollment_number)
    on conflict (enrollment_number) do update
        set email = excluded.email,
            name  = coalesce(public.students.name, excluded.name)
    returning * into v_student;

    if v_quiz.section_id is not null and (
        v_student.section_id is null or v_student.section_id <> v_quiz.section_id
    ) then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    -- 4) A prior attempt short-circuits to already-attempted.
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

    -- 5) Enforce the active window.
    if (v_quiz.active_from is not null and now() < v_quiz.active_from)
       or (v_quiz.active_until is not null and now() > v_quiz.active_until) then
        return jsonb_build_object('status', 'denied', 'reason', 'not-active');
    end if;

    -- 6) Grant: answer-free quiz payload.
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
