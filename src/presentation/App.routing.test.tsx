/**
 * Bug condition exploration test for `RootRedirect` and `OnboardingRoute` in
 * `src/presentation/App.tsx` (bugfix: student-signin-role-routing-fix, task 1).
 *
 * Property 1: Bug Condition — a non-teacher authenticated user (an email-OTP
 * student who has completed `verifyStudentEmailOtp`) must never be routed to
 * `/dashboard` and must never be offered the teacher onboarding wizard
 * (bugfix.md 2.1, 2.2, 2.6; design.md Property 1). Today, `RootRedirect` only
 * checks `actor.kind !== 'anonymous'`, and `OnboardingRoute` performs no
 * teacher-status check at all — it renders the wizard for anyone whenever
 * `useOnboardingStatus()` reports `onboarded: false` (bugfix.md 1.1–1.3, 1.5).
 *
 * Both tests below assert the EXPECTED (fixed) behavior and are run against
 * the UNFIXED `App.tsx`. They are EXPECTED TO FAIL: the failure is the proof
 * that the bug exists. Do not "fix" these tests when they fail; that is the
 * point of the exploration step in the bug-condition methodology. Task 3.5
 * re-runs this exact test file against the fixed code, where it is expected
 * to pass.
 *
 * `App.tsx` builds its own `AuthProvider` (default, module-level
 * `authService`) and its own `BrowserRouter` internally — neither is
 * injectable via props — so this test controls them by mocking the
 * `@data/access/authService` module and the `useOnboardingStatus` hook module,
 * and by driving the real browser history before rendering `<App />`. No
 * source file (`App.tsx`, `RequireTeacher.tsx`) is modified.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 2.5**
 */

import { describe, it, vi, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import fc from 'fast-check';
import type { Actor } from '@domain/shared/types';

// --- Lightweight stand-ins for the lazy-loaded teacher/onboarding chunks ---
// Keeps this routing test fast and independent of Supabase/network calls;
// the concern here is which *route* is reached, not what a real page renders.
vi.mock('@presentation/pages/DashboardPage', () => ({
  default: () => <div>DASHBOARD_PAGE_MARKER</div>,
}));
vi.mock('../features/onboarding/OnboardingPage', () => ({
  default: () => <div>ONBOARDING_WIZARD_MARKER</div>,
}));

// --- Control the actor AuthProvider resolves inside App.tsx ---
// App.tsx's AuthProvider uses the module-level `authService` default (not
// injectable via props), so the actor is controlled by mocking the module.
let currentActor: Actor = { kind: 'anonymous' };
/**
 * Controls `signInTeacherPassword`'s outcome — defaults to rejecting (as
 * before, since most tests never submit the sign-in form); the
 * `onSignedIn`-redirect tests below set this to a resolved success so
 * `TeacherSignInView`'s password step can complete and invoke `onSignedIn`.
 */
let passwordLoginResult: () => Promise<{ ok: true; value: Actor } | { ok: false; error: { kind: string; message: string } }> =
  () => Promise.reject(new Error('not used in this test'));
vi.mock('@data/access/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@data/access/authService')>();
  return {
    ...actual,
    authService: {
      getCurrentActor: () => Promise.resolve(currentActor),
      subscribe: () => () => {},
      signInTeacherPassword: () => passwordLoginResult(),
      sendEmailOtp: () => Promise.reject(new Error('not used in this test')),
      verifyEmailOtp: () => Promise.reject(new Error('not used in this test')),
      sendStudentEmailOtp: () => Promise.reject(new Error('not used in this test')),
      verifyStudentEmailOtp: () => Promise.reject(new Error('not used in this test')),
      signInWithGoogle: () => Promise.reject(new Error('not used in this test')),
      signOut: () => Promise.resolve(),
    },
  };
});

// --- Control the onboarding status consulted by OnboardingGate/OnboardingRoute ---
let onboardingStatus: { loading: boolean; onboarded: boolean } = { loading: false, onboarded: false };
vi.mock('../features/onboarding/hooks/useOnboardingStatus', () => ({
  useOnboardingStatus: () => onboardingStatus,
}));

