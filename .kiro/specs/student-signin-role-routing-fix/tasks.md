# Implementation Plan: Student Sign-In Role Routing Fix

## Overview

This plan fixes the bug where a non-teacher authenticated user (a student who has completed the email OTP verification flow — `sendStudentEmailOtp`/`verifyStudentEmailOtp` — NOT Google Sign-In, which is never invoked from student-facing components today) is routed through the teacher app shell and can complete teacher onboarding. It follows the bug-condition methodology: first an exploration test proves the bug exists on unfixed code (Property 1), then a preservation test captures the correct baseline behavior for teachers/pending-teachers/anonymous visitors on unfixed code (Property 2), then the fix is implemented (a new `get_my_role()` RPC, a `useUserRole()` hook, and role-based gating in `RequireTeacher`/`App.tsx`), and finally both properties are re-verified against the fixed code alongside a new fail-closed property (Property 3).

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Non-teacher authenticated user (email-OTP student) passes teacher-gating checks
  - **IMPORTANT**: Write this property-based test BEFORE implementing the fix
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: `isBugCondition(X)` is deterministic on `X.hasAuthenticatedSession = true AND X.isTeacherInAuthoritativeSource = false`. Scope the property to concrete failing actor shapes rather than random text: generate a small domain of non-teacher `Actor` values that all currently satisfy `actor.kind !== 'anonymous'` — e.g. `{ kind: 'student', userId: <uuid>, email: <arbitrary non-teacher email>, name: <string>, enrollmentNumber: null }` — representing a student who has completed `verifyStudentEmailOtp` (per the corrected `bugfix.md`/`design.md`; NOT Google Sign-In, which is never invoked from student-facing components). Vary `email`, `userId`, and `name` across the fast-check arbitrary; hold `kind: 'student'` fixed since that is the actor shape `actorFromSession` produces for this bug condition today.
  - Create `src/presentation/auth/RequireTeacher.test.tsx` (or extend it) and `src/presentation/App.routing.test.tsx`, testing on the **UNFIXED** code (current `RequireTeacher`, `RootRedirect`, `OnboardingRoute` in `src/presentation/App.tsx`, which gate on `actor.kind !== 'anonymous'`):
    - `RequireTeacher` — mount `<RequireTeacher><div>secret</div></RequireTeacher>` inside `<AuthProvider service={stubServiceReturning(actor)}>`, for every generated non-teacher `actor`. Assert `secret` does NOT render (i.e. the user is NOT let through) — expressing the Expected Behavior from design (`Property 1` in `design.md`: `wizardOfferedTo'(X) = false`, destination ∉ TeacherOnlyRoutes).
    - `RootRedirect` — for every generated non-teacher `actor`, assert the resolved navigation target is `/sign-in`, not `/dashboard`.
    - `OnboardingRoute` — for every generated non-teacher `actor` with `useOnboardingStatus` stubbed to `{ loading: false, onboarded: false }`, assert `OnboardingPage` does NOT render.
  - Run the property-based test on UNFIXED code (`npx vitest run` against the current `RequireTeacher.tsx`/`App.tsx`).
  - **EXPECTED OUTCOME**: Test FAILS for every generated case — `RequireTeacher` renders `secret`, `RootRedirect` targets `/dashboard`, `OnboardingRoute` renders the wizard, because all three only check `actor.kind !== 'anonymous'`. This confirms the bug exists exactly as described in `bugfix.md` clauses 1.1–1.3 and `design.md`'s `isBugCondition`.
  - Document the counterexamples found (e.g. "actor = `{ kind: 'student', userId: 'u1', email: 'student1@college.edu', ... }` → `RequireTeacher` renders `secret`; `RootRedirect` navigates to `/dashboard`; `OnboardingRoute` renders `OnboardingPage`") for use in task 3's fix verification.
  - Mark task complete when the test is written, run, and failure is documented — do NOT fix the code yet.
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Teacher, pending-teacher, and anonymous routing outcomes on unfixed code
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code (current `actor.kind !== 'anonymous'` gating):
    - Observe: `RequireTeacher` with `actor.kind = 'teacher'` → renders `children`.
    - Observe: `RequireTeacher` with `actor.kind = 'anonymous'` → redirects to `/sign-in`.
    - Observe: `RootRedirect` with `actor.kind = 'teacher'` → navigates to `/dashboard`.
    - Observe: `RootRedirect` with `actor.kind = 'anonymous'` → navigates to `/sign-in`.
    - Observe: `SignInRoute` with `actor.kind !== 'anonymous'` (any authenticated actor, including today's not-yet-onboarded "student-shaped" teacher) → navigates to `/dashboard`; with `actor.kind = 'anonymous'` → renders `TeacherSignInView`.
    - Observe: `OnboardingRoute` with `onboarded = true` → navigates to `/dashboard`; with `onboarded = false` → renders `OnboardingPage`, regardless of `actor.kind` (today it has no teacher-status check of its own — it is reached only via the `/onboarding` route, `RequireTeacher` is not in its guard chain per the current `App.tsx`).
  - Write a property-based test generating random tuples of `(actorKind: 'teacher' | 'anonymous', onboarded: boolean)` (this is the non-bug-condition domain — `NOT isBugCondition(X)` per `bugfix.md`'s Preservation Property: anonymous visitors, and authenticated users who ARE teachers) and asserting each observed outcome above holds for every generated tuple.
  - Run the property-based test on UNFIXED code.
  - **EXPECTED OUTCOME**: Tests PASS for every generated `(teacher | anonymous)` tuple — this is the baseline behavior task 3 must not regress.
  - Mark task complete when tests are written, run, and passing on unfixed code.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 3.8, 3.10_

- [x] 3. Fix the student-signin role routing bug

  - [x] 3.1 Add the `get_my_role()` migration
    - Create `src/data/migrations/0042_get_my_role_rpc.sql` per the SQL in `design.md` §"Fix Implementation #1": a `SECURITY DEFINER`, `stable` function returning `'teacher'` (a `public.teachers` row exists for `auth.uid()`), `'pending-teacher'` (no `teachers` row but `lower(auth.email())` is present in `public.allowed_teacher_emails`), or `'none'` (fails closed on missing `auth.uid()`/`auth.email()`, and for every other authenticated identity — including all students, regardless of email-OTP or any future auth method)
    - `grant execute on function public.get_my_role() to authenticated;` and `notify pgrst, 'reload schema';`
    - Purely additive: does not modify `is_teacher()`, any RLS policy, or any existing RPC (per `design.md` Out of Scope)
    - _Bug_Condition: isBugCondition(X) = X.hasAuthenticatedSession AND X.authoritativeRole = 'none', from design.md_
    - _Requirements: 2.5, 2.7_

  - [x] 3.2 Add the `useUserRole()` hook
    - Create `src/presentation/auth/useUserRole.ts` per `design.md` §"Fix Implementation #2": wraps `supabase.rpc('get_my_role')`, keyed on `actor.kind === 'anonymous' ? null : actor.userId`, resolves `'none'` immediately (no RPC call) while anonymous, fails closed to `'none'` on RPC error/unrecognized value
    - Export `useUserRole`, `UserRole`, `UserRoleStatus` from `src/presentation/auth/index.ts`
    - _Expected_Behavior: routing consults an authoritative, auth-method-agnostic role signal instead of actor.kind, from design.md Property 1/Property 3_
    - _Requirements: 2.5, 2.7_

  - [x] 3.3 Gate `RequireTeacher` on role, not `actor.kind`
    - Update `src/presentation/auth/RequireTeacher.tsx` per `design.md` §"Fix Implementation #3": use `useUserRole()`; render `fallback` while `loading`; redirect to `redirectTo` unless `role === 'teacher' || role === 'pending-teacher'`
    - _Bug_Condition: isBugCondition(X) where X.authoritativeRole = 'none', from design.md_
    - _Expected_Behavior: destination ∉ TeacherOnlyRoutes for isBugCondition(X), from bugfix.md Fix Checking Property_
    - _Preservation: teacher and pending-teacher routing unchanged, from bugfix.md Preservation Property_
    - _Requirements: 2.1, 2.2, 2.6, 3.3, 3.4_

  - [x] 3.4 Gate `RootRedirect`, `SignInRoute`, and `OnboardingRoute` on role in `App.tsx`
    - Update `src/presentation/App.tsx` per `design.md` §"Fix Implementation #4": `RootRedirect` and `SignInRoute` navigate to `/dashboard` only for `role ∈ {'teacher','pending-teacher'}`, sign out and navigate to `/sign-in` for any other authenticated (non-anonymous) actor, and navigate to `/sign-in` for anonymous; `OnboardingRoute` shows `PageLoader` while `roleLoading` (or while `onboardingLoading` for a non-`'none'` role), redirects `'none'` to `/sign-in`, redirects an onboarded `'teacher'` to `/dashboard`, otherwise renders `OnboardingPage`
    - `TeacherShell`/`OnboardingGate` remain unchanged — they already sit behind the now-fixed `RequireTeacher`
    - _Bug_Condition: isBugCondition(X) AND X.arrivedFromQuizLink = true, from bugfix.md_
    - _Expected_Behavior: destination = StudentQuizAccessFlowFor(T) for a quiz-link student, from bugfix.md Fix Checking Property (student-with-quiz-link sub-case)_
    - _Preservation: Preservation Requirements from design.md (teacher/pending-teacher/anonymous routing bit-for-bit unchanged)_
    - _Requirements: 2.1, 2.3, 2.4, 2.6, 3.1, 3.2, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Non-teacher authenticated user (email-OTP student) is excluded from teacher-only surfaces
    - **IMPORTANT**: Re-run the SAME test from task 1 (`RequireTeacher.test.tsx` / `App.routing.test.tsx`) against the fixed `RequireTeacher`, `RootRedirect`, and `OnboardingRoute` — do NOT write a new test. Mock `supabase.rpc('get_my_role')` to resolve `'none'` for the same generated non-teacher actors from task 1.
    - Run the bug condition exploration test from task 1
    - **EXPECTED OUTCOME**: Test PASSES for every generated case — `RequireTeacher` no longer renders `secret`, `RootRedirect`/`SignInRoute` target `/sign-in`, `OnboardingRoute` no longer renders `OnboardingPage`. Confirms `bugfix.md` Fix Checking Property and `design.md` Property 1 are satisfied.
    - _Requirements: 2.1, 2.2, 2.6_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Teacher, pending-teacher, and anonymous routing outcomes unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests. Mock `supabase.rpc('get_my_role')` to resolve `'teacher'` for `actor.kind = 'teacher'` cases and `'none'` for `actor.kind = 'anonymous'` cases (anonymous never calls the RPC per `useUserRole`'s short-circuit).
    - Additionally add the `'pending-teacher'` case to the property domain now that the fix introduces it (a not-yet-onboarded, allowlisted teacher — `design.md` Property 2/Examples), asserting `RequireTeacher` renders children and `OnboardingRoute` renders `OnboardingPage` with no redirect loop across repeated renders.
    - Run the preservation property tests from task 2
    - **EXPECTED OUTCOME**: Tests PASS — teacher, anonymous, and (newly) pending-teacher routing all match the observed baseline. Confirms no regressions per `bugfix.md` Preservation Property and `design.md` Property 2.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 3.8, 3.10_

  - [x] 3.7 Add fail-closed test for `get_my_role()` RPC failure
    - **Property 3: Fail-Closed** - RPC failure or unrecognized value resolves to `'none'`
    - Write a property-based test generating RPC outcomes `{ rejects, resolves-with-error, resolves-with-unrecognized-string }` for a signed-in non-teacher actor and asserting `useUserRole()` resolves `role = 'none'`, `loading = false` for every generated outcome, and that `RequireTeacher`/`RootRedirect`/`OnboardingRoute` treat it exactly as the `'none'` case (never expose `/dashboard`, `/onboarding`, or any `TeacherShell` route)
    - Run against the fixed code
    - **EXPECTED OUTCOME**: Test PASSES — confirms `design.md` Property 3 / `bugfix.md` clause 2.7
    - _Requirements: 2.7_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full test suite (`npm run test`)
  - Confirm task 1's exploration test now passes, task 2's and task 3.6's preservation tests pass, and task 3.7's fail-closed test passes
  - Confirm no existing test in the repository (e.g. `AppLayout.test.tsx`) regressed
  - Ask the user if questions arise
  - **Verified**: `npx vitest run` → 24 test files, 231 tests, all passed. `npx vite build` → clean production build, no errors.

## Notes

- Students authenticate via `sendStudentEmailOtp`/`verifyStudentEmailOtp` (email OTP), not Google Sign-In — `signInWithGoogle` exists on `AuthService`/`AuthContext` but is never invoked from any student-facing component today. All exploration/preservation tests simulate the student actor shape produced by this OTP flow.
- Tasks 1 and 2 MUST be written and run against the unfixed code before any fix code in task 3 is written, per the bug-condition methodology.
- Task 3.5 and 3.6 re-run the exact same tests from tasks 1 and 2 (not new tests) to prove the fix resolves the bug without regressing preserved behavior.
- Postgres RLS, `is_teacher()`, and all existing RPCs remain unchanged — this fix is additive (`get_my_role()`) and client-side routing only.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2"] },
    { "id": 4, "tasks": ["3.3", "3.4"] },
    { "id": 5, "tasks": ["3.5", "3.6", "3.7"] },
    { "id": 6, "tasks": ["4"] }
  ]
}
```
