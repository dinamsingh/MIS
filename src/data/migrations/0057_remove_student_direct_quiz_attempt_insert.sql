-- ============================================================================
-- Migration: 0057_remove_student_direct_quiz_attempt_insert
-- Security hardening: close the direct-INSERT hole on public.quiz_attempts.
--
-- WHY
-- Migration 0002 granted students a direct INSERT policy on quiz_attempts:
--
--     create policy student_insert_own_quiz_attempt on public.quiz_attempts
--       for insert to authenticated
--       with check (student_id = auth.uid());
--
-- This lets ANY authenticated student bypass the app and the server-side
-- grading function entirely: with a known quiz_id (visible in every share
-- link) they can INSERT a fabricated row — e.g. score = 100 with empty
-- answers — straight into quiz_attempts via the Supabase client. The row
-- then appears in the teacher's results and leaderboard as a legitimate
-- attempt, corrupting academic records.
--
-- The ONLY legitimate write path is the SECURITY DEFINER function
-- public.submit_attempt(quiz_id, answers), which:
--   * verifies roster membership + enrollment match,
--   * enforces the active window and timed session,
--   * grades the answers server-side (client never controls the score),
--   * upserts with ON CONFLICT DO NOTHING to keep single-attempt.
-- SECURITY DEFINER functions execute as the table owner and bypass RLS,
-- so submit_attempt keeps working with NO insert policy present.
--
-- Audited all client code: every .from('quiz_attempts') call is a SELECT
-- (quizAccess.ts, teachingHistoryAccess.ts, ReportsPage, LeaderboardPage,
-- AnalyticsPage). Nothing relies on the removed INSERT policy.
-- The student SELECT-own-attempt policy from 0002 is intentionally KEPT so
-- students can still read their own recorded results.
-- ============================================================================

drop policy if exists student_insert_own_quiz_attempt on public.quiz_attempts;

-- Belt-and-braces: revoke the raw INSERT/UPDATE/DELETE table privilege from
-- the API roles too, so even a policy regression cannot reintroduce direct
-- writes. The SECURITY DEFINER submit_attempt runs as the owner and is
-- unaffected.
revoke insert, update, delete on public.quiz_attempts from anon;
revoke insert, update, delete on public.quiz_attempts from authenticated;

comment on table public.quiz_attempts is
  'Student quiz attempts. Writes ONLY via public.submit_attempt() (SECURITY DEFINER, server-graded). Direct client INSERT/UPDATE/DELETE is denied — see migration 0057.';

notify pgrst, 'reload schema';