/**
 * `RootRedirect`, `SignInRoute`, and `OnboardingRoute` (now fixed, task 3.4)
 * call `useUserRole()`, which calls `supabase.rpc('get_my_role')` — mock
 * that RPC so these tests exercise the routing logic without a real network
 * call. `get_my_role()` now returns an array of role tags (task 3.2/3.3), so
 * `currentRoles` holds that array and is set per test so the exploration
 * tests (non-teacher → `[]`) and the preservation tests (teacher →
 * `['teacher']`) each get the authoritative role set that corresponds to
 * their generated `actor`.
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

// Imported after the mocks above so App.tsx picks them up.
import App from './App';

/**
 * The actor shape `actorFromSession` produces today for a student who has
 * completed the email OTP flow (`sendStudentEmailOtp` / `verifyStudentEmailOtp`)
 * — NOT Google Sign-In, which is never invoked from student-facing components.
 * `kind: 'student'` is held fixed; `userId`, `email`, and `name` vary.
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
  currentActor = { kind: 'anonymous' };
  onboardingStatus = { loading: false, onboarded: false };
  currentRoles = [];
  currentRpcOutcome = 'valid';
  passwordLoginResult = () => Promise.reject(new Error('not used in this test'));
});

describe('RootRedirect — bug condition exploration (Property 1, unfixed code)', () => {
  it('EXPECTED TO FAIL on unfixed code: a non-teacher authenticated actor (email-OTP student) must be redirected to /sign-in, not /dashboard', async () => {
    await fc.assert(
      fc.asyncProperty(nonTeacherActorArb, async (actor) => {
        currentActor = actor;
        // Authoritative role set for this generated non-teacher (email-OTP
        // student) actor per `get_my_role()`: never a teacher.
        currentRoles = [];
        // Onboarded = true isolates RootRedirect's own decision from the
        // downstream OnboardingGate redirect (which is covered separately by
        // the OnboardingRoute test below).
        onboardingStatus = { loading: false, onboarded: true };

        window.history.pushState(null, '', '/');
        render(<App />);

        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        // Expected (fixed) behavior: a non-teacher authenticated actor must
        // land on /sign-in. On the current (unfixed) RootRedirect, which only
        // checks `actor.kind !== 'anonymous'`, this assertion FAILS because
        // the resolved path is /dashboard instead — that failure is the proof
        // of the bug (bugfix.md 1.1, 1.5, 2.1).
        const passed = window.location.pathname === '/sign-in';

        cleanup();

        return passed;
      }),
      { numRuns: 15 },
    );
  });
});

describe('OnboardingRoute — bug condition exploration (Property 1, unfixed code)', () => {
  it('EXPECTED TO FAIL on unfixed code: a non-teacher authenticated actor (email-OTP student) must not be offered the teacher onboarding wizard', async () => {
    await fc.assert(
      fc.asyncProperty(nonTeacherActorArb, async (actor) => {
        currentActor = actor;
        currentRoles = [];
        onboardingStatus = { loading: false, onboarded: false };

        window.history.pushState(null, '', '/onboarding');
        render(<App />);

        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        // Expected (fixed) behavior: `OnboardingPage` must NOT render for a
        // non-teacher actor. On the current (unfixed) `OnboardingRoute`,
        // which performs no teacher-status check at all — it renders the
        // wizard for anyone once `onboarded: false` — this assertion FAILS
        // because the wizard marker DOES render (bugfix.md 1.2, 1.3, 2.2).
        const passed = screen.queryByText('ONBOARDING_WIZARD_MARKER') === null;

        cleanup();

        return passed;
      }),
      { numRuns: 15 },
    );
  });
});

/**
 * Preservation property tests for `RootRedirect`, `SignInRoute`, and
 * `OnboardingRoute` in `src/presentation/App.tsx` (bugfix:
 * student-signin-role-routing-fix, task 2, re-verified against the fixed
 * code in task 3.6).
 *
 * Property 2: Preservation — routing outcomes for a teacher actor, a
 * pending-teacher actor, and an anonymous visitor must be unchanged by the
 * fix (bugfix.md 3.1, 3.2, 3.7, 3.8, 3.10; design.md Property 2).
 *
 * Observed baseline (originally captured on unfixed code, gates on
 * `actor.kind !== 'anonymous'`; re-verified below against the FIXED code,
 * which gates on `get_my_role()` via `useUserRole()`):
 *   - `RootRedirect` with `role = 'teacher'` → navigates to `/dashboard`.
 *   - `RootRedirect` with `actor.kind = 'anonymous'` (`role = 'none'`) →
 *     navigates to `/sign-in`.
 *   - `SignInRoute` with `role = 'teacher'` → navigates to `/dashboard`;
 *     with `actor.kind = 'anonymous'` → renders `TeacherSignInView`.
 *   - `OnboardingRoute` with `role = 'teacher'`, `onboarded = true` →
 *     navigates to `/dashboard`; with `role = 'teacher'`, `onboarded = false`
 *     → renders `OnboardingPage`; with `role = 'pending-teacher'`,
 *     `onboarded = false` → renders `OnboardingPage` (newly added case, task
 *     3.6 — this is the "genuinely new, allowlisted teacher" preservation
 *     case from `design.md`); with `actor.kind = 'anonymous'` (`role =
 *     'none'`) → navigates to `/sign-in`, `OnboardingPage` never renders,
 *     regardless of `onboarded`, because the fixed `OnboardingRoute` checks
 *     role before onboarded status.
 *
 * These tests are EXPECTED TO PASS — they document behavior that must be
 * (and, per this re-run, is) preserved across the fix.
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
 * with a random `onboarded` flag — the `(actorKind, onboarded)` tuple domain
 * the task specifies.
 *
 * The `pending-teacher` case reuses the same actor shape as the non-teacher
 * exploration actors (`{ kind: 'student', ... }`) — this is exactly what
 * `actorFromSession` produces today for a not-yet-onboarded teacher, since
 * it cannot distinguish "new teacher" from "student" from session claims
 * alone (per `design.md`'s root-cause analysis). The distinguishing factor
 * is `get_my_role()` returning `['pending-teacher']` for this identity, not
 * the actor's `kind` field — so `currentRoles` (not `actor.kind`) is set to
 * `['pending-teacher']` for this case below.
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

describe('RootRedirect — preservation (Property 2, fixed code)', () => {
  it('PASSES on fixed code: a teacher or pending-teacher actor lands on /dashboard, an anonymous actor lands on /sign-in', async () => {
    await fc.assert(
      fc.asyncProperty(preservationTupleArb, async ({ actorKind, actor }) => {
        currentActor = actor;
        currentRoles = roleForActorKind(actorKind);
        // Fixed onboarded = true isolates RootRedirect's own decision from
        // the downstream OnboardingGate redirect (covered separately by the
        // OnboardingRoute test below) — same isolation technique used in
        // task 1's RootRedirect exploration test.
        onboardingStatus = { loading: false, onboarded: true };

        window.history.pushState(null, '', '/');
        render(<App />);

        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        const expected = actorKind === 'teacher' || actorKind === 'pending-teacher' ? '/dashboard' : '/sign-in';
        const passed = window.location.pathname === expected;

        cleanup();

        return passed;
      }),
      { numRuns: 15 },
    );
  });

  /**
   * Bugfix: admin-only-sign-in-redirect. An admin-only identity (`roles =
   * ['admin']`, no `'teacher'`/`'pending-teacher'` tag) must resolve
   * `isTeacher = false` / `isPendingTeacher = false` — same as the anonymous
   * (`roles = []`) case — but must NOT be treated as "unapproved" and signed
   * out: `RootRedirect` and `SignInRoute` must route it to `/admin`
   * instead. (Superseded from an earlier version of this test, which — before
   * the Admin Console existed as a redirect target — asserted `/sign-in` for
   * this same case; that was itself the bug this fix addresses.)
   */
  it('PASSES on fixed code: an admin-only identity (roles = [admin], no teacher tag) is routed to /admin by RootRedirect and SignInRoute, never signed out to /sign-in', async () => {
    await fc.assert(
      fc.asyncProperty(nonTeacherActorArb, async (actor) => {
        currentActor = actor;
        currentRoles = ['admin'];
        onboardingStatus = { loading: false, onboarded: true };

        window.history.pushState(null, '', '/');
        render(<App />);
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });
        const rootRedirectPassed = window.location.pathname === '/admin';
        cleanup();

        window.history.pushState(null, '', '/sign-in');
        render(<App />);
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });
        const signInRoutePassed = window.location.pathname === '/admin';
        cleanup();

        return rootRedirectPassed && signInRoutePassed;
      }),
      { numRuns: 15 },
    );
  });
});

