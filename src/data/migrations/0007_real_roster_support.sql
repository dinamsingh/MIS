-- ============================================================================
-- Migration: 0007_real_roster_support
-- Teacher Academic MIS — support importing a real college roster.
--
-- Why this migration exists
-- -------------------------
-- The pilot was seeded with twelve demo students. The teacher now imports the
-- real class roster exported from the college ERP, which differs from the demo
-- assumptions in three ways:
--
--   1. Re-appearing / back-semester students carry an enrollment number whose
--      last six characters are alphanumeric (e.g. 0131CS243D01), not strictly
--      six digits. The original CHECK only allowed six digits and rejected them.
--   2. The ERP export contains only (enrollment_number, name) — no email. Email
--      is captured later when the student signs in with Google, so the email
--      columns must be nullable.
--   3. Identity is keyed by enrollment number ("auto-detect by enrollment"), so
--      enrollment_number must be unique where present.
--
-- It also adds batch / semester / department descriptors to sections so a single
-- teacher can organise multiple class groups.
--
-- All changes are additive or relaxing (widen a CHECK, drop NOT NULL, add
-- columns, add a partial unique index) and therefore safe to apply to a
-- database that already holds the demo data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Relax the enrollment-number pattern: 4 digits, 2 uppercase letters, then
--    6 alphanumeric (uppercase) characters. Still anchored and case-strict.
-- ----------------------------------------------------------------------------
alter table public.student_roster
    drop constraint if exists student_roster_enrollment_number_format;
alter table public.student_roster
    add constraint student_roster_enrollment_number_format
    check (enrollment_number ~ '^[0-9]{4}[A-Z]{2}[0-9A-Z]{6}$');

alter table public.students
    drop constraint if exists students_enrollment_number_format;
alter table public.students
    add constraint students_enrollment_number_format
    check (enrollment_number is null
           or enrollment_number ~ '^[0-9]{4}[A-Z]{2}[0-9A-Z]{6}$');

-- ----------------------------------------------------------------------------
-- 2. Email is unknown at import time (filled on Google sign-in) — make it
--    nullable on both the allowlist and the managed-student table.
-- ----------------------------------------------------------------------------
alter table public.student_roster alter column email drop not null;
alter table public.students        alter column email drop not null;

-- ----------------------------------------------------------------------------
-- 3. Identity is keyed by enrollment number. Enforce uniqueness with a plain
--    unique index (NULLs remain distinct in PostgreSQL, so students not yet
--    assigned an enrollment number are unaffected). A plain unique index also
--    serves as the arbiter for ON CONFLICT (enrollment_number) upserts.
-- ----------------------------------------------------------------------------
create unique index if not exists uq_student_roster_enrollment
    on public.student_roster (enrollment_number);

create unique index if not exists uq_students_enrollment
    on public.students (enrollment_number);

-- ----------------------------------------------------------------------------
-- 4. Describe each section by batch / semester / department so one teacher can
--    manage multiple class groups (e.g. 2024-2028, 5th Semester, CSE, Sec A).
-- ----------------------------------------------------------------------------
alter table public.sections add column if not exists batch      text;
alter table public.sections add column if not exists semester   text;
alter table public.sections add column if not exists department text;
