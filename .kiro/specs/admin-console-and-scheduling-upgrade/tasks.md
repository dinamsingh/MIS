# Implementation Plan: Admin Console & Scheduling Upgrade

## Overview

This plan implements the four independently-shippable phases from `design.md`: Admin role foundation, Admin bulk roster/session import, Batch promotion & academic history, and the Timetable overhaul. Each phase ends with its own checkpoint so the app remains shippable after every phase, not only at the very end.

Sequencing notes baked into this plan (see `Task Dependency Graph` for the machine-readable form):

- The `get_my_role()` return-type change (`text` → `text[]`) is its own task (task 2), separate from the `public.admins` table/RPCs (task 1) it depends on. The four existing call sites (`RequireTeacher`, `RootRedirect`, `SignInRoute`, `OnboardingRoute`) are updated together in one following task (task 3.2), which re-runs the preservation fixtures from `student-signin-role-routing-fix` against the new array-shaped role signal (fix/regression checking, per `design.md`'s Testing Strategy) rather than skipping that check.
- The duplicate-assignment unique index (task 9) is scoped as a database-schema change + `onboarding.ts` error-handling update; it depends only on task 8's `create_session()` migration file (same migration file, later task) and is otherwise independent of every Phase 1 admin-authorization task — it applies uniformly to the pre-existing teacher onboarding insert path too.
- Phase 4 is internally sequenced: periods catalog (0048) → `timetable_entries` schema changes (0049, references `periods.id`) → confirm/unlock + conflict-detection RPCs (0050, queries `section_timetable_status` and `timetable_entries.period_id` from 0049) → Attendance integration (calls `resolveConfirmedPeriods`, needs 0049+0050) → My Schedule view. My Schedule and the Attendance integration are independent read-side consumers of 0049/0050, so they run in the same parallel wave in the dependency graph, not one after the other.
- fast-check (`^3.22.0`, already present in `package.json`/`node_modules` at `3.23.2`, already wired into Vitest via `src/test/setup.ts`'s `fc.configureGlobal` and smoke-tested in `src/test/tooling.test.ts`) is confirmed rather than freshly installed — task 0 verifies this instead of assuming it and instead of re-installing a working setup.
- Property-based tests are added only for the pure derivation/formatting functions and RPC authorization/invariant logic that `design.md`'s Testing Strategy scopes PBT to. Static schema/seed facts, absence-of-control guardrails, and documentation/process-only requirements get one-time example/audit tests instead (never PBT), per that same section.

## Tasks

- [x] 0. Confirm property-based testing infrastructure
  - Verify `package.json` devDependencies pins `fast-check` to an exact/caret-pinned version and that `node_modules/fast-check` is actually installed (already the case: `^3.22.0` / installed `3.23.2`)
  - Verify `src/test/setup.ts`'s `fc.configureGlobal` and the existing `src/test/tooling.test.ts` smoke test still pass under `vitest run`, confirming fast-check is correctly wired into the existing Vitest setup used by `parsers.test.ts`/`rows.test.ts` — no new installation or configuration needed
  - _Requirements: (testing infrastructure prerequisite for every PBT task below)_

## Phase 1 — Admin Role Foundation (Requirements 1-4, Migrations 0043-0044)

- [x] 1. Create the Admin data model and authorization primitives
  - [x] 1.1 Create migration `0043_admin_role.sql`
    - `public.admins` table (email PK, `added_by`, `created_at`) mirroring `allowed_teacher_emails`' shape, RLS (`admins_read` gated on `is_admin()`), `public.is_admin()` `SECURITY DEFINER` helper, `protect_last_admin()` trigger (`BEFORE DELETE`, raises when count ≤ 1), `add_admin(email)` / `remove_admin(email)` `SECURITY DEFINER` RPCs (both `is_admin()`-gated; `remove_admin` wraps the delete in `begin/exception` to translate the trigger's raised exception into `{status:'denied', reason:'last-admin'}`)
    - Document the one-time bootstrap SQL (`insert into public.admins (email) values (...)`) in `SETUP_GUIDE.md` alongside the existing `app.teacher_email` bootstrap note
    - _Requirements: 1.2, 1.3, 1.5, 1.6, 1.7_

  - [ ]* 1.2 Write property-based test for admin add/remove and last-admin protection
    - **Property 2: Admin add/remove and last-admin protection**
    - **Validates: Requirements 1.4, 1.5, 1.6, 1.7**
    - Generate `public.admins` states with N ≥ 1 rows; assert an admin adding a new email results in that email resolving `'admin'` via `is_admin()`; for N ≥ 2, assert an admin removing a row immediately excludes it; for exactly 1 row, assert ANY delete attempt (via `remove_admin()`, a direct table delete, or any other path) is rejected with an explanatory error and the row remains intact
    - Use a seeded local/test Postgres instance (or Supabase local dev stack) with generated admin-count/removal-target combinations, per `design.md`'s Testing Strategy (RPC authorization/invariant logic is tested this way, not via 100 live round trips)

- [x] 2. Extend `get_my_role()` to return an independent role-tag array
  - [x] 2.1 Change `get_my_role()`'s return type from `text` to `text[]`
    - Append to `src/data/migrations/0043_admin_role.sql` (same file, later statement — this is intentionally its own task per the sequencing notes): change `get_my_role()`'s return type from `text` to `text[]`, returning any subset of `{admin, teacher, pending-teacher}` (admin fully independent of teacher/pending-teacher, which remain mutually exclusive with each other), failing closed to `'{}'` on missing `auth.uid()`/`auth.email()`
    - `grant execute on function public.get_my_role() to authenticated;` and `notify pgrst, 'reload schema';`
    - _Requirements: 1.8_

  - [ ]* 2.2 Write property-based test for `get_my_role()` reflecting admins-table membership additively
    - **Property 3: `get_my_role()` reflects admins-table membership additively**
    - **Validates: Requirements 1.8**
    - For generated identities, assert the returned tag set includes `'admin'` if and only if that identity's email is present in `public.admins`, independent of and additive to whatever teacher/pending-teacher tag the same call also returns

  - [ ]* 2.3 Write property-based test for role independence
    - **Property 1: Role independence**
    - **Validates: Requirements 1.1**
    - For generated identities and admin/teacher status combinations, assert granting/revoking admin capability never changes that identity's teacher/pending-teacher status, and granting/revoking teacher/onboarding status never changes that identity's admin status

- [x] 3. Update client-side role consumption for the array-shaped `get_my_role()` contract
  - [x] 3.1 Rewrite `src/presentation/auth/useUserRole.ts` to consume `text[]`
    - Change `UserRole`/`UserRoleStatus` to the `RoleTag` (`'admin' | 'teacher' | 'pending-teacher'`) + `roles: readonly RoleTag[] | null` shape from `design.md`, with derived `isAdmin`/`isTeacher`/`isPendingTeacher` booleans computed from `roles` (never fetched separately); fail closed to `[]` on RPC error or an array containing an unrecognized tag
    - Update `src/presentation/auth/index.ts`'s re-exports accordingly
    - _Requirements: 1.8, 1.9, 1.10_

  - [x] 3.2 Update `RequireTeacher`, `RootRedirect`, `SignInRoute`, and `OnboardingRoute` together
    - **IMPORTANT**: update all four call sites in this single task, not incrementally — they share the same contract change
    - `src/presentation/auth/RequireTeacher.tsx`: replace the `role !== 'teacher' && role !== 'pending-teacher'` check with `!isTeacher && !isPendingTeacher` from the revised `useUserRole()`
    - `src/presentation/App.tsx`: update `RootRedirect`, `SignInRoute`, and `OnboardingRoute` with the equivalent array-based substitution (`role === 'teacher' || role === 'pending-teacher'` → `isTeacher || isPendingTeacher`), preserving every existing branch (anonymous → `/sign-in`, authenticated non-teacher → sign out + `/sign-in` with `NOT_APPROVED_TEACHER_STATE`, teacher/pending-teacher → `/dashboard` or the onboarding wizard) bit-for-bit
    - _Requirements: 1.1, 1.9, 1.10_

  - [x]* 3.3 Re-verify the `student-signin-role-routing-fix` fixtures against the array-shaped routing (fix/regression checking)
    - **IMPORTANT**: this is a preservation check, not a new property — re-run the SAME teacher/pending-teacher/anonymous fixtures `student-signin-role-routing-fix`'s `tasks.md` (tasks 1-3.7) already established against `RequireTeacher.test.tsx` / `App.routing.test.tsx`, now mocking `supabase.rpc('get_my_role')` to resolve arrays (`['teacher']`, `['pending-teacher']`, `[]`) instead of the old single strings
    - Assert every previously-observed routing outcome is identical post-change: `RequireTeacher` renders children for teacher/pending-teacher and redirects otherwise; `RootRedirect`/`SignInRoute` target `/dashboard` for teacher/pending-teacher and `/sign-in` otherwise; `OnboardingRoute` behaves unchanged
    - Additionally confirm an admin-only identity (`['admin']`, no teacher tag) newly and correctly resolves `isTeacher = false`/`isPendingTeacher = false` and is routed to `/sign-in` by these teacher-gated routes exactly as any other non-teacher would be
    - _Requirements: 1.1_

- [x] 4. Build the `RequireAdmin` guard and Admin Console shell/navigation
  - [x] 4.1 Create `src/presentation/auth/RequireAdmin.tsx`
    - Mirror `RequireTeacher`'s shape: render `fallback` while `loading`, redirect to `redirectTo` (default `/dashboard`) unless `isAdmin`, else render `children`
    - _Requirements: 1.9, 1.10_

  - [x] 4.2 Wire the Admin Console shell, routes, and navigation entry
    - `src/presentation/App.tsx`: add `AdminShell` (wraps `RequireAdmin` + `AppLayout`, no `SelectedSectionProvider`, parallel to `TeacherShell` — not nested inside it) and an `/admin` route subtree with `/admin` → redirect to `/admin/teachers`, plus placeholder routes for `/admin/teachers`, `/admin/powers`, `/admin/admins` (the three pages this phase builds in task 6)
    - `src/presentation/navigation.ts`: add an `admin` nav group, rendered only when `isAdmin` (consumed by the sidebar wherever it reads `navGroups` — filter the group client-side based on `useUserRole().isAdmin`)
    - _Requirements: 1.9, 1.10_

  - [ ]* 4.3 Write property-based test for admin navigation gating
    - **Property 4: Admin navigation gating is exactly role-driven**
    - **Validates: Requirements 1.9, 1.10**
    - For generated role-tag sets, assert the Admin nav section and every Admin-only route render if and only if the set includes `'admin'`

- [x] 5. Create the Delegated Extra Powers migration
  - [x] 5.1 Create migration `0044_teacher_extra_powers.sql`
    - `public.teacher_extra_powers` table (`teacher_id`, `power_name` CHECK IN `('cross_section_visibility', 'teacher_allowlist_approval')`, `granted_by`, `created_at`, PK `(teacher_id, power_name)`), RLS (`teacher_extra_powers_read_own`: caller reads own rows or any row if admin), `has_extra_power(power)` `SECURITY DEFINER` helper, `grant_teacher_extra_power(email, power)` / `revoke_teacher_extra_power(email, power)` `SECURITY DEFINER` RPCs (both `is_admin()`-gated), `remove_allowed_teacher(email)` RPC (gated on `is_admin() OR has_extra_power('teacher_allowlist_approval')`), and the additive `teacher_read_sections` policy update on `public.sections` (`is_teacher() OR has_extra_power('cross_section_visibility')`)
    - _Requirements: 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 5.2 Write property-based test for allowlist add/remove authorization
    - **Property 5: Allowlist add/remove authorization**
    - **Validates: Requirements 2.3, 2.4**
    - For generated callers (admin, `teacher_allowlist_approval`-holder, neither), assert add/remove requests succeed exactly for the admin-or-(remove-only)-power-holder cases and are denied otherwise, server-side

  - [ ]* 5.3 Write property-based test for Extra Power scoping and default-off
    - **Property 6: Extra Power scoping and default-off**
    - **Validates: Requirements 3.1, 3.3**
    - For generated pairs of distinct teachers, assert granting an Extra_Power to one never makes `has_extra_power()` true for the other, and a teacher with no grant row resolves false by default

  - [ ]* 5.4 Write property-based test for Extra Power grant metadata
    - **Property 7: Extra Power grant metadata**
    - **Validates: Requirements 3.4**
    - For generated grant actions, assert the resulting row's `granted_by` equals the granting admin's identity and `created_at` reflects the grant time

  - [ ]* 5.5 Write property-based test for Extra Power grant/revoke round trip
    - **Property 8: Extra Power grant/revoke round trip**
    - **Validates: Requirements 3.5**
    - For generated (teacher, power) pairs, assert grant-then-revoke returns to the exact pre-grant state with no subsequent read observing the power as still active

  - [ ]* 5.6 Write property-based test restricting grant/revoke to admins only
    - **Property 9: Only admins grant/revoke Extra Powers**
    - **Validates: Requirements 3.6**
    - For generated non-admin callers (including the teacher who is the subject of the grant), assert any grant/revoke attempt is denied

  - [ ]* 5.7 Write property-based test for `cross_section_visibility`'s silent access
    - **Property 10: `cross_section_visibility` grants silent access**
    - **Validates: Requirements 3.7**
    - For generated teachers granted the power, assert reads of another teacher's sections/students succeed without an admin identity, and no audit-log or notification row is created as a result

- [x] 6. Build the Phase 1 Admin Console pages
  - [x] 6.1 Create `AdminTeacherApprovalPage`
    - New file `src/presentation/pages/AdminTeacherApprovalPage.tsx` (+ a `AdminTeacherApprovalView.tsx` if the page/view split is warranted, matching the existing `RosterPage`/`RosterView` pattern): list every `allowed_teacher_emails` row (add via existing `add_allowed_teacher()`, remove via new `remove_allowed_teacher()`), list every `public.teachers` row with onboarded status/email/name distinguishing onboarded vs. pending-only, read-only with respect to `public.teachers` (no direct-edit control)
    - Hide/disable the add/remove controls client-side when `!isAdmin && !hasPower('teacher_allowlist_approval')`
    - Wire the route at `/admin/teachers` in `src/presentation/App.tsx` (replacing task 4.2's placeholder)
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6_

  - [x]* 6.2 Write unit tests for `AdminTeacherApprovalPage`
    - Example tests: renders every `allowed_teacher_emails` row; distinguishes onboarded vs. pending-only teachers; has no direct-edit control on any teacher row; add/remove controls are hidden/disabled for a caller lacking both admin status and the `teacher_allowlist_approval` power
    - _Requirements: 2.1, 2.5, 2.6_

  - [x] 6.3 Create `AdminExtraPowersPage`
    - New file `src/presentation/pages/AdminExtraPowersPage.tsx`: per-teacher toggle for `cross_section_visibility` and `teacher_allowlist_approval`, calling `grant_teacher_extra_power`/`revoke_teacher_extra_power`
    - Wire the route at `/admin/powers`
    - _Requirements: 3.2, 3.4, 3.5_

  - [x] 6.4 Create `AdminManageAdminsPage`
    - New file `src/presentation/pages/AdminManageAdminsPage.tsx`: list `public.admins`, add via `add_admin()`, remove via `remove_admin()`, surface the `last-admin` denial reason inline (new `messages.admin.lastAdminProtected` catalog entry)
    - Wire the route at `/admin/admins`
    - _Requirements: 1.4, 1.5, 1.6_

  - [x]* 6.5 Write the Admin Console boundaries audit test
    - One-time example/audit test (not PBT, per `design.md`'s Testing Strategy — absence-of-control guardrails): walk the Admin Console component tree (`AdminTeacherApprovalPage`, `AdminExtraPowersPage`, `AdminManageAdminsPage`) and assert none of them render a raw-SQL input, a migration-runner control, a generic "edit as this user" action, or a bulk-delete control
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 7. Phase 1 checkpoint
  - Run the full test suite (`npm run test`)
  - Confirm every Phase 1 property test (tasks 1.2, 2.2, 2.3, 4.3, 5.2-5.7) and unit test (6.2, 6.5) passes
  - Confirm the re-verified `student-signin-role-routing-fix` fixtures (task 3.3) still pass with no regression
  - Ask the user if questions arise

## Phase 2 — Admin Bulk Roster/Session Import (Requirements 5-9, Migrations 0045-0046)

- [x] 8. Create the Session Creation Flow RPC
  - [x] 8.1 Create migration `0045_session_creation_and_duplicate_guard.sql` (`create_session`)
    - `create_session(batch_id, start_year, current_sem, section_count)` `SECURITY DEFINER` RPC — `is_admin()`-gated, rejects a negative `section_count`, rejects a duplicate `batch_id` (`{status:'denied', reason:'duplicate-batch-code'}`), otherwise inserts the batch row then exactly `section_count` shared `sections` rows named `'CSE-{sem}{Letter}'` (no owner column populated), all inside the function's implicit transaction so any failure rolls back the whole operation
    - _Requirements: 5.1, 5.3, 5.4, 5.5_

  - [ ]* 8.2 Write property-based test for syllabus-subject candidate list matching
    - **Property 11: Syllabus-subject candidate list matches the chosen semester exactly**
    - **Validates: Requirements 5.2**
    - For generated semester numbers, assert the Session_Creation_Flow's candidate subject list equals exactly the `syllabus_subjects` rows whose `sem` equals that number

  - [ ]* 8.3 Write property-based test for session creation atomicity and count-exactness
    - **Property 12: Session creation is atomic, shared, and count-exact**
    - **Validates: Requirements 5.3, 5.4**
    - For generated non-negative section counts N and new batch codes, assert `create_session` creates exactly N shared `sections` rows (zero when N = 0, batch still committed) with no per-teacher ownership column populated, and that any injected mid-operation failure leaves no partial batch/section row committed

  - [ ]* 8.4 Write property-based test for duplicate batch code rejection
    - **Property 13: Duplicate batch code rejected, state unchanged**
    - **Validates: Requirements 5.5**
    - For generated existing batch codes, assert a subsequent `create_session` call with the same code is rejected with a conflict-identifying result and creates no new batch/section rows

- [x] 9. Add the database-level duplicate subject-section-assignment safeguard
  - [x] 9.1 Add the unique index and update `onboarding.ts` error handling
    - Append to `src/data/migrations/0045_session_creation_and_duplicate_guard.sql`: `create unique index if not exists teacher_assignments_subject_section_batch_unique on public.teacher_assignments (subject_id, batch_id, section);` — deliberately excludes `is_lab` from the key so a theory claim and a lab claim of the same subject+section+batch by two different teachers are both blocked, while two different teachers claiming two different subjects on the same section/batch both succeed
    - Update `src/features/onboarding/api/onboarding.ts`'s `saveOnboarding()` insert-error handling (the `teacher_assignments` insert in the existing delete-then-insert flow) to catch Postgres error code `23505` on `teacher_assignments_subject_section_batch_unique` and throw `messages.teacherAssignment.duplicateClaim` (new message-catalog entry, not revealing the other teacher's identity) instead of the raw Postgres message
    - This task is independent of every Phase 1 admin-authorization task — the constraint applies uniformly to the pre-existing teacher onboarding insert path, which is the only insert path that exists until task 8's `create_session()` (same migration file) is also in place
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 9.2 Write property-based test for the duplicate-assignment safeguard
    - **Property 20: Duplicate subject-section-batch assignment blocked across teachers and entry points**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
    - For generated `(subject, section, batch)` combinations already claimed by one teacher, assert a different teacher's assignment attempt for the same combination is rejected with a message that does not reveal the first teacher's identity, while two different teachers claiming two different subjects for the same section/batch both succeed — exercised against both `saveOnboarding()`'s insert path and a direct insert simulating a future admin-driven path

- [x] 10. Build the admin bulk roster import wrapper
  - [x] 10.1 Create `src/data/access/adminRosterImportAccess.ts`
    - `parseAdminRosterCsv(text)`: wraps the existing, unmodified `parseRosterCsv` with the additional admin-only requirement that every row have an email — rows the base parser already rejected pass through unchanged; rows that passed the base parser but lack an email move into a new `missingEmail` bucket (`AdminRosterImportResult extends RosterImportResult`)
    - `addSingleStudent(client, sectionId, row)`: re-validates with `isValidEnrollmentNumber` (the same pure check the CSV path uses), then performs an additive `students` insert + `student_roster` upsert (never a destructive `replaceSection` delete-then-insert, since a single add must not wipe the rest of the section's roster)
    - Add `messages.rosterImport.missingEmail` to `src/domain/shared/messages.ts`, identifying the row and missing field
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.7_

  - [ ]* 10.2 Write property-based test for roster row required-field and format validation
    - **Property 14: Roster row required-field and format validation**
    - **Validates: Requirements 6.1, 6.2, 6.6**
    - For generated roster rows missing enrollment/name/email, or with an enrollment number not matching `^[0-9]{4}[A-Z]{2}[0-9]{6}$`, assert the admin bulk-import path rejects the row and identifies the row and violated field/format; for every other row, assert it is accepted

  - [ ]* 10.3 Write property-based test for immediate binding of accepted roster emails
    - **Property 15: Accepted roster email is immediately bound**
    - **Validates: Requirements 6.3**
    - For generated roster rows accepted with an email, assert the resulting `student_roster` entry is pre-bound such that a first quiz-link access for that email succeeds without an enrollment-verification step (exercised against `replaceSection`'s existing upsert, unmodified)

  - [ ]* 10.4 Write property-based test for single-student-add equivalence
    - **Property 16: Single-student add is equivalent to a one-row import**
    - **Validates: Requirements 6.5**
    - For generated valid single-student inputs, assert the resulting `students`/`student_roster` rows are identical in content to what a one-row CSV import of the same data would produce via `replaceSection`

- [x] 11. Build the roster remove-vs-permanently-delete RPCs
  - [x] 11.1 Create migration `0046_roster_remove_and_delete.sql`
    - `remove_student_from_roster(student_id)` (`is_admin()`-gated, nulls `section_id`, preserves all historical FK'd rows) and `permanently_delete_student(student_id, confirmed)` (`is_admin()`-gated, additionally requires `confirmed = true` as defense-in-depth, hard-deletes on success)
    - _Requirements: 8.1, 8.5_

  - [ ]* 11.2 Write property-based test for remove-vs-delete semantics
    - **Property 19: Remove-from-roster preserves history, permanent-delete requires explicit confirmation**
    - **Validates: Requirements 8.1, 8.5**
    - For generated students with existing historical attendance/marks/quiz-attempt records, assert `remove_student_from_roster` leaves every historical row unchanged while removing future section visibility; for generated calls to `permanently_delete_student` where `confirmed` is not exactly `true`, assert the delete does not execute and the record remains intact

- [x] 12. Build the Admin Session Creation and Roster Import pages
  - [x] 12.1 Create `AdminSessionCreationPage`
    - New file `src/presentation/pages/AdminSessionCreationPage.tsx`: prompts for batch code, Odd/Even semester type, semester number (in that order), auto-populates the candidate subject list from `syllabus_subjects` for the chosen semester, prompts for section count, calls `create_session`, surfaces the `duplicate-batch-code` denial inline
    - Wire the route at `/admin/sessions`
    - _Requirements: 5.1, 5.2_

  - [ ]* 12.2 Write unit test for Session_Creation_Flow field ordering
    - Example test: the flow prompts for batch code, sem type, sem number in that order
    - _Requirements: 5.1_

  - [x] 12.3 Create `AdminRosterImportPage`
    - New file `src/presentation/pages/AdminRosterImportPage.tsx`: CSV import UI (reusing the existing `RosterView`-style upload/preview pattern) driving `parseAdminRosterCsv`, surfacing `missingEmail` rows distinctly from `rejected` rows, plus a single-student manual-add form calling `addSingleStudent`; also hosts the roster remove-vs-delete UI for existing students — "Remove from roster" as the default/primary action, "Permanently delete" as a visually distinct secondary action behind a confirmation dialog whose copy states the destructive/FK-breaking risk, calling `permanently_delete_student(id, true)` only on explicit confirm (dismissing the dialog never calls the RPC)
    - Wire the route at `/admin/roster`
    - _Requirements: 6.1, 6.2, 6.5, 8.2, 8.3, 8.4_

  - [ ]* 12.4 Write unit tests for the roster remove/delete UI
    - Example tests: "Remove from roster" is the default/primary action on a student row; "Permanently delete" is visually distinct and behind a confirmation dialog with the destructive-risk warning copy; dismissing the dialog issues no RPC call
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

- [ ] 13. Verify teacher pickup of admin-provisioned roster (no new code path)
  - [ ]* 13.1 Write property-based test for immediate roster visibility on teacher pickup
    - **Property 17: Admin-provisioned roster is immediately visible to the claiming teacher**
    - **Validates: Requirements 7.1**
    - For generated sections provisioned by `create_session` and populated via the admin roster-import path, assert that when a teacher subsequently claims that batch/section/subject through `My_Teaching_Subjects` (`getOrCreateRealSection` matching on the exact `(name, batch)` tuple), the roster displayed equals exactly the previously imported rows with no manual entry required — exercising the EXISTING `fetchOnboardedSections`/`getOrCreateRealSection` code path unmodified

  - [ ]* 13.2 Write property-based test for admin-created sections never being pre-assigned
    - **Property 18: New admin-created sections are never pre-assigned**
    - **Validates: Requirements 7.2**
    - For generated sections newly created by `create_session`, assert no `teacher_assignments` row references it until a teacher explicitly claims it via `My_Teaching_Subjects`

- [x] 14. Phase 2 checkpoint
  - Run the full test suite (`npm run test`)
  - Confirm no regression in Phase 1's tests
  - Confirm every Phase 2 property test (8.2-8.4, 9.2, 10.2-10.4, 11.2, 13.1, 13.2) and unit test (12.2, 12.4) passes
  - Ask the user if questions arise

## Phase 3 — Batch Promotion & Academic History (Requirements 10-12, Migration 0047)

- [x] 15. Create the `promote_batch()` RPC
  - [x] 15.1 Create migration `0047_promote_batch.sql`
    - `promote_batch(batch_id)` `SECURITY DEFINER` RPC — `is_admin()`-gated, increments `current_sem` by 1 for `current_sem` in [1,7], sets `status = 'graduated'` (without further incrementing) for `current_sem = 8`, touches only the one identified `batches` row via a single `update ... where id = p_batch_id`, never writes to `sections`/`students`/`student_roster`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 15.2 Write property-based test for batch promotion correctness and isolation
    - **Property 21: Batch promotion is correct across the full semester domain and isolated to the target batch**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4**
    - For generated batches with `current_sem` in [1,7], assert promotion increments by exactly 1 with `status` unchanged; for `current_sem = 8`, assert `status` becomes `'graduated'` without further incrementing; for generated sets of other existing batches (and the promoted batch's own `sections`/`students`/`student_roster` rows), assert none of their state changes

  - [ ]* 15.3 Write property-based test restricting promotion to admins
    - **Property 22: Only admins may promote a batch**
    - **Validates: Requirements 10.5**
    - For generated non-admin callers, assert `promote_batch` is denied and no batch's `current_sem`/`status` changes

- [x] 16. Implement stale-assignment derivation
  - [x] 16.1 Create `src/domain/services/teacherAssignmentService.ts`
    - Pure `isStaleAssignment(assignment, batches)`: true when the assignment's subject `sem` is strictly less than its batch's current `currentSem` (live-read, never cached/stored)
    - Pure `activeAssignments(assignments, batches)`: filters out every stale assignment
    - _Requirements: 11.1, 11.2, 11.6_

  - [ ]* 16.2 Write property-based test for stale-assignment derivation correctness
    - **Property 23: Stale-assignment derivation is correct and exclusion-consistent**
    - **Validates: Requirements 11.1, 11.2**
    - For generated batch promotions and pre-existing `teacher_assignments` tied to that batch, assert an assignment is derived stale if and only if its subject's `sem` is strictly less than the batch's post-promotion `current_sem`, and that `activeAssignments` excludes exactly the assignments this predicate marks stale

  - [ ]* 16.3 Write property-based test for promotion-triggered staleness isolation
    - **Property 24: Promotion-triggered staleness is isolated per batch**
    - **Validates: Requirements 11.3**
    - For generated assignments tied to a batch NOT just promoted, assert promoting a different batch never changes that assignment's derived staleness

  - [ ]* 16.4 Write property-based test for historical-data preservation across promotion/graduation
    - **Property 26: Promotion and graduation never delete historical data**
    - **Validates: Requirements 11.6**
    - For generated batch promotion/graduation events, assert the row counts and content of `attendance`, `mark_values`, and `quiz_attempts` tied to that batch's prior-semester subjects are identical before and after the event

  - [x] 16.5 Wire `activeAssignments` into `fetchOnboardedSections()`
    - Update `src/features/onboarding/api/onboarding.ts`'s `fetchOnboardedSections()` to call `activeAssignments` (fetching all `batches` live) before deriving sections, so a stale assignment stops producing a selectable section for the Dashboard/Attendance/Timetable section selector
    - _Requirements: 11.2_

- [x] 17. Build the stale-assignment teacher notification
  - [x] 17.1 Create `src/features/onboarding/hooks/useStaleAssignmentNotice.ts`
    - Loads the teacher's own assignments + all batches, derives which batches contain at least one now-stale assignment via `isStaleAssignment`, returns that list for a banner — recomputed fresh on every load, no server-side notification record
    - Render the banner once on `/dashboard` (and/or `/profile`), directing the teacher to `My_Teaching_Subjects` to re-select subjects
    - _Requirements: 11.4, 11.5_

  - [ ]* 17.2 Write property-based test for stale-assignment notification accuracy
    - **Property 25: Stale-assignment notification reflects the derived set exactly**
    - **Validates: Requirements 11.4**
    - For generated teachers with one or more stale assignments, assert the notification's identified affected-batches set equals exactly the set of batches containing at least one of that teacher's stale assignments — no omissions, no extras

- [x] 18. Build the read-only Teaching History view
  - [x] 18.1 Create `TeachingHistoryPage`/`TeachingHistoryView`
    - New files `src/presentation/pages/TeachingHistoryPage.tsx` + `src/presentation/views/TeachingHistoryView.tsx`: issues the same owner-scoped queries the live Attendance/Marks/Quiz pages already use, additionally filtered to batches that are `status = 'graduated'` OR whose `current_sem` has advanced past the historical record's subject semester (reusing the `isStaleAssignment`-style comparison for display); groups results client-side by batch → semester → subject; renders zero insert/update/delete-capable controls
    - Wire the route at `/teaching-history` inside the existing `TeacherShell`
    - _Requirements: 12.1, 12.2, 12.3_

  - [ ]* 18.2 Write property-based test for Teaching History scoping
    - **Property 27: Teaching History shows exactly the teacher's own past-semester/graduated records**
    - **Validates: Requirements 12.1, 12.4**
    - For generated teachers and batch/semester combinations that have since been promoted past or graduated, assert `Teaching_History_View` results include exactly that teacher's own historical records for that semester, grouped by batch → semester → subject, and never another teacher's records

  - [ ]* 18.3 Write the Teaching History no-edit-controls audit test
    - One-time example/audit test (not PBT — absence-of-control guardrail per `design.md`'s Testing Strategy): assert `TeachingHistoryView` renders zero edit-capable controls anywhere in its tree
    - _Requirements: 12.2_

- [x] 19. Phase 3 checkpoint
  - Run the full test suite (`npm run test`)
  - Confirm no regression in Phase 1/2's tests
  - Confirm every Phase 3 property test (15.2, 15.3, 16.2-16.4, 17.2, 18.2) and audit test (18.3) passes
  - Ask the user if questions arise

## Phase 4 — Timetable Overhaul (Requirements 13-19, Migrations 0048-0050)

- [x] 20. Create the fixed Period_Catalog
  - [x] 20.1 Create migration `0048_periods_catalog.sql`
    - `public.periods` table (`id`, `label`, `start_time`, `end_time`, `day_type` CHECK IN `('weekday','saturday')`, `sort_order`), RLS (read-only to all authenticated users), idempotent seed upsert for Period I-VII + lunch break + the distinct Saturday block, matching the reference schedule from `design.md`
    - _Requirements: 13.1, 13.2, 13.3_

  - [ ]* 20.2 Write the Period_Catalog seed-data example test
    - One-time example/schema test (not PBT — static seed fact per `design.md`'s Testing Strategy): assert the seeded `periods` rows match the exact reference schedule (7 weekday periods + lunch break in the correct position + the one Saturday block), not a generated property
    - _Requirements: 13.1, 13.2, 13.3_

- [x] 21. Extend `timetable_entries` schema and add `section_timetable_status`
  - [x] 21.1 Create migration `0049_timetable_overhaul.sql`
    - Add nullable `period_id` (FK → `periods.id`), `span_periods` (default 1), `room`, `is_tutorial` (default false), `special_activity` (CHECK IN the five allowed values) columns to `timetable_entries`; relax `subject_id` to nullable; add the `timetable_entries_subject_or_activity_check` CHECK (exactly one of `{subject_id, special_activity}` non-null, unless `is_tutorial` in which case `subject_id` is required regardless); keep the old `time_slot` column unused-but-present; create `public.section_timetable_status` (`teacher_id`, `section_id`, `status` CHECK IN `('draft','confirmed')`, `updated_at`, PK `(teacher_id, section_id)`) with owner-scoped RLS
    - _Requirements: 13.4, 13.5, 15.4, 16.1, 16.2_

  - [ ]* 21.2 Write property-based test for period-catalog-restricted selection
    - **Property 28: Period selection is restricted to the catalog**
    - **Validates: Requirements 13.4**
    - For generated attempted timetable-entry `period_id` values, assert creation/edit is rejected when the value is not a valid `periods.id` and accepted when it is

  - [ ]* 21.3 Write property-based test for the subject-vs-special-activity invariant
    - **Property 32: Subject-vs-special-activity invariant**
    - **Validates: Requirements 15.4**
    - For generated timetable entries, assert exactly one of `{subject_id, special_activity}` is non-null unless `is_tutorial` is true (in which case `subject_id` is non-null regardless)

  - [ ]* 21.4 Write property-based test for the draft-default status
    - **Property 33: New Teacher-Section timetables default to draft**
    - **Validates: Requirements 16.2**
    - For generated Teacher-Section pairs with no existing `section_timetable_status` row, assert the resolved status is `'draft'`

- [x] 22. Implement multi-period lab span pure derivations
  - [x] 22.1 Add `isConsecutiveSpan` and `spannedPeriodIds` to `src/domain/services/timetableService.ts`
    - `isConsecutiveSpan(periods)`: true when the given periods, ordered by `sortOrder`, form one consecutive run with no gaps
    - `spannedPeriodIds(entry, catalog)`: the full ordered set of period ids a (possibly multi-period) entry occupies, expanding `[periodId .. periodId + spanPeriods)` by `sortOrder` within the same `dayType`
    - _Requirements: 14.1, 14.2_

  - [ ]* 22.2 Write property-based test for multi-period lab span validity
    - **Property 29: Multi-period lab span validity**
    - **Validates: Requirements 14.1, 14.2, 14.3**
    - For generated sets of periods a teacher selects for a lab entry, assert the entry is accepted as a single multi-period entry if and only if those periods form one consecutive run by `sort_order` within the same `day_type`, and the "periods must be consecutive" message is shown if and only if the entry was rejected for this reason

- [x] 23. Add entry metadata fields (room, tutorial marker, special activity) to the timetable editor
  - [x] 23.1 Update `TimetableView`'s `EditorState` and form
    - Add `room`, `isTutorial`, `specialActivity`, and the period/span selection (replacing the free-text `timeSlot` input with a Period_Catalog-driven dropdown, per Requirement 13.4/13.5) to `EditorState` in `src/presentation/views/TimetableView.tsx`; nothing is written to `timetable_entries` until `handleSave` calls `upsertEntry` (existing form-then-submit shape already satisfies "selection alone never applies")
    - Show the "periods must be consecutive" message only when `isConsecutiveSpan` rejects the teacher's selected periods, immediately before save
    - Update `src/data/access/timetableAccess.ts`'s `TimetableEntryInput`/`upsertEntry` to carry the new fields (`periodId`, `spanPeriods`, `room`, `isTutorial`, `specialActivity`)
    - _Requirements: 13.4, 13.5, 14.1, 14.3, 15.1, 15.2, 15.3_

  - [ ]* 23.2 Write property-based test for entry metadata round trip
    - **Property 30: Entry metadata round trip**
    - **Validates: Requirements 15.1, 15.2**
    - For generated timetable entries saved with a room value and/or tutorial marker, assert reading the entry back returns the same room value and tutorial-marker state

  - [ ]* 23.3 Write property-based test for special-activity apply-on-save
    - **Property 31: Special-activity selection applies only on save**
    - **Validates: Requirements 15.3**
    - For generated in-progress special-activity selections in the editor, assert the persisted entry remains unchanged until the editor's save action is invoked

- [x] 24. Implement confirm/unlock RPCs with cross-batch conflict detection
  - [x] 24.1 Create migration `0050_timetable_confirm_unlock.sql`
    - `find_teacher_schedule_conflicts(teacher_id)` (compares every pair of that teacher's entries across ALL batches/sections on the same day whose `[period_id, period_id+span_periods)` ranges by `sort_order` overlap), `confirm_timetable(section_id)` (`is_teacher()`-gated, runs the conflict scan first, transitions `section_timetable_status` to `'confirmed'` only if no conflict found, else returns the conflicting entry's day/period/batch/section/subject), `unlock_timetable(section_id)` (`is_teacher()`-gated, whole-section transition back to `'draft'`), and the `owner_all_timetable_entries` RLS policy update rejecting any add/edit/delete on `timetable_entries` for a `(teacher, section)` whose status is `'confirmed'`
    - _Requirements: 16.4, 16.5, 16.6, 18.1, 18.2, 18.3, 18.4_

  - [ ]* 24.2 Write property-based test for confirm validation and confirmed-section mutation rejection
    - **Property 34: Confirm validates before transitioning; confirmed sections reject mutation until unlocked**
    - **Validates: Requirements 16.4, 16.5**
    - For generated sets of a teacher's current timetable entries, assert "Confirm Timetable" transitions to `'confirmed'` if and only if validation (including the conflict check) passes — on failure, status remains `'draft'` and entries are unchanged; for generated confirmed sections, assert any add/edit/delete attempt is rejected until "Unlock Timetable" is performed

  - [ ]* 24.3 Write property-based test for whole-section unlock
    - **Property 35: Unlock is whole-section, never partial**
    - **Validates: Requirements 16.6**
    - For generated confirmed sections with N entries, assert "Unlock Timetable" transitions status to `'draft'` and makes all N entries editable in the same operation, never leaving a subset locked

  - [ ]* 24.4 Write property-based test for cross-batch conflict detection
    - **Property 40: Cross-batch conflict detection is comprehensive and informative**
    - **Validates: Requirements 18.1, 18.2, 18.3, 18.4**
    - For generated pairs of the same teacher's entries across any of their batches/sections/semesters on the same day whose period spans overlap (accounting for multi-period labs), assert saving/confirming the second is blocked and the block identifies the conflicting entry's day, period, batch, section, and subject

  - [x] 24.5 Wire Confirm/Unlock actions into `TimetableView`
    - Add "Confirm Timetable"/"Unlock Timetable" controls to `src/presentation/views/TimetableView.tsx`, calling `confirm_timetable`/`unlock_timetable` via a new `TimetableAccess` method, surfacing the conflict-denial reason inline (new `messages.timetable.conflict(day, period, batch, section, subject)` and `messages.timetable.periodsNotConsecutive` catalog entries) and disabling entry add/edit/delete controls while the section's status is `'confirmed'`
    - _Requirements: 16.3, 16.4, 16.5, 16.6_

- [ ] 25. Verify draft-status is never treated as confirmed for Attendance derivation (pure logic, precedes task 27's wiring)
  - [ ]* 25.1 Write property-based test for draft-status exclusion
    - **Property 36: Draft status is never treated as confirmed for Attendance derivation**
    - **Validates: Requirements 16.7**
    - For generated sections whose `(teacher, section)` status is `'draft'` (newly created or freshly unlocked), assert the Attendance period-derivation logic never sources periods from their entries as a confirmed schedule

- [x] 26. Build the unified "My Schedule" view
  - [x] 26.1 Create `src/data/access/mySchedule.ts`
    - `formatScheduleCellLabel(sem, section, subjectName)`: pure formatter for `"SEM {n}({section}) {subject name}"`
    - `truncateSubjectName(name)`: deterministic truncation at `MAX_SUBJECT_NAME_LENGTH`, unchanged names returned as-is
    - Client-side aggregation: fetch the teacher's `teacher_assignments`, fetch `timetable_entries` for every distinct `section_id` among them, merge in-browser into `MyScheduleCell[]`
    - _Requirements: 17.1, 17.2, 17.3_

  - [x] 26.2 Create `MyScheduleView`/`MySchedulePage`
    - New files `src/presentation/pages/MySchedulePage.tsx` + `src/presentation/views/MyScheduleView.tsx`: single weekly grid rendering every cell via `formatScheduleCellLabel`; does not touch `SelectedSectionContext` or any single-section-scoped page
    - Wire the route at `/my-schedule` inside `TeacherShell`, add a nav entry
    - _Requirements: 17.1, 17.4_

  - [ ]* 26.3 Write property-based test for My Schedule aggregation
    - **Property 37: My Schedule aggregates every assignment with no cross-teacher leakage**
    - **Validates: Requirements 17.1**
    - For generated teachers with `teacher_assignments` spanning multiple batches/sections, assert the aggregated entry set equals exactly the union of timetable entries derived from every one of that teacher's own assignments, and never includes another teacher's entry

  - [ ]* 26.4 Write property-based test for the schedule cell label format
    - **Property 38: Schedule cell label format**
    - **Validates: Requirements 17.2**
    - For generated semester numbers, section letters, and subject names, assert the rendered label exactly matches `"SEM {n}({section}) {subject name}"`

  - [ ]* 26.5 Write property-based test for deterministic subject-name truncation
    - **Property 39: Subject-name truncation is deterministic**
    - **Validates: Requirements 17.3**
    - For generated subject names, assert applying the truncation rule twice equals applying it once (idempotent), and the same input always produces the same output

- [x] 27. Wire Attendance to confirmed-timetable-derived periods
  - [x] 27.1 Add `resolveConfirmedPeriods` to `src/data/access/timetableAccess.ts`
    - Two-step status-first resolution: read `section_timetable_status` for `(teacherId, sectionId)` — absent/`'draft'` returns `{kind:'not-confirmed'}` regardless of whether entries exist; `'confirmed'` queries `timetable_entries` filtered to the exact section+subject+day, expands multi-period spans via `spannedPeriodIds`, and returns `{kind:'confirmed', periods}` where `periods` may legitimately be `[]`
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

  - [x] 27.2 Update `AttendancePage` to consume `resolveConfirmedPeriods`
    - Replace the hardcoded `timeSlots={DEFAULT_TIME_SLOTS}` prop in `src/presentation/pages/AttendancePage.tsx` with a call to `resolveConfirmedPeriods`, falling back to the UNCHANGED, still-present `DEFAULT_TIME_SLOTS` constant only when `kind === 'not-confirmed'`, and rendering an empty selector (never falling back) when `kind === 'confirmed'` with an empty `periods` array
    - _Requirements: 19.1, 19.2, 19.3, 19.5_

  - [ ]* 27.3 Write property-based test for confirmed-section selector exactness
    - **Property 41: Confirmed-section Attendance selector matches confirmed entries exactly**
    - **Validates: Requirements 19.1, 19.2**
    - For generated Teacher-Section pairs whose status is `'confirmed'`, and generated exact `(section, subject, day)` combinations, assert the selector's contents equal exactly the periods scheduled by that combination's confirmed entries, never `DEFAULT_TIME_SLOTS`

  - [ ]* 27.4 Write property-based test for non-confirmed fallback consistency
    - **Property 42: Non-confirmed sections consistently fall back to the generic list**
    - **Validates: Requirements 19.3, 19.4**
    - For generated Teacher-Section pairs whose status is not `'confirmed'` (draft, including never configured), assert the selector equals `DEFAULT_TIME_SLOTS`, applied the same way for every such section

  - [ ]* 27.5 Write property-based test for confirmed-but-empty selector never falling back
    - **Property 43: Confirmed-but-empty selector never falls back**
    - **Validates: Requirements 19.5**
    - For generated Teacher-Section pairs whose status IS `'confirmed'` but with zero scheduled periods for a specific `(section, subject, day)`, assert the selector is empty and never falls back to `DEFAULT_TIME_SLOTS`

- [x] 28. Phase 4 checkpoint
  - Run the full test suite (`npm run test`)
  - Confirm no regression in Phase 1/2/3's tests
  - Confirm every Phase 4 property test (20.2, 21.2-21.4, 22.2, 23.2, 23.3, 24.2-24.4, 25.1, 26.3-26.5, 27.3-27.5) passes
  - Ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP — but per this codebase's convention, they are still implemented during normal execution unless explicitly deferred.
- Every property-based test task references its exact property number and validated requirement clauses from `design.md`, and is written alongside (not strictly after) the implementation task it tests, per this repo's PBT-integrated task convention.
- PBT is deliberately NOT applied to: static schema/seed facts (task 20.2), absence-of-control guardrails (tasks 6.5, 18.3), or documentation/process-only requirements (bootstrap SQL in task 1, `parseRosterCsv`/`replaceSection` reuse in tasks 10.1/13.1, `9.5`/`11.5`/`12.3`/`13.5`/`17.4`'s non-regression constraints, covered by code review and the existing regression suite instead).
- Checkpoints ensure each phase is independently shippable, per the Introduction's explicit requirement.

## Task Dependency Graph

This graph reflects TRUE dependencies rather than artificial phase-sequential gating, per the sequencing notes above:
- `8.1` (`create_session`), `11.1` (roster remove/delete), and `15.1` (`promote_batch`) depend only on `1.1` (`is_admin()` existing) — not on the rest of Phase 1's admin-authorization/UI work — so they start as soon as `1.1` lands.
- `9.1`'s duplicate-assignment unique index depends only on `8.1` (same migration file, appended statement) and `onboarding.ts`, never on any other Phase 1 admin-authorization task.
- `10.1` (admin roster CSV wrapper) and `16.1` (stale-assignment pure derivations) and `20.1`/`22.1` (periods catalog / span pure functions) have no admin-authorization dependency at all and start immediately in wave 0.
- Within Phase 4, `21.1` (0049) must follow `20.1` (0048, referenced by FK); `24.1` (0050) must follow `21.1`; `26.1` (My Schedule) and `27.1` (Attendance integration) are both independent read-side consumers of `21.1`/`24.1` and share the same wave rather than being sequential.
- Checkpoints (`7`, `14`, `19`, `28`) each depend on every leaf task in their own phase AND the previous phase's checkpoint, preserving the "each phase is independently shippable, in order" narrative without forcing earlier unrelated groundwork tasks to wait on it.

```json
{
  "waves": [
    { "id": 0, "tasks": ["0", "1.1", "10.1", "16.1", "20.1", "22.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "5.1", "8.1", "10.2", "10.3", "10.4", "11.1", "15.1", "16.2", "16.3", "16.5", "17.1", "18.1", "20.2", "21.1", "22.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "8.2", "8.3", "8.4", "9.1", "11.2", "13.1", "13.2", "15.2", "15.3", "16.4", "17.2", "18.2", "18.3", "21.2", "21.3", "21.4", "23.1", "24.1", "25.1", "26.1"] },
    { "id": 3, "tasks": ["3.2", "4.1", "9.2", "23.2", "23.3", "24.2", "24.3", "24.4", "24.5", "26.2", "26.3", "26.4", "26.5", "27.1"] },
    { "id": 4, "tasks": ["3.3", "4.2", "27.2", "27.3", "27.4", "27.5"] },
    { "id": 5, "tasks": ["4.3", "6.1", "6.3", "6.4", "12.1", "12.3"] },
    { "id": 6, "tasks": ["6.2", "6.5", "12.2", "12.4"] },
    { "id": 7, "tasks": ["7"] },
    { "id": 8, "tasks": ["14"] },
    { "id": 9, "tasks": ["19"] },
    { "id": 10, "tasks": ["28"] }
  ]
}
```