/**
 * Bugfix: admin-only-sign-in-redirect (ad-hoc, discovered verifying Phase 1
 * of admin-console-and-scheduling-upgrade). An admin-only identity (present
 * in `public.admins`, absent from `public.teachers` /
 * `public.allowed_teacher_emails`) could previously sign in successfully and
 * then be bounced straight back to `/sign-in` by `RequireTeacher`, because
 * `TeacherSignInView`'s `onSignedIn` callback (wired in `SignInRoute`)
 * unconditionally navigated to `/dashboard`.
 *
 * An earlier version of the fix made that callback call
 * `supabase.rpc('get_my_role')` directly and branch on the result — but that
 * is itself racy: immediately after `signInTeacherPassword` resolves, the
 * session's auth context has not necessarily fully propagated to the
 * Supabase client yet, so the RPC call can spuriously resolve with an error
 * or an empty role set, sending an admin-only identity to `/dashboard`
 * anyway. The corrected fix removes the inline RPC call entirely:
 * `onSignedIn` now simply does a full page reload to the root route via
 * `window.location.replace('/')`, letting `RootRedirect` (which already has
 * the same teacher/admin-aware branching) run on a genuinely fresh page
 * load where the session is fully established.
 *
 * These tests drive the real `SignInRoute` → `TeacherSignInView` component
 * tree (not just the route-level checks above), submitting the password
 * form and asserting `onSignedIn` triggers `window.location.replace('/')`
 * regardless of role — role-aware routing itself is `RootRedirect`'s job,
 * exercised separately by the `RootRedirect` preservation/admin tests above.
 */
