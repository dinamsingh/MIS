-- ============================================================================
-- Migration: 0030_simplify_assignment_workflow
--
-- Redesigns assignment tracking to match the teacher's real Excel workflow:
--
--  1. Adds `assignment_number` (1-5) to assignments so each subject can have
--     up to 5 numbered assignment slots without a complex creation form.
--
--  2. Makes `unit_id` nullable in both `assignments` and
--     `assignment_submissions` so subject-level slots don't require a unit.
--     Also adds a partial unique index for the simplified (no-unit) case.
--
--  3. Adds `submitted_at` timestamp to both submission tables so late
--     submissions can be tracked.
--
--  4. Adds `subject_id` to `lab_manual_submissions` with its own unique index
--     for the new subject-level single-checkbox lab file tracking (one DONE
--     per student per subject, not per unit).
-- ============================================================================

-- 1a. Make unit_id nullable in assignments (slots are subject-level)
ALTER TABLE public.assignments
  ALTER COLUMN unit_id DROP NOT NULL;

-- 1b. Add assignment_number column (1-5 per subject)
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS assignment_number smallint
  CONSTRAINT assignments_number_range CHECK (
    assignment_number IS NULL OR (assignment_number BETWEEN 1 AND 5)
  );

-- 1c. Unique: only one slot per assignment number per subject
CREATE UNIQUE INDEX IF NOT EXISTS assignments_subject_number_unique
  ON public.assignments (subject_id, assignment_number)
  WHERE assignment_number IS NOT NULL;

-- 2a. Make unit_id nullable in assignment_submissions
ALTER TABLE public.assignment_submissions
  ALTER COLUMN unit_id DROP NOT NULL;

-- 2b. Unique index for the new simplified flow (no unit_id)
--     Old constraint covers (assignment_id, student_id, unit_id IS NOT NULL).
--     This new index covers (assignment_id, student_id) when unit_id IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS assignment_submissions_slot_student_unique
  ON public.assignment_submissions (assignment_id, student_id)
  WHERE unit_id IS NULL;

-- 3a. submitted_at on assignment_submissions
ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- 3b. submitted_at on lab_manual_submissions
ALTER TABLE public.lab_manual_submissions
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- 4a. subject_id on lab_manual_submissions for subject-level tracking
ALTER TABLE public.lab_manual_submissions
  ADD COLUMN IF NOT EXISTS subject_id uuid
  REFERENCES public.subjects (id) ON DELETE CASCADE;

-- 4b. Unique: one lab-file check per student per subject
CREATE UNIQUE INDEX IF NOT EXISTS lab_manual_student_subject_unique
  ON public.lab_manual_submissions (student_id, subject_id)
  WHERE subject_id IS NOT NULL;
