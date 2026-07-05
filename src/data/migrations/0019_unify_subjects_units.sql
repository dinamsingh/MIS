-- ============================================================================
-- Migration: 0019_unify_subjects_units
-- Unify the whole app onto the onboarding master subject/unit identity.
--
-- Problem
-- -------
-- Operational tables (quizzes, assignments, attendance, marks, timetable) had
-- their subject_id/unit_id foreign keys pointing at the LEGACY public.subjects
-- / public.units tables. But the global Subject selector, onboarding and the
-- Syllabus Tracker all use public.syllabus_subjects / public.syllabus_units.
-- The two id spaces never matched, so units showed empty in Quiz/Assignment and
-- attendance/marks writes would violate the legacy FK.
--
-- Fix
-- ---
-- Repoint every operational foreign key from subjects/units to
-- syllabus_subjects/syllabus_units, so ONE subject/unit identity flows through
-- the entire app. Legacy subjects/units/topics tables are left in place but are
-- no longer referenced (retired).
--
-- Safety
-- ------
-- Before repointing, any orphan operational rows whose subject_id/unit_id does
-- NOT exist in the target syllabus table are deleted (cascading to their
-- children). In a fresh multi-teacher setup there is typically no such data.
-- This is destructive by design (clean start) and was confirmed with the owner.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + guarded ADD; safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: repoint one FK column to a target table, cleaning orphans first.
-- ----------------------------------------------------------------------------
create or replace function pg_temp.repoint_fk(
    p_table       text,
    p_column      text,
    p_target      text,
    p_constraint  text
) returns void
language plpgsql
as $$
begin
    -- 1. Delete orphan rows that would violate the new FK.
    execute format(
        'delete from public.%I t where t.%I is not null and not exists ' ||
        '(select 1 from public.%I s where s.id = t.%I)',
        p_table, p_column, p_target, p_column
    );
    -- 2. Drop the old FK (legacy name) and any prior run of the new one.
    execute format('alter table public.%I drop constraint if exists %I', p_table, p_table || '_' || p_column || '_fkey');
    execute format('alter table public.%I drop constraint if exists %I', p_table, p_constraint);
    -- 3. Add the new FK pointing at the syllabus master table.
    execute format(
        'alter table public.%I add constraint %I foreign key (%I) references public.%I (id) on delete cascade',
        p_table, p_constraint, p_column, p_target
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- Repoint each operational FK.
-- ----------------------------------------------------------------------------
select pg_temp.repoint_fk('quizzes',                'unit_id',    'syllabus_units',    'quizzes_unit_syllabus_fkey');
select pg_temp.repoint_fk('assignments',            'subject_id', 'syllabus_subjects', 'assignments_subject_syllabus_fkey');
select pg_temp.repoint_fk('assignments',            'unit_id',    'syllabus_units',    'assignments_unit_syllabus_fkey');
select pg_temp.repoint_fk('assignment_submissions', 'unit_id',    'syllabus_units',    'assignment_submissions_unit_syllabus_fkey');
select pg_temp.repoint_fk('lab_manual_submissions', 'unit_id',    'syllabus_units',    'lab_manual_submissions_unit_syllabus_fkey');
select pg_temp.repoint_fk('attendance',             'subject_id', 'syllabus_subjects', 'attendance_subject_syllabus_fkey');
select pg_temp.repoint_fk('mark_components',        'subject_id', 'syllabus_subjects', 'mark_components_subject_syllabus_fkey');
select pg_temp.repoint_fk('timetable_entries',      'subject_id', 'syllabus_subjects', 'timetable_entries_subject_syllabus_fkey');

-- pg_temp.* is dropped automatically at session end.
