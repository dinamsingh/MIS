-- ============================================================================
-- Migration: 0039_quiz_access_hardening
-- Harden `request_quiz_access` with two fixes on top of the 0037 logic.
--
-- Problem
-- -------
--   1. Missing teacher-account guard. Migration 0027 added a check inside
--      `request_quiz_access` that denies any signed-in teacher email (other
--      than the quiz's own owner, whose preview must keep working) with
--      {'status':'denied','reason':'teacher-account'} before it can fall
--      through to student self-registration. Migration 0037 replaced the
--      whole function body (to add show_answers_after_close / shuffle /
--      canReview) and this guard was dropped in the process — a teacher
--      account can once again self-register as a student on someone else's
--      quiz.
--   2. Roster/enrollment binding race condition. When a student supplies an
--      enrollment number for a roster row that has no email yet, the current
--      logic does a SELECT to check the row is unbound, then a separate
--      UPDATE to bind it. Two concurrent requests for the same enrollment
--      number can both pass the "not already bound" check before either
--      commits, letting both (or the second, clobbering the first) bind to
--      the same roster row.
--
-- Fix
-- ---
--   (A) Re-insert the teacher-account check right after the owner-preview
--       branch and before the roster lookup, exactly as it was in 0027.
--   (B) Replace the check-then-update with a single atomic conditional
--       UPDATE ... WHERE (email is null or lower(email) = lower(v_email))
--       RETURNING * INTO v_roster, followed by a NOT FOUND check that denies
--       with reason 'enrollment-already-bound'. Only one concurrent request
--       can win the row; the loser is correctly denied instead of racing.
--       Also add a case-insensitive unique index on student_roster.email as
--       a belt-and-suspenders DB-level guarantee. The existing plain `unique`
--       constraint on student_roster.email (from 0001_init_schema, still in
--       effect — 0007_real_roster_support only dropped NOT NULL on the
--       column, not the unique constraint) is case-sensitive and therefore
--       not equivalent to the case-insensitive matching this function relies
--       on (lower(email) = lower(v_email)), so a separate partial unique
--       index on lower(email) is added here.
--
-- Everything else in the 0037 version of `request_quiz_access` (the
-- show_answers_after_close / canReview logic, shuffleQuestions, section
-- checks, etc.) is kept exactly as-is. `quiz_review` is untouched.
--
-- Idempotent: CREATE OR REPLACE for the function, CREATE UNIQUE INDEX IF NOT
-- EXISTS for the index.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (B, DB-level) Case-insensitive uniqueness on student_roster.email.
-- ----------------------------------------------------------------------------
create unique index if not exists idx_student_roster_email_unique
    on public.student_roster (lower(email))
    where email is not null;

-- ----------------------------------------------------------------------------
-- (A) + (B) request_quiz_access — same body as 0037, with the teacher-account
-- guard restored and the roster bind made atomic.
-- ----------------------------------------------------------------------------
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

    -- A teacher account (any teacher, not just this quiz's owner) must never
    -- fall through to self-registration as a student.
    if exists (select 1 from public.teachers t where lower(t.email) = lower(v_email)) then
        return jsonb_build_object('status', 'denied', 'reason', 'teacher-account');
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

        -- Atomic bind: only succeeds if the row is still unbound (or already
        -- bound to this same email). The WHERE clause guarantees only one
        -- concurrent request can win; the loser gets NOT FOUND below and is
        -- correctly denied instead of racing with the winner.
        update public.student_roster
           set email = v_email
         where id = v_roster.id
           and (email is null or lower(email) = lower(v_email))
        returning * into v_roster;

        if not found then
            return jsonb_build_object('status', 'denied', 'reason', 'enrollment-already-bound');
        end if;
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

notify pgrst, 'reload schema';
