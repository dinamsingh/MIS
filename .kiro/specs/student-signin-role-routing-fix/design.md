# Student Sign-In Role Routing Fix — Bugfix Design

## Overview

Post-authentication routing today treats "has a Supabase session" as a proxy for "is a teacher." `RootRedirect`, `SignInRoute`, and `RequireTeacher` all branch on `actor.kind !== 'anonymous'`, and `actor.kind` itself comes from `actorFromSession()` — a client-side heuristic (`app_metadata.role === 'teacher'` or an email match against a single `VITE_TEACHER_EMAIL`) that cannot correctly classify teachers in a multi-teacher deployment, let alone tell a genuine student apart from a genuine (new) teacher. A student who verifies their email via the one-time code (OTP) flow (`sendStudentEmailOtp` / `verifyStudentEmailOtp`) therefore sails through `RequireTeacher`, lands on `/dashboard`, gets swept into `/onboarding` by `OnboardingGate` (no `teachers` row exists for them), and — because the wizard itself performs no eligibility check beyond what the database trigger enforces at save time — can complete every step up to the final save.

The fix replaces the client-side heuristic with a single authoritative, server-verified signal: a new SECURITY DEFINER RPC, `public.get_my_role()`, that inspects `public.teachers` and the existing `public.allowed_teacher_emails` allowlist (introduced by migration `0027_teacher_student_separation.sql`) and returns exactly one of `'teacher'`, `'pending-teacher'`, or `'none'`. Routing components consult this role via a new `useUserRole()` hook instead of `actor.kind !== 'anonymous'`. `'teacher'` and `'pending-teacher'` are both allowed into the teacher shell (this is what preserves the "new teacher onboarding" path and avoids repeating the infinite-redirect regression that motivated the current permissive `actor.kind === 'anonymous'` check in `RequireTeacher`); `'none'` is never allowed in, regardless of `actor.kind`.

This is a routing-only fix. No RLS policy, no existing RPC, and no `is_teacher()` behavior changes. `get_my_role()` is additive: a new, narrowly-scoped read that any authenticated user may call (unlike `allowed_teacher_emails`, which only existing teachers can read today), returning strictly less information than what an existing teacher can already see via `allowed_teacher_emails_read`.

## Glossary

- **Bug_Condition (C)**: An authenticated (non-anonymous) user whose authoritative status — determined by `get_my_role()` — is `'none'` (not a teacher and not an approved pending teacher), being routed by a decision point that currently only checks `actor.kind !== 'anonymous'`.
- **Property (P)**: For any such user, the fixed routing never renders a teacher-only surface (`/dashboard`, `/onboarding`, or any route under `TeacherShell`), never offers the onboarding wizard, and never allows a `teachers` row to be created for them via any client-driven flow.
- **Preservation**: Existing routing outcomes for anonymous visitors, existing teachers, and genuinely new (not-yet-onboarded but allowlisted) teachers must be bit-for-bit unchanged after the fix.
- **`get_my_role()`**: New SECURITY DEFINER Postgres function, callable by any `authenticated` role, returning `'teacher' | 'pending-teacher' | 'none'` based solely on `public.teachers` and `public.allowed_teacher_emails`.
- **`useUserRole()`**: New React hook wrapping `get_my_role()` with loading/caching semantics, replacing `actor.kind` as the routing signal in `RequireTeacher`, `RootRedirect`, `SignInRoute`, and `OnboardingRoute`.
- **`actorFromSession` / `Actor`**: Unchanged. Still used for `AuthContext.actor` (display name, email, UI copy) — but no longer used to *gate* teacher-only routes.
- **`allowed_teacher_emails`**: Existing allowlist table (migration `0027`) of emails approved to become teachers, enforced server-side by the `enforce_teacher_eligibility` trigger on `public.teachers`.
- **Pending teacher**: An authenticated user with no `public.teachers` row yet, but whose email is present in `public.allowed_teacher_emails` — i.e., eligible to complete onboarding.

