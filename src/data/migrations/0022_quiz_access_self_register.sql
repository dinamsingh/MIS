-- ============================================================================
-- Migration: 0022_quiz_access_self_register
-- Fix student quiz access so it actually works with an enrollment-only roster,
-- add a teacher preview, and give the teacher a way to reset a wrong binding.
--
-- Background
-- ----------
-- The roster is imported as (enrollment_number, name) with email = NULL, but
-- `request_quiz_access` matched students by their Google email against
-- student_roster.email. Since roster emails are NULL, no student ever matched
-- and everyone saw "not registered". This migration reworks access to:
--
--   (A) TEACHER PREVIEW — the quiz's owning teacher (quizzes.owner_id = auth.uid())
--       may open their own quiz to preview it (roster gate bypassed, no attempt
--       recorded). The client renders it read-only via the `preview` flag.
--
--   (B+) SELF-REGISTER + BIND + LOCK — a student signs in with Google (email is
--       verified by Google), enters their enrollment number once; if that
--       enrollment is on the roster and not yet bound, the verified email is
--       bound to it (student_roster.email + students.email filled) and LOCKED.
--       A different Google account can no longer claim that enrollment. This
--       makes the second-and-later attempts as strong as email allow-listing,
--       while working from an enrollment-only roster.
--
--   (C) reset_student_binding(enrollment) — a teacher-only function that clears
--       a binding (roster email + student email) and deletes that student's
--       attempts, so the correct student can re-register. list_student_registrations()
--       returns the currently-bound students for the teacher's management UI.
--
-- All functions are SECURITY DEFINER and apply their own authorization.
-- Idempotent: CREATE OR REPLACE (+ DROP of the old signatures).
-- ============================================================================

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

    -- Resolve the quiz by its public share token (fall back to id for older links).
    select * into v_quiz
    from public.quizzes
    where share_token = p_quiz_id or id::text = p_quiz_id
    order by case when share_token = p_quiz_id then 0 else 1 end
    limit 1;
    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    -- (A) Teacher preview: the owning teacher can view their own quiz without
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

    -- 1) Roster lookup by the VERIFIED Google email (already-bound students).
    select * into v_roster
    from public.student_roster
    where lower(email) = lower(v_email)
    limit 1;

    -- 2) Not bound by email yet -> enrollment self-registration (B+).
    if not found then
        if p_provided_enrollment is null then
            return jsonb_build_object('status', 'enrollment-required');
        end if;

        select * into v_roster
        from public.student_roster
        where enrollment_number = p_provided_enrollment
        limit 1;

        -- Enrollment not on the roster at all.
        if not found then
            return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
        end if;

        -- Enrollment already bound to a DIFFERENT Google account -> deny.
        if v_roster.email is not null and lower(v_roster.email) <> lower(v_email) then
            return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
        end if;

        -- Bind this verified email to the enrollment (lock it).
        update public.student_roster
           set email = v_email
         where id = v_roster.id
        returning * into v_roster;
    end if;

    -- 3) Upsert the managed student row, keyed by the stable enrollment number.
    --    This claims the roster-seeded row (email NULL) by filling its email,
    --    preserving its section_id, instead of inserting a duplicate (which the
    --    unique enrollment index would reject).
    insert into public.students (name, email, enrollment_number)
    values (coalesce(v_roster.name, v_email), v_email, v_roster.enrollment_number)
    on conflict (enrollment_number) do update
        set email = excluded.email,
            name  = coalesce(public.students.name, excluded.name)
    returning * into v_student;

    -- 4) A prior attempt short-circuits to already-attempted (still shown after
    --    the window closes so the student can see their score).
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

    -- 5) Enforce the active window (not yet live, or expired).
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

-- ----------------------------------------------------------------------------
-- (C) reset_student_binding — teacher-only. Unbinds an enrollment so the
-- correct student can register again: clears the roster + student email and
-- deletes that student's attempts (frees the seat). Enrollment is kept on the
-- students row so the correct student reuses the same record on re-bind.
-- ----------------------------------------------------------------------------
create or replace function public.reset_student_binding(p_enrollment text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ids               uuid[];
    v_cleared_attempts  integer := 0;
begin
    if not public.is_teacher() then
        return jsonb_build_object('status', 'denied', 'reason', 'not-teacher');
    end if;

    select array_agg(id) into v_ids
    from public.students
    where enrollment_number = p_enrollment;

    if v_ids is not null then
        delete from public.quiz_attempts where student_id = any(v_ids);
        get diagnostics v_cleared_attempts = row_count;
    end if;

    update public.student_roster set email = null where enrollment_number = p_enrollment;
    update public.students        set email = null where enrollment_number = p_enrollment;

    return jsonb_build_object(
        'status', 'reset',
        'enrollment', p_enrollment,
        'clearedAttempts', v_cleared_attempts
    );
end;
$$;

grant execute on function public.reset_student_binding(text) to authenticated;

-- ----------------------------------------------------------------------------
-- list_student_registrations — teacher-only. Returns the students who have a
-- bound Google account (email filled), for the management UI. Short list, since
-- only registered students appear.
-- ----------------------------------------------------------------------------
create or replace function public.list_student_registrations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_rows jsonb;
begin
    if not public.is_teacher() then
        return '[]'::jsonb;
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object('enrollment', enrollment_number, 'name', name, 'email', email)
            order by enrollment_number
        ),
        '[]'::jsonb
    )
    into v_rows
    from public.student_roster
    where email is not null;

    return v_rows;
end;
$$;

grant execute on function public.list_student_registrations() to authenticated;

notify pgrst, 'reload schema';
