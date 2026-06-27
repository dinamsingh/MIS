-- ============================================================================
-- Migration: 0003_quiz_functions
-- Teacher Academic MIS — SECURITY DEFINER access & grading functions
--
-- Scope (task 15.3 ONLY): the two privileged Postgres functions that gate and
-- grade quiz attempts server-side, plus a small grading helper.
--
--   * request_quiz_access(quiz_id, provided_enrollment)
--       Mirrors domain `rosterService.resolveQuizAccess`: roster check by the
--       Google-captured email, first-sign-in enrollment store / returning
--       verify, already-attempted short-circuit, and a correct-answer-free
--       quiz payload on grant.
--   * submit_attempt(quiz_id, answers)
--       Mirrors domain `quizService.gradeAttempt` + the single-attempt upsert:
--       grades server-side with no negative marking, enforces exactly one
--       stored attempt per (quiz, student) preserving the first result, and
--       persists the score.
--   * quiz_total_marks(quiz_id)
--       Shared helper for the total available marks (mirrors
--       `quizService.totalAvailableMarks`).
--
-- These run as SECURITY DEFINER so they can read the answer key and the roster
-- (which RLS denies to students in task 15.2) while applying their own internal
-- authorization checks. The answer key is NEVER returned to the client.
--
-- NOT in this migration (handled by other tasks):
--   * RLS enablement and policies   -> task 15.2
--   * audit trigger                 -> task 15.4
--   * integration tests             -> tasks 15.5/15.6
--
-- Requirements: 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 2.5, 2.7, 2.8
-- ============================================================================

-- ----------------------------------------------------------------------------
-- quiz_total_marks — total available marks across a quiz's questions.
-- Mirrors `totalAvailableMarks`: a question with a non-positive marks value
-- contributes nothing, keeping the total well-defined and non-negative.
-- ----------------------------------------------------------------------------
create or replace function public.quiz_total_marks(p_quiz_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(sum(case when marks > 0 then marks else 0 end), 0)
    from public.questions
    where quiz_id = p_quiz_id;
$$;

-- ----------------------------------------------------------------------------
-- request_quiz_access — resolve whether the signed-in student may attempt a
-- quiz (Requirements 2.5, 2.6, 2.7, 2.8, 8.5, 8.6, 8.10).
--
-- The caller's identity is taken from the Supabase JWT (auth.uid() / the
-- Google-captured email), never from a client-supplied argument, so a student
-- cannot impersonate another. Returns a JSON tagged union matching the domain
-- `QuizAccess` type:
--   { status: 'denied', reason: 'not-registered' }
--   { status: 'enrollment-required' }
--   { status: 'already-attempted', result: { score, totalMarks } }
--   { status: 'granted', quiz: { id, unitId, timeLimitMinutes, shareToken,
--                                questions: [{ id, text, options }] } }
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
    -- An unauthenticated caller has no roster identity -> not-registered.
    if v_uid is null or v_email is null then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    -- 1. Roster lookup by email (case-insensitive, as the domain store keys it).
    --    Email not on the roster -> denied (Requirements 2.6, 8.6).
    select * into v_roster
    from public.student_roster
    where lower(email) = lower(v_email)
    limit 1;

    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    -- Resolve the student record: primarily by auth.uid(), falling back to a
    -- pre-existing row matched by email (e.g. seeded before first sign-in).
    select * into v_student from public.students where id = v_uid;
    if found then
        v_student_found := true;
    else
        select * into v_student from public.students where lower(email) = lower(v_email);
        if found then
            v_student_found := true;
        end if;
    end if;

    -- 2. Effective enrollment: a returning student's stored value takes
    --    precedence (Req 2.8), else the value entered at first sign-in (Req 2.7).
    v_effective_enrollment := coalesce(
        case when v_student_found then v_student.enrollment_number else null end,
        p_provided_enrollment
    );

    -- 3. Nothing known yet -> prompt once for the enrollment number (Req 2.7).
    if v_effective_enrollment is null then
        return jsonb_build_object('status', 'enrollment-required');
    end if;

    -- 4. Enrollment must equal the roster entry's enrollment (Req 2.5, 8.5).
    if v_effective_enrollment <> v_roster.enrollment_number then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    -- Persist identity + enrollment so a returning student skips the prompt
    -- (Req 2.7 store-once, Req 2.8 reuse). Keyed by auth.uid().
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

    -- 5. A prior attempt short-circuits to already-attempted (Req 8.10).
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

    -- 6. Grant: return the quiz payload WITHOUT correct answers (the answer key
    --    never leaves the database).
    select * into v_quiz from public.quizzes where id = p_quiz_id;
    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
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

