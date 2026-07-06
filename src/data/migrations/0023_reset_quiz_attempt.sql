-- ============================================================================
-- Migration: 0023_reset_quiz_attempt
-- Let a teacher remove ONE student's attempt on ONE of their own quizzes, so
-- that student can re-attempt that specific quiz.
--
-- Why an RPC: quiz_attempts RLS lets the owning teacher only SELECT attempts
-- (0014) — there is no teacher DELETE policy (grading/submit go through
-- SECURITY DEFINER functions). This function deletes a single attempt under its
-- own authorization: caller must be a teacher AND own the quiz.
--
-- This is inherently subject-scoped: the quiz belongs to a unit of a subject, so
-- resetting an attempt only affects that quiz (and therefore that subject) — a
-- student's attempts in other subjects/quizzes are untouched. It does NOT touch
-- the email<->enrollment identity binding (that is a separate, global concern).
--
-- Idempotent: CREATE OR REPLACE.
-- ============================================================================

create or replace function public.reset_quiz_attempt(
    p_quiz_id uuid,
    p_student_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cleared integer := 0;
begin
    if not public.is_teacher() then
        return jsonb_build_object('status', 'denied', 'reason', 'not-teacher');
    end if;

    -- The caller must own the quiz whose attempt is being removed.
    if not exists (
        select 1 from public.quizzes q
        where q.id = p_quiz_id and q.owner_id = auth.uid()
    ) then
        return jsonb_build_object('status', 'denied', 'reason', 'not-owner');
    end if;

    delete from public.quiz_attempts
    where quiz_id = p_quiz_id and student_id = p_student_id;
    get diagnostics v_cleared = row_count;

    return jsonb_build_object('status', 'reset', 'cleared', v_cleared);
end;
$$;

grant execute on function public.reset_quiz_attempt(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
