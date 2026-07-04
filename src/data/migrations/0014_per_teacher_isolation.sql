-- ============================================================================
-- Migration: 0014_per_teacher_isolation
-- Multi-teacher — Step 2: per-teacher isolation of operational data.
--
-- Model (confirmed with the product owner)
-- ----------------------------------------
--   SHARED across all teachers (a batch's physical class + roster is common):
--     sections, students, student_roster   -> keep is_teacher()-based access
--     syllabus_subjects, batches           -> already shared master data (0010)
--
--   PRIVATE to each teacher (their own teaching records):
--     subjects, units, topics, timetable_entries, attendance,
--     mark_components, mark_values, quizzes, questions, assignments,
--     assignment_submissions, lab_manual_submissions, files,
--     leaderboard_config, settings
--
-- How isolation works
-- -------------------
-- Each private table gets an `owner_id uuid default auth.uid()` column. When a
-- teacher inserts a row from the authenticated client, Postgres stamps their id
-- automatically (no app change needed). RLS is switched from the shared
-- `using (is_teacher())` rule to `using (owner_id = auth.uid())`, so a teacher
-- sees and edits ONLY their own rows.
--
-- Existing operational rows (created before this migration) have owner_id = NULL
-- and therefore become invisible to everyone. This is intentional: the roster
-- (sections/students) is preserved and shared, while old teaching records start
-- fresh per teacher. No destructive deletes are performed here.
--
-- The dashboard RPC (get_dashboard_data) bypasses RLS, so it is updated
-- separately in 0015 to filter operational metrics by owner_id = auth.uid().
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + DROP/CREATE POLICY, safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Add owner_id (default auth.uid()) to every private table.
-- ----------------------------------------------------------------------------
alter table public.subjects               add column if not exists owner_id uuid default auth.uid();
alter table public.units                  add column if not exists owner_id uuid default auth.uid();
alter table public.topics                  add column if not exists owner_id uuid default auth.uid();
alter table public.timetable_entries       add column if not exists owner_id uuid default auth.uid();
alter table public.attendance              add column if not exists owner_id uuid default auth.uid();
alter table public.mark_components         add column if not exists owner_id uuid default auth.uid();
alter table public.mark_values             add column if not exists owner_id uuid default auth.uid();
alter table public.quizzes                 add column if not exists owner_id uuid default auth.uid();
alter table public.questions               add column if not exists owner_id uuid default auth.uid();
alter table public.assignments             add column if not exists owner_id uuid default auth.uid();
alter table public.assignment_submissions  add column if not exists owner_id uuid default auth.uid();
alter table public.lab_manual_submissions  add column if not exists owner_id uuid default auth.uid();
alter table public.files                   add column if not exists owner_id uuid default auth.uid();
alter table public.leaderboard_config      add column if not exists owner_id uuid default auth.uid();
alter table public.settings                add column if not exists owner_id uuid default auth.uid();

-- ----------------------------------------------------------------------------
-- 2. Indexes on owner_id for fast per-teacher filtering.
-- ----------------------------------------------------------------------------
create index if not exists idx_subjects_owner              on public.subjects (owner_id);
create index if not exists idx_units_owner                 on public.units (owner_id);
create index if not exists idx_topics_owner                on public.topics (owner_id);
create index if not exists idx_timetable_entries_owner     on public.timetable_entries (owner_id);
create index if not exists idx_attendance_owner            on public.attendance (owner_id);
create index if not exists idx_mark_components_owner        on public.mark_components (owner_id);
create index if not exists idx_mark_values_owner            on public.mark_values (owner_id);
create index if not exists idx_quizzes_owner               on public.quizzes (owner_id);
create index if not exists idx_questions_owner             on public.questions (owner_id);
create index if not exists idx_assignments_owner           on public.assignments (owner_id);
create index if not exists idx_assignment_submissions_owner on public.assignment_submissions (owner_id);
create index if not exists idx_lab_manual_submissions_owner on public.lab_manual_submissions (owner_id);
create index if not exists idx_files_owner                 on public.files (owner_id);
create index if not exists idx_leaderboard_config_owner    on public.leaderboard_config (owner_id);
create index if not exists idx_settings_owner              on public.settings (owner_id);

-- ----------------------------------------------------------------------------
-- 3. Swap RLS: drop the shared is_teacher() policies, add owner-scoped ones.
--    Each policy grants a teacher full access to ONLY their own rows.
-- ----------------------------------------------------------------------------

-- subjects
drop policy if exists teacher_all_subjects on public.subjects;
drop policy if exists owner_all_subjects on public.subjects;
create policy owner_all_subjects on public.subjects
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- units
drop policy if exists teacher_all_units on public.units;
drop policy if exists owner_all_units on public.units;
create policy owner_all_units on public.units
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- topics
drop policy if exists teacher_all_topics on public.topics;
drop policy if exists owner_all_topics on public.topics;
create policy owner_all_topics on public.topics
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- timetable_entries
drop policy if exists teacher_all_timetable_entries on public.timetable_entries;
drop policy if exists owner_all_timetable_entries on public.timetable_entries;
create policy owner_all_timetable_entries on public.timetable_entries
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- attendance
drop policy if exists teacher_all_attendance on public.attendance;
drop policy if exists owner_all_attendance on public.attendance;
create policy owner_all_attendance on public.attendance
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- mark_components
drop policy if exists teacher_all_mark_components on public.mark_components;
drop policy if exists owner_all_mark_components on public.mark_components;
create policy owner_all_mark_components on public.mark_components
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- mark_values
drop policy if exists teacher_all_mark_values on public.mark_values;
drop policy if exists owner_all_mark_values on public.mark_values;
create policy owner_all_mark_values on public.mark_values
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- quizzes
drop policy if exists teacher_all_quizzes on public.quizzes;
drop policy if exists owner_all_quizzes on public.quizzes;
create policy owner_all_quizzes on public.quizzes
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- questions
drop policy if exists teacher_all_questions on public.questions;
drop policy if exists owner_all_questions on public.questions;
create policy owner_all_questions on public.questions
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- files
drop policy if exists teacher_all_files on public.files;
drop policy if exists owner_all_files on public.files;
create policy owner_all_files on public.files
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- assignments
drop policy if exists teacher_all_assignments on public.assignments;
drop policy if exists owner_all_assignments on public.assignments;
create policy owner_all_assignments on public.assignments
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- assignment_submissions
drop policy if exists teacher_all_assignment_submissions on public.assignment_submissions;
drop policy if exists owner_all_assignment_submissions on public.assignment_submissions;
create policy owner_all_assignment_submissions on public.assignment_submissions
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- lab_manual_submissions
drop policy if exists teacher_all_lab_manual_submissions on public.lab_manual_submissions;
drop policy if exists owner_all_lab_manual_submissions on public.lab_manual_submissions;
create policy owner_all_lab_manual_submissions on public.lab_manual_submissions
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- leaderboard_config
drop policy if exists teacher_all_leaderboard_config on public.leaderboard_config;
drop policy if exists owner_all_leaderboard_config on public.leaderboard_config;
create policy owner_all_leaderboard_config on public.leaderboard_config
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- settings
drop policy if exists teacher_all_settings on public.settings;
drop policy if exists owner_all_settings on public.settings;
create policy owner_all_settings on public.settings
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. quiz_attempts: student rows stay student-owned. The teacher may READ
--    attempts only for quizzes THEY own (previously it was all attempts).
--    Grading/submit runs through SECURITY DEFINER functions that bypass RLS.
-- ----------------------------------------------------------------------------
drop policy if exists teacher_all_quiz_attempts on public.quiz_attempts;
drop policy if exists teacher_read_owned_quiz_attempts on public.quiz_attempts;
create policy teacher_read_owned_quiz_attempts on public.quiz_attempts
  for select to authenticated
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_attempts.quiz_id
        and q.owner_id = auth.uid()
    )
  );
-- (student_select_own_quiz_attempt / student_insert_own_quiz_attempt from 0002
--  remain in place, so a student still reads/inserts only their own attempt.)