describe('SignInRoute — onSignedIn navigates to root for a fresh RootRedirect pass (admin-only-sign-in-redirect bugfix)', () => {
  const locationReplaceSpy = vi.fn();
  let originalLocation: Location;

  beforeAll(() => {
    // JSDOM's native `window.location.replace` triggers an actual navigation
    // ("Not implemented: navigation") and its property descriptor on the
    // real `Location` object is non-configurable, so it can't be
    // `vi.spyOn`-ed, `Object.defineProperty`-ed directly, or wrapped in a
    // `Proxy` over the real object (the proxy-invariant check on a
    // non-configurable target property rejects a differing trap result).
    // Instead, `window.location` itself (a configurable, writable property
    // of `window`) is replaced with a plain stand-in object exposing a live
    // `pathname` getter (delegating to the real, underlying location, so
    // `window.history.pushState` calls elsewhere in this file still resolve
    // correctly) and its own `replace`, the one method `onSignedIn` calls —
    // restored in `afterAll`.
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        get pathname() {
          return originalLocation.pathname;
        },
        get href() {
          return originalLocation.href;
        },
        get origin() {
          return originalLocation.origin;
        },
        get search() {
          return originalLocation.search;
        },
        get hash() {
          return originalLocation.hash;
        },
        replace: locationReplaceSpy,
      },
    });
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  beforeEach(() => {
    locationReplaceSpy.mockClear();
  });

  async function signInWithPassword() {
    const emailInput = await screen.findByLabelText('College email');
    await act(async () => {
      emailInput.dispatchEvent(new Event('focus'));
    });
    // Switch to the password step — the OTP step's "Send login code" would
    // otherwise be the default first step.
    const passwordSwitch = screen.getByText('Use password instead');
    await act(async () => {
      passwordSwitch.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const pwEmailInput = (await screen.findByLabelText('Email')) as HTMLInputElement;
    const pwPasswordInput = screen.getByLabelText('Password') as HTMLInputElement;
    await act(async () => {
      pwEmailInput.value = 'admin@example.com';
      pwEmailInput.dispatchEvent(new Event('input', { bubbles: true }));
      pwPasswordInput.value = 'correct-password';
      pwPasswordInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = pwPasswordInput.closest('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      // Let the async onSignedIn (and its own get_my_role RPC await) settle.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('navigates to / (not /admin or /dashboard) for an admin-only identity (roles = [admin], no teacher tag) after sign-in', async () => {
    currentActor = { kind: 'anonymous' };
    currentRoles = ['admin'];
    onboardingStatus = { loading: false, onboarded: true };
    passwordLoginResult = () =>
      Promise.resolve({ ok: true, value: { kind: 'teacher', userId: 'admin-1', email: 'admin@example.com' } });

    window.history.pushState(null, '', '/sign-in');
    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await signInWithPassword();

    expect(locationReplaceSpy).toHaveBeenCalledWith('/');
    expect(locationReplaceSpy).not.toHaveBeenCalledWith('/admin');
    expect(locationReplaceSpy).not.toHaveBeenCalledWith('/dashboard');

    cleanup();
  });

  it('navigates to / (not /dashboard directly) for a teacher identity after sign-in', async () => {
    currentActor = { kind: 'anonymous' };
    currentRoles = ['teacher'];
    onboardingStatus = { loading: false, onboarded: true };
    passwordLoginResult = () =>
      Promise.resolve({ ok: true, value: { kind: 'teacher', userId: 'teacher-1', email: 'teacher@example.com' } });

    window.history.pushState(null, '', '/sign-in');
    render(<App />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await signInWithPassword();

    expect(locationReplaceSpy).toHaveBeenCalledWith('/');
    expect(locationReplaceSpy).not.toHaveBeenCalledWith('/dashboard');

    cleanup();
  });
});

describe('SignInRoute — preservation (Property 2, fixed code)', () => {
  it('PASSES on fixed code: a teacher or pending-teacher actor is redirected to /dashboard, an anonymous actor sees TeacherSignInView', async () => {
    await fc.assert(
      fc.asyncProperty(preservationTupleArb, async ({ actorKind, actor }) => {
        currentActor = actor;
        currentRoles = roleForActorKind(actorKind);
        // Fixed onboarded = true isolates SignInRoute's own decision from
        // the downstream OnboardingGate redirect, same as above.
        onboardingStatus = { loading: false, onboarded: true };

        window.history.pushState(null, '', '/sign-in');
        render(<App />);

        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        const passed =
          actorKind === 'teacher' || actorKind === 'pending-teacher'
            ? window.location.pathname === '/dashboard'
            : screen.queryByText('Teacher sign in') !== null;

        cleanup();

        return passed;
      }),
      { numRuns: 15 },
    );
  });
});

describe('OnboardingRoute — preservation (Property 2, fixed code)', () => {
  it('PASSES on fixed code: role=teacher or role=pending-teacher with onboarded=false renders OnboardingPage; role=teacher with onboarded=true navigates to /dashboard; anonymous always navigates to /sign-in regardless of onboarded, with no redirect loop across repeated renders', async () => {
    await fc.assert(
      fc.asyncProperty(preservationTupleArb, async ({ actorKind, actor, onboarded }) => {
        currentActor = actor;
        currentRoles = roleForActorKind(actorKind);
        onboardingStatus = { loading: false, onboarded };

        window.history.pushState(null, '', '/onboarding');
        const { unmount } = render(<App />);

        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        function checkOutcome(): boolean {
          if (actorKind === 'anonymous') {
            // Fixed OnboardingRoute checks role before onboarded status: a
            // non-teacher ('none') is sent to /sign-in and the wizard never
            // renders, regardless of the onboarded flag — this is the
            // behavior that changed from the old (unfixed) baseline, which
            // this test now documents as the correct, preserved-going-
            // forward outcome.
            return (
              window.location.pathname === '/sign-in' &&
              screen.queryByText('ONBOARDING_WIZARD_MARKER') === null
            );
          }
          if (!onboarded) {
            // A teacher or pending-teacher who hasn't finished onboarding
            // sees the wizard — this is the genuinely-new-teacher case that
            // must keep working without a redirect loop.
            return screen.queryByText('ONBOARDING_WIZARD_MARKER') !== null;
          }
          // An already-onboarded teacher (pending-teacher + onboarded=true
          // is not a case the domain generates, since a pending-teacher by
          // definition has no teachers row yet) navigates to /dashboard,
          // itself gated by RequireTeacher — settling on /dashboard.
          return (
            window.location.pathname === '/dashboard' &&
            screen.queryByText('ONBOARDING_WIZARD_MARKER') === null
          );
        }

        let passed = checkOutcome();

        // No redirect loop across repeated renders: re-render the same tree
        // and confirm the resolved outcome stays stable rather than
        // oscillating (relevant chiefly for the newly added pending-teacher
        // + onboarded=false case, which must keep rendering the wizard on
        // every render rather than bouncing between routes).
        if (passed) {
          await act(async () => {
            await Promise.resolve();
          });
          passed = checkOutcome();
        }

        unmount();
        cleanup();

        return passed;
      }),
      { numRuns: 15 },
    );
  });
});

/**
 * Fail-closed property tests for `RootRedirect` and `OnboardingRoute` in
 * `src/presentation/App.tsx` via `useUserRole()` (bugfix:
 * student-signin-role-routing-fix, task 3.7).
 *
 * Property 3: Fail-Closed — an RPC failure (rejected promise or resolved
 * `{ error }`) or an unrecognized resolved value must resolve
 * `useUserRole()`'s role to `'none'` with `loading = false` (design.md
 * Property 3; bugfix.md clause 2.7). `RootRedirect` and `OnboardingRoute`
 * must treat this exactly like the ordinary `'none'` case: never navigate to
 * `/dashboard` and never render the onboarding wizard.
 *
 * These tests are run against the FIXED code and are EXPECTED TO PASS, since
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

describe('RootRedirect — fail-closed (Property 3, fixed code)', () => {
  it('PASSES on fixed code: an RPC rejection, error response, or unrecognized value never lands on /dashboard', async () => {
    await fc.assert(
      fc.asyncProperty(nonTeacherActorArb, rpcFailureOutcomeArb, async (actor, outcome) => {
        currentActor = actor;
        currentRpcOutcome = outcome;
        onboardingStatus = { loading: false, onboarded: true };

        window.history.pushState(null, '', '/');
        render(<App />);

        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        const passed = window.location.pathname !== '/dashboard';

        cleanup();

        return passed;
      }),
      { numRuns: 15 },
    );
  });
});

describe('OnboardingRoute — fail-closed (Property 3, fixed code)', () => {
  it('PASSES on fixed code: an RPC rejection, error response, or unrecognized value never renders the onboarding wizard', async () => {
    await fc.assert(
      fc.asyncProperty(nonTeacherActorArb, rpcFailureOutcomeArb, async (actor, outcome) => {
        currentActor = actor;
        currentRpcOutcome = outcome;
        onboardingStatus = { loading: false, onboarded: false };

        window.history.pushState(null, '', '/onboarding');
        render(<App />);

        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        const passed = screen.queryByText('ONBOARDING_WIZARD_MARKER') === null;

        cleanup();

        return passed;
      }),
      { numRuns: 15 },
    );
  });
});
