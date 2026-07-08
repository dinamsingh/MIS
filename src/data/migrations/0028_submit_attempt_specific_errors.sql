-- ============================================================================
-- Migration: 0028_submit_attempt_specific_errors
-- Give `submit_attempt` the same specific denial reasons `request_quiz_access`
-- already returns (migrations 0024/0025/0027), instead of collapsing every
-- failure into a single generic 'not-registered'.
--
-- Note: `quiz.id` returned by `request_quiz_access` (and passed straight
-- through by `QuizAttemptView`) is always the quiz's real internal uuid, not
-- its share token — so the parameter stays `uuid` (no type change needed).
--
-- Reasons returned:
--   'not-authenticated' - no session (should not normally happen client-side)
--   'quiz-not-found'    - the id does not resolve to any quiz
--   'teacher-account'   - the signed-in email belongs to a teacher
--   'not-registered'    - not on the roster / enrollment mismatch
--
-- Idempotent: CREATE OR REPLACE.
-- ============================================================================

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
begin
    if v_uid is null or v_email is null then
        return jsonb_build_object('status', 'denied', 'reason', 'not-authenticated');
    end if;

    select * into v_quiz from public.quizzes where id = p_quiz_id;
    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'quiz-not-found');
    end if;

    -- A teacher account must never be graded as a student submission.
    if exists (select 1 from public.teachers t where lower(t.email) = lower(v_email)) then
        return jsonb_build_object('status', 'denied', 'reason', 'teacher-account');
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

    v_total := public.quiz_total_marks(v_quiz.id);

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
    where q.quiz_id = v_quiz.id;

    -- Single-attempt upsert: insert only when no attempt exists for the pair.
    insert into public.quiz_attempts (quiz_id, student_id, answers, score)
    values (v_quiz.id, v_student.id, v_answers, v_score)
    on conflict (quiz_id, student_id) do nothing;

    -- FOUND is false when the conflict suppressed the insert: a prior attempt
    -- exists, so preserve and return the first result (Requirements 8.10, 8.11).
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

grant execute on function public.submit_attempt(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
