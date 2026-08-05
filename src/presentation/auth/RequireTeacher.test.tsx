/**
 * Bug condition exploration test for `RequireTeacher` (bugfix:
 * student-signin-role-routing-fix, task 1).
 *
 * Property 1: Bug Condition — a non-teacher authenticated user (an email-OTP
 * student who has completed `verifyStudentEmailOtp`) must never pass the
 * teacher-gating check (bugfix.md 2.1, 2.2, 2.6; design.md Property 1). Today
 * `RequireTeacher` only checks `actor.kind !== 'anonymous'`, so it lets such a
 * user through (bugfix.md clauses 1.1–1.3, 1.5).
 *
 * This test asserts the EXPECTED (fixed) behavior — that `secret` does NOT
 * render for a non-teacher actor — and is run against the UNFIXED
 * `RequireTeacher.tsx`. It is EXPECTED TO FAIL: the failure (secret DOES
 * render) is the proof that the bug exists. Do not "fix" this test when it
 * fails; that is the point of the exploration step in the bug-condition
 * methodology. Task 3.5 re-runs this exact test against the fixed code, where
 * it is expected to pass.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 2.5**
 */

import { describe, it, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fc from 'fast-check';
import type { AuthService } from '@data/access/authService';
import type { Actor } from '@domain/shared/types';

/**
 * `RequireTeacher` (now fixed, task 3.3) calls `useUserRole()`, which calls
 * `supabase.rpc('get_my_role')` — mock that RPC so these tests exercise the
 * routing logic without a real network call. `get_my_role()` now returns an
 * array of role tags (task 3.2/3.3), so `currentRoles` holds that array and
 * is set per test so the exploration test (non-teacher → `[]`) and the
 * preservation test (teacher → `['teacher']`) each get the authoritative
 * role set that corresponds to their generated `actor`.
 */
let currentRoles: string[] = [];

/**
 * Fail-closed RPC outcome control (task 3.7, Property 3). `'valid'` keeps the
 * existing exploration/preservation behavior (resolve with `currentRoles`);
 * the other three simulate the failure modes `useUserRole()` must fail
 * closed on: a rejected promise (network error), a resolved `{ error }`
 * response, and a resolved response with an array containing a tag outside
 * `VALID_TAGS` (exercising `useUserRole.ts`'s `!data.every((r) =>
 * VALID_TAGS.has(r))` check).
 */
type RpcOutcome = 'valid' | 'rejects' | 'resolves-error' | 'resolves-unrecognized';
let currentRpcOutcome: RpcOutcome = 'valid';

vi.mock('@data/supabase', () => ({
  supabase: {
    rpc: (fn: string) => {
      if (fn !== 'get_my_role') return Promise.resolve({ data: null, error: null });
      switch (currentRpcOutcome) {
        case 'rejects':
          return Promise.reject(new Error('network error'));
        case 'resolves-error':
          return Promise.resolve({ data: null, error: { message: 'some db error' } });
        case 'resolves-unrecognized':
          return Promise.resolve({ data: ['some-unexpected-value'], error: null });
        case 'valid':
        default:
          return Promise.resolve({ data: currentRoles, error: null });
      }
    },
  },
}));

// Imported after the mock above so RequireTeacher/useUserRole pick it up.
import RequireTeacher from './RequireTeacher';
import { AuthProvider } from './AuthContext';

/**
 * A stub AuthService that immediately resolves to the given actor and never
 * emits further session changes — enough for `AuthProvider` to settle
 * `isLoading = false` with that actor, matching the pattern used in
 * `AppLayout.test.tsx`.
 */
function stubServiceReturning(actor: Actor): AuthService {
  return {
    getCurrentActor: () => Promise.resolve(actor),
    subscribe: () => () => {},
    signInTeacherPassword: () => Promise.reject(new Error('not used in this test')),
    sendEmailOtp: () => Promise.reject(new Error('not used in this test')),
    verifyEmailOtp: () => Promise.reject(new Error('not used in this test')),
    sendStudentEmailOtp: () => Promise.reject(new Error('not used in this test')),
    verifyStudentEmailOtp: () => Promise.reject(new Error('not used in this test')),
    signInWithGoogle: () => Promise.reject(new Error('not used in this test')),
    sendPasswordResetEmail: () => Promise.reject(new Error('not used in this test')),
    updatePassword: () => Promise.reject(new Error('not used in this test')),
    signOut: () => Promise.resolve(),
  };
}

/**
 * The actor shape `actorFromSession` produces today for a student who has
 * completed the email OTP flow (`sendStudentEmailOtp` / `verifyStudentEmailOtp`)
 * — NOT Google Sign-In, which is never invoked from student-facing components.
 * `kind: 'student'` is held fixed (that is the shape that currently satisfies
 * `actor.kind !== 'anonymous'` for a non-teacher); `userId`, `email`, and
 * `name` vary across the generated domain.
 */
const nonTeacherActorArb: fc.Arbitrary<Actor> = fc
  .record({
    userId: fc.uuid(),
    email: fc.emailAddress(),
    name: fc.string({ minLength: 1, maxLength: 24 }),
  })
  .map(
    ({ userId, email, name }): Actor => ({
      kind: 'student',
      userId,
      email,
      name,
      enrollmentNumber: null,
    }),
  );

afterEach(() => {
  cleanup();
  currentRoles = [];
  currentRpcOutcome = 'valid';
});

describe('RequireTeacher — bug condition exploration (Property 1, unfixed code)', () => {
  it('EXPECTED TO FAIL on unfixed code: a non-teacher authenticated actor (email-OTP student) must not see teacher-only children', async () => {
    await fc.assert(
      fc.asyncProperty(nonTeacherActorArb, async (actor) => {
        // Authoritative role set for this generated non-teacher (email-OTP
        // student) actor per `get_my_role()`: never a teacher.
        currentRoles = [];
        render(
          <AuthProvider service={stubServiceReturning(actor)}>
            <MemoryRouter initialEntries={['/dashboard']}>
              <RequireTeacher>
                <div>secret</div>
              </RequireTeacher>
            </MemoryRouter>
          </AuthProvider>,
        );

        // Flush the AuthProvider's getCurrentActor() promise inside act() so
        // RequireTeacher's post-loading render is captured cleanly.
        await act(async () => {
          await Promise.resolve();
        });

        // Expected (fixed) behavior: `secret` must NOT render for a
        // non-teacher actor. On the current (unfixed) RequireTeacher, which
        // only checks `actor.kind !== 'anonymous'`, this assertion FAILS
        // because `secret` DOES render — that failure is the proof of the bug
        // (bugfix.md 2.1, 2.2, 2.6; design.md Property 1).
        const secret = screen.queryByText('secret');
        const passed = secret === null;

        cleanup();

        return passed;
      }),
      { numRuns: 15 },
    );
  });
});

/**
 * Preservation property test for `RequireTeacher` (bugfix:
 * student-signin-role-routing-fix, task 2, re-verified against the fixed
 * code in task 3.6).
 *
 * Property 2: Preservation — routing outcomes for a teacher actor, a
 * pending-teacher actor, and an anonymous visitor must be unchanged by the
 * fix (bugfix.md 3.1–3.4, 3.7, 3.10; design.md Property 2).
 *
 * Observed baseline (originally captured on unfixed `RequireTeacher`, which
 * gated on `actor.kind !== 'anonymous'`; re-verified below against the FIXED
 * `RequireTeacher`, which gates on `get_my_role()` via `useUserRole()`):
 *   - `role = 'teacher'` → renders `children`.
 *   - `role = 'pending-teacher'` → renders `children` (newly added case,
 *     task 3.6 — this is the genuinely-new, allowlisted teacher who must
 *     still reach `/onboarding` behind `RequireTeacher` without a redirect
 *     loop, per `design.md`'s Preservation Requirements).
 *   - `actor.kind = 'anonymous'` (`role = 'none'`) → redirects away
 *     (children do not render).
 *
 * `onboarded` does not affect `RequireTeacher`'s own decision (it has no
 * onboarding check), so it is generated alongside `actorKind` per the task's
 * `(actorKind, onboarded)` domain but does not change the expected outcome
 * here.
 *
 * This test is EXPECTED TO PASS — it documents behavior that must be (and,
 * per this re-run, is) preserved across the fix.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.7, 3.8, 3.10**
 */

type PreservationActorKind = 'teacher' | 'pending-teacher' | 'anonymous';

interface PreservationTuple {
  readonly actorKind: PreservationActorKind;
  readonly actor: Actor;
  readonly onboarded: boolean;
}

/**
 * Generates the non-bug-condition domain: authenticated teachers (varying
 * `userId`/`email`), pending-teachers, and anonymous visitors, each paired
 * with a random `onboarded` flag.
 *
 * The `pending-teacher` case reuses the same actor shape as the non-teacher
 * exploration actor above (`{ kind: 'student', ... }`) — this is exactly
 * what `actorFromSession` produces today for a not-yet-onboarded teacher,
 * since it cannot distinguish "new teacher" from "student" from session
 * claims alone. The distinguishing factor is `get_my_role()` returning
 * `['pending-teacher']` for this identity, not the actor's `kind` field — so
 * `currentRoles` (not `actor.kind`) is set to `['pending-teacher']` for this
 * case below.
 */
const preservationTupleArb: fc.Arbitrary<PreservationTuple> = fc.oneof(
  fc
    .record({
      userId: fc.uuid(),
      email: fc.emailAddress(),
      onboarded: fc.boolean(),
    })
    .map(
      ({ userId, email, onboarded }): PreservationTuple => ({
        actorKind: 'teacher',
        actor: { kind: 'teacher', userId, email },
        onboarded,
      }),
    ),
  fc
    .record({
      userId: fc.uuid(),
      email: fc.emailAddress(),
      name: fc.string({ minLength: 1, maxLength: 24 }),
    })
    .map(
      ({ userId, email, name }): PreservationTuple => ({
        actorKind: 'pending-teacher',
        actor: { kind: 'student', userId, email, name, enrollmentNumber: null },
        onboarded: false,
      }),
    ),
  fc.boolean().map(
    (onboarded): PreservationTuple => ({
      actorKind: 'anonymous',
      actor: { kind: 'anonymous' },
      onboarded,
    }),
  ),
);

function roleForActorKind(actorKind: PreservationActorKind): string[] {
  if (actorKind === 'teacher') return ['teacher'];
  if (actorKind === 'pending-teacher') return ['pending-teacher'];
  return [];
}

describe('RequireTeacher — preservation (Property 2, fixed code)', () => {
  it('PASSES on fixed code: a teacher or pending-teacher actor sees children, an anonymous actor is redirected, regardless of onboarded status', async () => {
    await fc.assert(
      fc.asyncProperty(preservationTupleArb, async ({ actorKind, actor }) => {
        // `get_my_role()` resolves ['teacher']/['pending-teacher'] for the
        // matching actor kinds and [] for anonymous (though anonymous
        // never actually calls the RPC per `useUserRole`'s short-circuit —
        // this value is unused then).
        currentRoles = roleForActorKind(actorKind);
        render(
          <AuthProvider service={stubServiceReturning(actor)}>
            <MemoryRouter initialEntries={['/dashboard']}>
              <RequireTeacher>
                <div>secret</div>
              </RequireTeacher>
            </MemoryRouter>
          </AuthProvider>,
        );

        await act(async () => {
          await Promise.resolve();
        });

        const secret = screen.queryByText('secret');
        const passed = actorKind === 'teacher' || actorKind === 'pending-teacher' ? secret !== null : secret === null;

        cleanup();

        return passed;
      }),
      { numRuns: 15 },
    );
  });

  /**
   * Task 3.3 addition: an admin-only identity (`roles = ['admin']`, no
   * `'teacher'`/`'pending-teacher'` tag) must resolve `isTeacher = false` /
   * `isPendingTeacher = false` and be denied by `RequireTeacher` exactly like
   * any other non-teacher actor — admin status alone does not satisfy the
   * teacher gate.
   */
  it('PASSES on fixed code: an admin-only identity (roles = [admin], no teacher tag) does not see teacher-only children', async () => {
    await fc.assert(
      fc.asyncProperty(nonTeacherActorArb, async (actor) => {
        currentRoles = ['admin'];
        render(
          <AuthProvider service={stubServiceReturning(actor)}>
            <MemoryRouter initialEntries={['/dashboard']}>
              <RequireTeacher>
                <div>secret</div>
              </RequireTeacher>
            </MemoryRouter>
          </AuthProvider>,
        );

        await act(async () => {
          await Promise.resolve();
        });

        const secret = screen.queryByText('secret');
        const passed = secret === null;

        cleanup();

        return passed;
      }),
      { numRuns: 15 },
    );
  });
});

/**
 * Fail-closed property test for `useUserRole()` via `RequireTeacher` (bugfix:
 * student-signin-role-routing-fix, task 3.7).
 *
 * Property 3: Fail-Closed — an RPC failure (rejected promise or resolved
 * `{ error }`) or an unrecognized resolved value must resolve
 * `useUserRole()`'s role to `'none'` with `loading = false` (design.md
 * Property 3; bugfix.md clause 2.7). `RequireTeacher` must treat this exactly
 * like the ordinary `'none'` case — `secret` must never render.
 *
 * This test is run against the FIXED code and is EXPECTED TO PASS, since
 * `useUserRole.ts`'s `if (error || typeof data !== 'string' ||
 * !VALID_ROLES.has(data))` branch already fails closed to `'none'`.
 *
 * **Validates: Requirements 2.7**
 */

const rpcFailureOutcomeArb: fc.Arbitrary<RpcOutcome> = fc.constantFrom(
  'rejects',
  'resolves-error',
  'resolves-unrecognized',
);

describe('RequireTeacher — fail-closed (Property 3, fixed code)', () => {
  it('PASSES on fixed code: an RPC rejection, error response, or unrecognized value never renders teacher-only children', async () => {
    await fc.assert(
      fc.asyncProperty(nonTeacherActorArb, rpcFailureOutcomeArb, async (actor, outcome) => {
        currentRpcOutcome = outcome;
        render(
          <AuthProvider service={stubServiceReturning(actor)}>
            <MemoryRouter initialEntries={['/dashboard']}>
              <RequireTeacher>
                <div>secret</div>
              </RequireTeacher>
            </MemoryRouter>
          </AuthProvider>,
        );

        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        const secret = screen.queryByText('secret');
        const passed = secret === null;

        cleanup();

        return passed;
      }),
      { numRuns: 15 },
    );
  });
});