-- ----------------------------------------------------------------------------
-- submit_attempt — grade and persist a quiz submission (Requirements 8.7, 8.8,
-- 8.9, 8.10, 8.11).
--
-- Grading happens entirely server-side against the stored correct_index, with
-- no negative marking (mirrors `gradeAttempt`): a question scores its marks
-- only when the submitted option index equals the stored correct index; wrong,
-- missing, or out-of-range answers contribute zero. `answers` is a JSON object
-- mapping question id -> selected option index, so an auto-submit on timer
-- expiry simply submits whatever has been answered so far (Req 8.7).
--
-- Exactly one stored attempt per (quiz, student) is enforced by the UNIQUE
-- constraint plus an insert-if-absent; a second submission preserves and
-- returns the first result as already-attempted (Requirements 8.10, 8.11).
--
-- Returns a JSON object: { status: 'recorded' | 'already-attempted' | 'denied',
--                          result?: { score, totalMarks }, reason? }.
-- ----------------------------------------------------------------------------
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
    v_uid             uuid := auth.uid();
    v_email           text := auth.email();
    v_roster          public.student_roster%rowtype;
    v_student         public.students%rowtype;
    v_student_found   boolean := false;
    v_answers         jsonb := coalesce(p_answers, '{}'::jsonb);
    v_score           numeric;
    v_total           numeric;
    v_existing        public.quiz_attempts%rowtype;
begin
    -- Unauthenticated callers cannot submit.
    if v_uid is null or v_email is null then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;

    -- Re-apply the roster + enrollment gate server-side so submission cannot
    -- bypass access control (Requirements 2.5, 8.5, 8.6).
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

    v_total := public.quiz_total_marks(p_quiz_id);

    -- Server-side auto-grade: sum the marks of questions whose submitted option
    -- index equals the stored correct index. Comparing as jsonb avoids any cast
    -- error on malformed client input; a missing answer yields NULL (no match).
    select coalesce(sum(
        case
            when (v_answers -> q.id::text) = to_jsonb(q.correct_index) and q.marks > 0
            then q.marks
            else 0
        end
    ), 0)
    into v_score
    from public.questions q
    where q.quiz_id = p_quiz_id;

    -- Single-attempt upsert: insert only when no attempt exists for the pair.
    insert into public.quiz_attempts (quiz_id, student_id, answers, score)
    values (p_quiz_id, v_student.id, v_answers, v_score)
    on conflict (quiz_id, student_id) do nothing;

    -- FOUND is false when the conflict suppressed the insert: a prior attempt
    -- exists, so preserve and return the first result (Requirements 8.10, 8.11).
    if not found then
        select * into v_existing
        from public.quiz_attempts
        where quiz_id = p_quiz_id and student_id = v_student.id;

        return jsonb_build_object(
            'status', 'already-attempted',
            'result', jsonb_build_object('score', v_existing.score, 'totalMarks', v_total)
        );
    end if;

    -- Recorded: return the freshly graded score (Req 8.8, 8.9).
    return jsonb_build_object(
        'status', 'recorded',
        'result', jsonb_build_object('score', v_score, 'totalMarks', v_total)
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- Execute privileges. Signed-in students are Supabase `authenticated` users;
-- the functions perform their own internal authorization, so direct table
-- access stays denied by RLS (task 15.2) while these entry points are allowed.
-- ----------------------------------------------------------------------------
grant execute on function public.quiz_total_marks(uuid) to authenticated;
grant execute on function public.request_quiz_access(uuid, text) to authenticated;
grant execute on function public.submit_attempt(uuid, jsonb) to authenticated;