## Bug Details

### Bug Condition

The bug manifests whenever an authenticated user who is neither a teacher nor an approved pending teacher reaches a decision point (`RequireTeacher`, `RootRedirect`, `SignInRoute`, `OnboardingRoute`) that grants access based only on `actor.kind !== 'anonymous'`.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type AuthenticatedRoutingContext
    // X.hasAuthenticatedSession: boolean — a Supabase session exists
    // X.authoritativeRole: 'teacher' | 'pending-teacher' | 'none'
    //   — what get_my_role() would return for X's identity, computed
    //     purely from public.teachers + public.allowed_teacher_emails
  OUTPUT: boolean

  RETURN X.hasAuthenticatedSession = true
     AND X.authoritativeRole = 'none'
END FUNCTION
```

### Examples

- A student verifies their email via the OTP flow. No `teachers` row exists for their `auth.uid()`, and their email is not in `allowed_teacher_emails`. Today: routed to `/dashboard` → `/onboarding`, and can complete the wizard (save is blocked server-side by the trigger, but the client shows no error until that final save, and the student never reaches the quiz-access flow). Expected: never routed to `/dashboard` or `/onboarding`; sent back toward the quiz-access flow or a safe non-teacher landing.
- A student clicks a quiz link (`/quiz/abc123`), which resolves in-page through the `email-required` → `otp-required` phases of `StudentQuizAccessView`. Today: once the OTP is verified and a session exists, `RootRedirect`/`RequireTeacher` treat that session as teacher-eligible if the student later navigates to `/sign-in` or `/`, landing on `/dashboard` and losing the quiz context. Expected: the student remains on the quiz-access flow for `/quiz/abc123` throughout, and any authenticated-but-non-teacher session is never diverted to `/dashboard`.
- A brand-new teacher, added to `allowed_teacher_emails` by an existing teacher via `add_allowed_teacher()`, signs in with Google for the first time. No `teachers` row exists yet. Expected (preserved): reaches `/onboarding` and can complete it without a redirect loop — `get_my_role()` returns `'pending-teacher'` for them, which `RequireTeacher` treats as "let through."
- An already-onboarded teacher signs in. `get_my_role()` returns `'teacher'`. Expected (preserved): lands on `/dashboard`.
- Edge case: `get_my_role()` is called with `auth.uid()` or `auth.email()` null/missing (should not normally happen for an `authenticated` role, but the function must not error). Expected: returns `'none'` (fail closed), so routing treats them as non-teacher rather than crashing or defaulting to teacher access.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- An already-onboarded teacher continues to land on `/dashboard` and navigate every route under `TeacherShell` without being redirected away.
- A genuinely new, allowlisted teacher continues to reach `/onboarding` and complete it without an infinite redirect loop.
- Teacher email/password sign-in (`signInTeacherPassword`) and teacher email-OTP sign-in (`sendEmailOtp`/`verifyEmailOtp`) are untouched — `TeacherSignInView.tsx` is not modified.
- An already-enrolled student opening a quiz link continues straight through to attempt/already-attempted, skipping the enrollment prompt exactly as today.
- A first-time student using `sendStudentEmailOtp`/`verifyStudentEmailOtp` continues through email verification, enrollment autocomplete, and attempt exactly as today.
- An anonymous visitor requesting a teacher-only route is still redirected to `/sign-in`; an anonymous visitor requesting a public route (`/sign-in`, `/quiz/:token`, `/quiz/:token/attempt`) is still served without a session.
- Postgres RLS, `is_teacher()`, and every existing RPC (`request_quiz_access`, `add_allowed_teacher`, etc.) are unchanged — this fix adds one new RPC and changes client-side routing only.
- Sign-out and session expiry continue to reduce the actor to anonymous and redirect protected navigation to `/sign-in`.

**Scope:**
All inputs where `get_my_role()` would resolve to `'teacher'` or `'pending-teacher'`, and all inputs with no authenticated session at all, are unaffected by this fix. Only the `'none'` case (a signed-in user who is not a teacher and not an approved pending teacher — every current and future student, and any other unrecognized authenticated identity) changes behavior.

## Hypothesized Root Cause

1. **Wrong signal at every teacher-gating decision point**: `RequireTeacher`, `RootRedirect`, and `SignInRoute` all use `actor.kind !== 'anonymous'` as a stand-in for "is a teacher." This is deliberate today (see the comment in `RequireTeacher.tsx`) because the alternative that was tried — gating on `actor.kind === 'teacher'` — broke onboarding for new teachers, since `actorFromSession` resolves a not-yet-onboarded teacher to `'student'` (no `app_metadata.role`, no email match). The client has no way to distinguish "new teacher, not yet onboarded" from "student" using only session claims.
2. **`actorFromSession` cannot see the authoritative source**: `isTeacherUser()` only inspects `user.app_metadata` and a single configured email — it never reads `public.teachers` or `public.allowed_teacher_emails`, the two tables that actually decide teacher eligibility server-side (via `is_teacher()` and the `enforce_teacher_eligibility` trigger, respectively). The client-side actor and the server-side authorization model have drifted apart.
3. **No pre-check before offering the wizard**: `OnboardingRoute` renders `OnboardingPage` for anyone `RequireTeacher` let through and who `useOnboardingStatus()` reports as not onboarded — it never asks "is this person even eligible to onboard?" The database trigger is the only backstop, and it only fires at final save, not at wizard-entry time.
4. **Not applicable to the current student flow**: students currently authenticate via `sendStudentEmailOtp`/`verifyStudentEmailOtp`, which establishes a session in-page inside `StudentQuizAccessView` — there is no OAuth redirect involved, so there is no redirect-target loss for students today. (`signInWithGoogle` exists on `AuthService`/`AuthContext` and is typed to accept a `'student'` intent, but it is never invoked from any student-facing component.) This item is kept only as a forward-looking note: if a student-facing Google Sign-In entry point is added later, its `redirectTo` handling and Supabase's redirect-URL allowlist would need the same care teacher Google Sign-In already receives. It does not affect this fix — `get_my_role()`/`useUserRole()` are auth-method-agnostic by design, which is why the fix holds regardless of which method a student uses now or in the future.

## Correctness Properties

Property 1: Bug Condition - Non-teacher authenticated users must never enter teacher-only surfaces

_For any_ input where the bug condition holds (`isBugCondition(X)` returns true — an authenticated user whose `get_my_role()` result is `'none'`), the fixed routing SHALL NOT render `/dashboard`, `/onboarding`, or any route under `TeacherShell` for that user, SHALL NOT offer the teacher onboarding wizard to them, and SHALL NOT create a `public.teachers` row for them via any client-driven flow. If the user arrived from a quiz link (`X.arrivedFromQuizLink = true`, `X.quizToken = T`), the fixed routing SHALL land them in the student quiz-access flow for `T`.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6**

Property 2: Preservation - Teachers, pending teachers, and anonymous visitors are routed exactly as before

_For any_ input where the bug condition does NOT hold (the user is anonymous, OR `get_my_role()` resolves to `'teacher'`, OR `get_my_role()` resolves to `'pending-teacher'`), the fixed routing SHALL produce the same destination, the same onboarding-wizard visibility, and the same `teachers`-table write behavior as the original (unfixed) routing, and SHALL continue to enforce Postgres RLS unchanged.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**

Property 3: Fail-closed on role-check failure

_For any_ input where the `get_my_role()` call fails, times out, or returns an unrecognized value, the fixed routing SHALL treat the user as non-teacher (`'none'`) for routing purposes and SHALL NOT expose `/dashboard`, `/onboarding`, or any `TeacherShell` route.

**Validates: Requirements 2.7**

## Fix Implementation

### Changes Required

#### 1. New migration: `src/data/migrations/0042_get_my_role_rpc.sql`

Adds one new SECURITY DEFINER RPC. Does not touch any existing function, policy, or trigger.

```sql
-- ============================================================================
-- Migration: 0042_get_my_role_rpc
-- Authoritative, client-callable role check for post-authentication routing.
--
-- Problem
-- -------
-- Client-side routing (RootRedirect, SignInRoute, RequireTeacher,
-- OnboardingRoute) currently gates on actor.kind !== 'anonymous', because the
-- client has no reliable way to distinguish "student" from "new teacher not
-- yet onboarded" — both look identical from session claims alone
-- (actorFromSession resolves either case to 'student'). The authoritative
-- answer already exists server-side: public.teachers (is this uid a teacher?)
-- and public.allowed_teacher_emails (is this email approved to become one?).
-- But allowed_teacher_emails is only readable by EXISTING teachers
-- (allowed_teacher_emails_read: using (is_teacher())), so a not-yet-onboarded
-- pending teacher — and every student — cannot consult it directly.
--
-- Fix
-- ---
-- get_my_role() — callable by any authenticated user, SECURITY DEFINER so it
-- can read both tables regardless of the caller's own RLS, returns exactly
-- one of:
--   'teacher'         — a public.teachers row exists for auth.uid()
--   'pending-teacher' — no teachers row, but lower(auth.email()) is present
--                        in public.allowed_teacher_emails
--   'none'            — neither condition holds (every current and future
--                        student, regardless of auth method, resolves here)
-- Fails closed to 'none' when auth.uid() or auth.email() is null.
--
-- Scope: purely additive. No existing function, policy, or trigger is
-- modified. Does not grant write access to allowed_teacher_emails or
-- teachers — this is a read-only status check.
--
-- Idempotent: CREATE OR REPLACE, safe to re-apply.
-- ============================================================================

