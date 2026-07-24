-- ============================================================================
-- Migration: 0055_fix_reset_quiz_attempt_session
-- Update reset_quiz_attempt to also delete the quiz_attempt_sessions row.
-- This ensures that when a teacher resets an attempt, the student's timer
-- is also reset, preventing a 'time-expired' error on their next attempt.
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

    -- Delete the attempt
    delete from public.quiz_attempts
    where quiz_id = p_quiz_id and student_id = p_student_id;
    get diagnostics v_cleared = row_count;
    
    -- Also delete the session so the timer is reset for the student
    delete from public.quiz_attempt_sessions
    where quiz_id = p_quiz_id and student_id = p_student_id;

    return jsonb_build_object('status', 'reset', 'cleared', v_cleared);
end;
$$;

grant execute on function public.reset_quiz_attempt(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
