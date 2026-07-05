-- ============================================================================
-- Migration: 0020_quiz_active_window
-- Add an active window to quizzes and enforce it in student access.
--
-- Adds `active_from` / `active_until` (both nullable) to `quizzes`. A NULL bound
-- means "no limit on that side". `request_quiz_access` now denies with
-- reason 'not-active' when the current time is before active_from or after
-- active_until, so a quiz only lets students in during its scheduled window.
-- (Submission grading is unchanged — a student who was granted access can still
-- submit; the window gates entry.)
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE.
-- ============================================================================

alter table public.quizzes add column if not exists active_from  timestamptz;
alter table public.quizzes add column if not exists active_until timestamptz;

-- ----------------------------------------------------------------------------
-- Recreate request_quiz_access with an active-window check (rest unchanged
-- from 0003). The check runs after the already-attempted short-circuit so a
-- student who already attempted still sees their result even after expiry.
-- ----------------------------------------------------------------------------
create or replace function public.request_quiz_access(
    p_quiz_id uuid,
    p_provided_enrollment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid                 uuid := auth.uid();
    v_email               text := auth.email();
    v_roster              public.student_roster%rowtype;
    v_student             public.students%rowtype;
    v_student_found       boolean := false;
    v_effective_enrollment text;
    v_attempt             public.quiz_attempts%rowtype;
    v_quiz                public.quizzes%rowtype;
    v_questions           jsonb;
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

    -- Prior attempt short-circuits (still shown even after the window closes).
    select * into v_attempt
    from public.quiz_attempts
    where quiz_id = p_quiz_id and student_id = v_student.id;

    if found then
        return jsonb_build_object(
            'status', 'already-attempted',
            'result', jsonb_build_object(
                'score', v_attempt.score,
                'totalMarks', public.quiz_total_marks(p_quiz_id)
            )
        );
    end if;

    select * into v_quiz from public.quizzes where id = p_quiz_id;
    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    -- NEW: enforce the active window (not yet live, or expired).
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
    where q.quiz_id = p_quiz_id;

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

grant execute on function public.request_quiz_access(uuid, text) to authenticated;
