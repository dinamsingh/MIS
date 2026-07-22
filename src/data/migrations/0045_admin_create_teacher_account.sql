-- ============================================================================
-- Migration: 0045_admin_create_teacher_account
-- Adds `must_reset_password` to `public.teachers`, supporting the new
-- "admin creates the teacher's Supabase Auth account" flow (Cloudflare Pages
-- Function `functions/api/admin-create-teacher.ts`).
--
-- Previously, adding an email to `allowed_teacher_emails` only permitted a
-- FUTURE onboarding write for that email — the admin still had to manually
-- create the Supabase Auth user via the Dashboard before the teacher could
-- ever sign in. The new admin-create-teacher flow creates the Auth user (with
-- a random one-time temporary password shown once in the admin UI) AND the
-- allowlist entry in one action. `must_reset_password` marks that a teacher's
-- account was created this way and still holds the admin-issued temporary
-- password, so onboarding can force a password change before the teacher
-- proceeds.
--
-- Flag lifecycle:
--   - Set to `true` by `admin-create-teacher.ts` (service-role client) at the
--     moment it pre-creates the `teachers` row for a newly-created Auth user.
--   - Cleared to `false` by the teacher themself during onboarding, once they
--     successfully set their own password (`setTeacherPassword()` in
--     `src/features/onboarding/api/onboarding.ts`), via a plain authenticated
--     update to their own row — already covered by the existing
--     `teachers_update_own` RLS policy (migration 0014/0002), so no RLS
--     changes are needed here.
--   - Defaults to `false` for every existing/otherwise-created teacher row
--     (e.g. a teacher who signs in with Google and never had a temporary
--     password), which is the correct default: no forced reset for them.
--
-- Idempotent: `add column if not exists`.
-- ============================================================================

alter table public.teachers
  add column if not exists must_reset_password boolean not null default false;

comment on column public.teachers.must_reset_password is
  'True when an admin auto-created this teacher''s Supabase Auth account with a random temporary password (via admin-create-teacher.ts) and the teacher has not yet chosen their own password. Cleared to false by the teacher during onboarding after they set a new password. Default false for all other teachers (e.g. Google sign-in).';

notify pgrst, 'reload schema';
