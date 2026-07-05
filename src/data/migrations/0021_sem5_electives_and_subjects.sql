-- ============================================================================
-- Migration: 0021_sem5_electives_and_subjects
-- Add elective grouping + correct the V-Semester (sem 5) subject list.
--
-- Adds `syllabus_subjects.elective_group` (nullable): elective variants that
-- belong to the same choice (e.g. the three Departmental Electives) share a
-- group label so onboarding can show them together and enforce "pick one".
--
-- Fixes the sem-5 scheme to match RGPV CSE V-SEM:
--   CS-501 Theory of Computation (theory)         -- kept
--   CS-502 Database Management Systems (theory)    -- kept
--   CS-503 Departmental Elective -> CS-503A/B/C    -- variants
--   CS-504 Open Elective         -> CS-504A/B/C    -- variants
--   CS-505 Lab (Linux)  (lab)                      -- was "Mini Project"
--   CS-506 Lab (Python) (lab)                      -- was "Skill Development"
--
-- The old placeholder rows (generic CS-503/504, CS-505/506) are removed; any
-- teacher_assignments that referenced them cascade away (they were placeholders
-- with no real syllabus). CS-501/CS-502 are left untouched so their existing
-- assignments/units survive.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded inserts.
-- ============================================================================

alter table public.syllabus_subjects add column if not exists elective_group text;

-- Remove outdated sem-5 placeholder subjects (cascades their assignments).
delete from public.syllabus_subjects
where sem = 5 and code in ('CS-503', 'CS-504', 'CS-505', 'CS-506');

-- Insert the correct sem-5 subjects (skip any that already exist by code+sem).
insert into public.syllabus_subjects (sem, code, name, kind, lab_name, elective_group)
select v.sem, v.code, v.name, v.kind, v.lab_name, v.elective_group
from (values
  (5, 'CS-503A', 'Data Analytics',                              'elective', null::text, 'Departmental Elective'::text),
  (5, 'CS-503B', 'Pattern Recognition',                         'elective', null,       'Departmental Elective'),
  (5, 'CS-503C', 'Cyber Security',                              'elective', null,       'Departmental Elective'),
  (5, 'CS-504A', 'Internet and Web Technology',                 'elective', null,       'Open Elective'),
  (5, 'CS-504B', 'Object Oriented Programming',                 'elective', null,       'Open Elective'),
  (5, 'CS-504C', 'Introduction to Database Management Systems', 'elective', null,       'Open Elective'),
  (5, 'CS-505',  'Lab (Linux)',                                 'lab',      null,       null),
  (5, 'CS-506',  'Lab (Python)',                                'lab',      null,       null)
) as v(sem, code, name, kind, lab_name, elective_group)
where not exists (
  select 1 from public.syllabus_subjects s where s.code = v.code and s.sem = v.sem
);