create or replace function public.get_my_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_uid   uuid := auth.uid();
    v_email text := lower(coalesce(auth.email(), ''));
begin
    if v_uid is null or v_email = '' then
        return 'none';
    end if;

    if exists (select 1 from public.teachers t where t.id = v_uid) then
        return 'teacher';
    end if;

    if exists (
        select 1 from public.allowed_teacher_emails a where lower(a.email) = v_email
    ) then
        return 'pending-teacher';
    end if;

    return 'none';
end;
$$;

comment on function public.get_my_role() is
  'Authoritative role check for client-side routing only. Returns teacher (has a public.teachers row), pending-teacher (no row yet, but email is on public.allowed_teacher_emails), or none (every other authenticated identity, including all students). Fails closed to none on missing uid/email. Does not affect RLS or is_teacher(); RLS remains the authorization boundary.';

grant execute on function public.get_my_role() to authenticated;

notify pgrst, 'reload schema';
```

#### 2. New hook: `src/presentation/auth/useUserRole.ts`

```typescript
/**
 * Authoritative teacher-role check for routing (bugfix: student-signin-role-routing-fix).
 *
 * Wraps the `get_my_role()` RPC, which is the single source of truth for
 * whether the signed-in identity may see teacher-only surfaces. Unlike
 * `actor.kind` (derived client-side from session claims in `actorFromSession`),
 * this consults `public.teachers` and `public.allowed_teacher_emails`
 * server-side, so it correctly distinguishes a student from a brand-new,
 * not-yet-onboarded (but approved) teacher.
 *
 * Re-fetches whenever the actor identity changes (sign-in, sign-out, a
 * different user restoring a session) by keying its effect on
 * `actor.kind === 'anonymous' ? null : actor.userId`. While anonymous, the
 * role is immediately `'none'` with no RPC call. On RPC failure the role
 * resolves to `'none'` (fail closed — Property 3).
 */

import { useEffect, useState } from 'react';
import { supabase } from '@data/supabase';
import { useAuth } from './AuthContext';

export type UserRole = 'teacher' | 'pending-teacher' | 'none';

export interface UserRoleStatus {
  /** null while the first check for the current identity is in flight. */
  readonly role: UserRole | null;
  readonly loading: boolean;
}

const VALID_ROLES: ReadonlySet<string> = new Set(['teacher', 'pending-teacher', 'none']);

export function useUserRole(): UserRoleStatus {
  const { actor, isLoading: authLoading } = useAuth();
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const identityKey = actor.kind === 'anonymous' ? null : actor.userId;

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (identityKey === null) {
      // Anonymous — no RPC call needed, and definitely not a teacher.
      setRole('none');
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    supabase
      .rpc('get_my_role')
      .then(({ data, error }) => {
        if (!active) return;
        if (error || typeof data !== 'string' || !VALID_ROLES.has(data)) {
          // Fail closed: treat any error or unrecognized value as non-teacher.
          setRole('none');
        } else {
          setRole(data as UserRole);
        }
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setRole('none');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey, authLoading]);

  return { role, loading: authLoading || loading };
}
```

`src/presentation/auth/index.ts` gains one export line:

```typescript
export { useUserRole, type UserRole, type UserRoleStatus } from './useUserRole';
```

#### 3. `src/presentation/auth/RequireTeacher.tsx` — gate on role, not `actor.kind`

```typescript
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useUserRole } from '@presentation/auth/useUserRole';

interface RequireTeacherProps {
  /** Where to send a non-teacher actor. Defaults to the sign-in route. */
  redirectTo?: string;
  /** Optional element rendered while the role check is in flight. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Render `children` only for a user whose authoritative role (via
 * `get_my_role()`) is `'teacher'` or `'pending-teacher'`; otherwise redirect.
 *
 * `'pending-teacher'` is let through deliberately: this is what keeps a
 * genuinely new, not-yet-onboarded teacher able to reach `/onboarding`
 * without an infinite redirect loop — the same case that made the previous
 * `actor.kind === 'teacher'` attempt fail, except now the check is
 * authoritative (public.teachers + public.allowed_teacher_emails) instead of
 * a session-claim heuristic, so a student can never be misclassified into
 * this branch. Postgres RLS remains the authoritative security boundary —
 * this guard is a UX convenience, not a security control.
 */
export default function RequireTeacher({
  redirectTo = '/sign-in',
  fallback = null,
  children,
}: RequireTeacherProps) {
  const { role, loading } = useUserRole();

  if (loading) {
    return <>{fallback}</>;
  }

  if (role !== 'teacher' && role !== 'pending-teacher') {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
```

#### 4. `src/presentation/App.tsx` — `RootRedirect`, `SignInRoute`, `OnboardingRoute`

```typescript
import { useUserRole } from '@presentation/auth/useUserRole';
```

`RootRedirect`:

```typescript
/**
 * Root redirect: a teacher or pending-teacher → /dashboard, everyone else
 * (anonymous, or an authenticated non-teacher such as a student) → /sign-in.
 * Non-teacher authenticated users are signed out first so they land on
 * /sign-in with a clean session rather than looping back through
 * RootRedirect on every subsequent navigation.
 */
function RootRedirect() {
  const { actor, isLoading, signOut } = useAuth();
  const { role, loading: roleLoading } = useUserRole();

  if (isLoading || roleLoading) {
    return null;
  }

  if (role === 'teacher' || role === 'pending-teacher') {
    return <Navigate to="/dashboard" replace />;
  }

  if (actor.kind !== 'anonymous') {
    // Authenticated but not a teacher/pending-teacher (a student, or any
    // other non-teacher identity) — never send them into the teacher app.
    void signOut();
  }
  return <Navigate to="/sign-in" replace />;
}
```

`SignInRoute`:

```typescript
/**
 * Sign-in route — redirects a teacher/pending-teacher to /dashboard; renders
 * the teacher sign-in view otherwise. An authenticated non-teacher (e.g. a
 * student who reached /sign-in directly, not via a quiz link) is signed out
 * so the view renders the sign-in form instead of redirect-looping.
 */
function SignInRoute() {
  const { actor, isLoading, signOut } = useAuth();
  const { role, loading: roleLoading } = useUserRole();

  if (isLoading || roleLoading) {
    return null;
  }

  if (role === 'teacher' || role === 'pending-teacher') {
    return <Navigate to="/dashboard" replace />;
  }

  if (actor.kind !== 'anonymous') {
    void signOut();
  }

  return <TeacherSignInView onSignedIn={() => {
    window.location.replace('/dashboard');
  }} />;
}
```

`OnboardingRoute`:

```typescript
/**
 * Full-screen onboarding route. Only a 'pending-teacher' (no teachers row
 * yet) or a 'teacher' who has a row but hasn't finished the wizard sees it;
 * an already-onboarded teacher is sent to /dashboard, and a non-teacher
 * ('none') is sent to /sign-in — RequireTeacher normally intercepts this
 * case first, but this route is defense-in-depth against direct navigation.
 */
function OnboardingRoute() {
  const { role, loading: roleLoading } = useUserRole();
  const { loading: onboardingLoading, onboarded } = useOnboardingStatus();

  if (roleLoading || (role !== 'none' && onboardingLoading)) {
    return <PageLoader />;
  }
  if (role !== 'teacher' && role !== 'pending-teacher') {
    return <Navigate to="/sign-in" replace />;
  }
  if (onboarded) {
    return <Navigate to="/dashboard" replace />;
  }
  return <OnboardingPage />;
}
```

`TeacherShell` and `OnboardingGate` are unchanged — they already sit behind `RequireTeacher`, which now carries the fix.

#### 5. Student landing when `role === 'none'`

No new route or component is introduced for this. `RootRedirect`/`SignInRoute` sending a `'none'` user to `/sign-in` after signing them out is sufficient to satisfy Requirement 2.1 (never routed to a teacher-only surface) without inventing a student dashboard or new UI that is explicitly out of scope. `StudentQuizAccessView`/`StudentQuizAccessPage` are unchanged — a student's real destination is always `/quiz/:token`, reached directly from the link they clicked, not by routing them there from `/sign-in`. Since students authenticate via the in-page email OTP flow (no OAuth redirect involved), there is no redirect-target loss to fix for the student case; `get_my_role()`/`useUserRole()` being auth-method-agnostic is what makes the fix hold regardless of which method a student uses now or in the future.

#### 6. Operational step — not applicable to the current student flow

Not applicable today: students authenticate via `sendStudentEmailOtp`/`verifyStudentEmailOtp`, which never redirects through Supabase's OAuth flow, so there is no redirect-URL allowlist gap for the student case to close. (Supabase Dashboard → Authentication → URL Configuration → Redirect URLs would only become relevant if a student-facing Google Sign-In entry point is added in the future.) No operational action is required for this fix.

### Out of Scope

- No student login/password system, no student "my quizzes" dashboard.
- No change to `TeacherSignInView.tsx` or the teacher email-OTP/password flow.
- No change to the student's email OTP sign-in method (`sendStudentEmailOtp`/`verifyStudentEmailOtp`).
- No change to any RLS policy, `is_teacher()`, or any existing RPC. `get_my_role()` is additive only.
- No change to `actorFromSession`/`isTeacherUser` — `Actor`/`actor.kind` remains as-is for display purposes (name, email); it is simply no longer used as the routing gate.

## Testing Strategy

### Validation Approach

First, write tests against the unfixed code that reproduce the bug and confirm the root-cause hypothesis (a student reaches `/onboarding`). Then implement the fix and verify both that the bug condition now resolves correctly (Property 1) and that teacher/pending-teacher/anonymous routing is bit-for-bit preserved (Property 2, Property 3).

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples demonstrating the bug BEFORE implementing the fix, confirming the "routes gate on `actor.kind !== 'anonymous'` instead of an authoritative role" hypothesis.

**Test Plan**: Render `RequireTeacher`, `RootRedirect`, and `OnboardingRoute` with a mocked `AuthContext` whose actor is `{ kind: 'student', ... }` (simulating a student who has completed the email OTP verification via `verifyStudentEmailOtp`, with no `teachers` row and no allowlist entry) and assert on the rendered output / navigation target, on the UNFIXED code.

**Test Cases**:
1. **RequireTeacher lets a student through**: mount `<RequireTeacher><div>secret</div></RequireTeacher>` with `actor.kind = 'student'` → asserts `secret` renders (will fail-as-expected on unfixed code, i.e. it *does* render, demonstrating the bug).
2. **RootRedirect sends a student to /dashboard**: mount with `actor.kind = 'student'` → asserts navigation target is `/dashboard` (demonstrates the bug — expected fixed behavior is `/sign-in`).
3. **OnboardingRoute renders the wizard for a student**: mount with `actor.kind = 'student'`, `useOnboardingStatus` stubbed to `{ loading: false, onboarded: false }` → asserts `OnboardingPage` renders (demonstrates the bug).
4. **Edge case — teacher-shaped student (no app_metadata, no email match) still passes today**: same as case 1 but explicit on the exact `Actor` shape `actorFromSession` currently produces for an unrecognized email-OTP-authenticated identity, to pin down that the vulnerability is not specific to one particular fake actor shape.

**Expected Counterexamples**:
- All three components render/redirect as if the student were allowed into the teacher app, because none of them consult anything beyond `actor.kind`.
- Confirms root cause #1 and #2 (wrong signal, no authoritative check) directly. Root cause #3 (no pre-check before the wizard) is validated by test case 3 above. Root cause #4 is not applicable to the current student flow (students authenticate via email OTP, not OAuth) and requires no test.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior (Property 1).

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  destination := routeAfterAuth'(X)
  ASSERT destination NOT IN { '/dashboard', '/onboarding' } ∪ TeacherShellRoutes
  ASSERT wizardOfferedTo'(X) = false
  ASSERT teacherRowCreatedFor'(X) = false
  IF X.arrivedFromQuizLink THEN
    ASSERT destination = StudentQuizAccessFlowFor(X.quizToken)
END FOR
```

Concretely: mock `supabase.rpc('get_my_role')` to resolve `'none'`, render each fixed component, assert `RequireTeacher` redirects to `/sign-in`, `RootRedirect`/`SignInRoute` redirect to `/sign-in` (and call `signOut`), and `OnboardingRoute` redirects to `/sign-in` rather than rendering `OnboardingPage`.

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function (Property 2).

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT routeAfterAuth(X)  = routeAfterAuth'(X)
     AND wizardOfferedTo(X) = wizardOfferedTo'(X)
     AND teacherRowFlow(X)  = teacherRowFlow'(X)
END FOR
```

**Testing Approach**: Property-based testing is used to generate combinations of `{ actor.kind, get_my_role() result, onboarded status, current route }` and assert the fixed routing decision matches a table of expected outcomes derived by observing the unfixed code for the teacher/anonymous cases first.

**Test Plan**: Before writing the fix, run the existing (pre-fix) behavior for teacher and anonymous actors and record the exact navigation outcomes for each of `RequireTeacher`, `RootRedirect`, `SignInRoute`, `OnboardingRoute`. Encode those as the expected values in the property-based tests, then verify the fixed components reproduce them for every generated `role ∈ {'teacher', 'pending-teacher'}` and `actor.kind = 'anonymous'` case.

**Test Cases**:
1. **Teacher preservation**: `role = 'teacher'`, `onboarded = true` → `/dashboard` reachable, `/onboarding` redirects to `/dashboard`, `RequireTeacher` renders children. Same for `onboarded = false` → `/onboarding` renders the wizard, `/dashboard` (via `OnboardingGate`) redirects to `/onboarding`.
2. **Pending-teacher preservation**: `role = 'pending-teacher'`, `onboarded = false` → `RequireTeacher` renders children, `OnboardingRoute` renders the wizard, no redirect loop across repeated renders (regression guard for the original infinite-loop bug).
3. **Anonymous preservation**: `actor.kind = 'anonymous'` → every guarded route redirects to `/sign-in`; public routes (`/sign-in`, `/quiz/:token`, `/quiz/:token/attempt`) render without a session.
4. **`get_my_role()` RPC failure preservation/fail-closed**: `supabase.rpc('get_my_role')` rejects or times out → `useUserRole()` resolves `role = 'none'`, `loading = false`; routing behaves as the `'none'` case (Property 3), never as `'teacher'`.

### Unit Tests

- `useUserRole()`: resolves `'none'` immediately for an anonymous actor without calling the RPC; calls the RPC exactly once per identity change; re-fetches when `actor.userId` changes (sign-out then sign-in as a different user); fails closed to `'none'` on RPC error or an unrecognized string value.
- `RequireTeacher`: renders `fallback` while `useUserRole().loading` is true; renders `children` for `'teacher'`/`'pending-teacher'`; redirects for `'none'`.
- `RootRedirect` / `SignInRoute`: redirect target and `signOut` invocation for each of `{'teacher', 'pending-teacher', 'none'}` × `{anonymous, authenticated}`.
- `OnboardingRoute`: renders `PageLoader` while loading; redirects `'none'` to `/sign-in`; redirects an onboarded `'teacher'` to `/dashboard`; renders `OnboardingPage` for `'pending-teacher'` or a not-yet-onboarded `'teacher'`.
- `get_my_role()` SQL function (via a migration test / direct RPC call in an integration test against a test database): returns `'teacher'` for a seeded `teachers` row; `'pending-teacher'` for a seeded `allowed_teacher_emails` row with no `teachers` row; `'none'` otherwise; `'none'` when called with no session (should not be reachable via the `authenticated` role grant, but verified defensively).

### Property-Based Tests

- Generate random `(hasTeachersRow: boolean, isOnAllowlist: boolean, hasSession: boolean)` triples and assert `get_my_role()`'s expected return value matches the specification exactly (teacher takes precedence over pending-teacher; no session ⇒ `'none'`).
- Generate random sequences of identity changes (sign-in as teacher → sign-out → sign-in as student → sign-in as pending-teacher) and assert `useUserRole()` always reflects the RPC result for the *current* identity, never a stale role from a previous identity (guards against a race where an in-flight RPC for a previous user resolves after the identity has already changed — the `active` flag in the effect cleanup).
- Generate random combinations of `{role, onboarded, requestedPath}` across all four routing components and assert the fixed decision matches the property-derived expectation table (teacher-only surfaces reachable iff `role ∈ {'teacher','pending-teacher'}`).

### Integration Tests

- Full flow: seed a student identity that has completed email OTP verification (no `teachers` row, no allowlist entry) against a mocked Supabase client, navigate through `/sign-in` → assert final route is `/sign-in` (not `/dashboard`, not `/onboarding`), and that no `teachers` row was ever written.
- Full flow: seed a quiz-link student identity, navigate `/quiz/abc123` → complete the in-page email OTP verification (`sendStudentEmailOtp`/`verifyStudentEmailOtp`) → assert the resolved destination is the student quiz-access flow for `abc123`, not `/dashboard`.
- Full flow: seed a pending-teacher identity (allowlist entry, no `teachers` row), navigate `/sign-in` → assert `/onboarding` renders the wizard, complete it, assert the `teachers` row is created and subsequent navigation lands on `/dashboard` with no redirect loop.
- Regression flow: seed an already-onboarded teacher, navigate across every route listed in Requirement 3.4 (`/dashboard`, `/roster`, `/attendance`, `/timetable`, `/syllabus`, `/marks`, `/quizzes`, `/assignments`, `/material`, `/analytics`, `/leaderboard`, `/reports`, `/profile`, `/ai/*`) and assert none of them redirect away.
