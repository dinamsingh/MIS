# Bugfix Requirements Document

## Introduction

When a student completes the email OTP verification (`sendStudentEmailOtp` / `verifyStudentEmailOtp`) — whether they land on `/sign-in` directly or arrive there after clicking a quiz link — the app routes them through the teacher app shell, funnels them into the teacher onboarding wizard, and lets them complete it, provisioning the student as a teacher in the `teachers` table. The root cause is that post-authentication routing (`RootRedirect`, `SignInRoute`) and the teacher-shell guard (`RequireTeacher`) branch on "any authenticated session" rather than on a reliable teacher/student distinction; the current teacher-detection signals (`app_metadata.role === 'teacher'` and a single `VITE_TEACHER_EMAIL` fallback in `actorFromSession`) do not reliably identify teachers in a multi-teacher deployment.

Impact: students end up on `/onboarding` (a teacher-only surface), never reach the student quiz-access flow they clicked in for, and can accidentally be recorded as teachers. This is a UX/routing bug only — Postgres RLS remains the authoritative security boundary and is not changed by this fix.

## Bug Analysis

### Current Behavior (Defect)

The system treats every authenticated (non-anonymous) session as a teacher session for routing purposes, and the teacher onboarding wizard is reachable by any authenticated user whose teacher record does not yet exist.

1.1 WHEN a student user (a user with an authenticated Supabase session whose identity is not a teacher in the `teachers` table) completes the email OTP verification THEN the system routes them to `/dashboard` (the teacher app shell) instead of the student quiz-access flow.
1.2 WHEN a student user reaches `/dashboard` and `OnboardingGate` finds no matching row in the `teachers` table for them THEN the system redirects them to `/onboarding` (the teacher onboarding wizard route).
1.3 WHEN a student user is presented with the teacher onboarding wizard at `/onboarding` THEN the system permits them to complete it and provisions them as a teacher in the `teachers` table.
1.4 WHEN a student clicks a shareable quiz link and then completes the email OTP verification from the app THEN the system does not return them to the student quiz-access flow for that quiz.
1.5 WHEN the system decides post-authentication routing (in `RootRedirect`, `SignInRoute`, and `RequireTeacher`) THEN the decision is made purely on `actor.kind !== 'anonymous'`, which is not a reliable teacher/student distinction because `actorFromSession` classifies as `student` any authenticated user whose `app_metadata.role` is not `'teacher'` and whose email does not match `VITE_TEACHER_EMAIL`, and classifies as `teacher` on those signals alone without consulting the authoritative `teachers` table.

### Expected Behavior (Correct)

Post-authentication routing must reliably distinguish teacher users from non-teacher users, and teacher-only surfaces (the teacher app shell and the teacher onboarding wizard) must never be reachable by a non-teacher authenticated user.

2.1 WHEN a student user (an authenticated user who is not a teacher) completes the email OTP verification THEN the system SHALL NOT route them to `/dashboard`, `/onboarding`, or any other teacher-only route.
2.2 WHEN a student user is authenticated but is not a teacher THEN the system SHALL NOT render the teacher onboarding wizard for them under any client-driven flow.
2.3 WHEN a student user is authenticated but is not a teacher THEN the system SHALL NOT create a row for them in the `teachers` table under any client-driven flow.
2.4 WHEN a student clicks a shareable quiz link and then completes the email OTP verification as part of accessing that quiz THEN the system SHALL land them in the student quiz-access flow for that quiz (email verification if still needed, enrollment autocomplete, or attempt), matching the destination the OTP-based student flow reaches today.
2.5 WHEN the system decides whether to route an authenticated user into the teacher app shell or the teacher onboarding wizard THEN the decision SHALL be based on a reliable teacher-status signal that correctly identifies all teachers in a multi-teacher deployment (not solely on `actor.kind !== 'anonymous'`, not solely on `app_metadata.role === 'teacher'`, and not solely on a single `VITE_TEACHER_EMAIL` match).
2.6 WHEN an authenticated non-teacher user reaches any route inside the teacher app shell (routes rendered under `TeacherShell` / `RequireTeacher`) THEN the system SHALL redirect them away from that route to a non-teacher destination without infinite redirect loops.
2.7 WHEN a `teachers`-status check performed for routing fails (e.g., network error, timeout) THEN the system SHALL treat the user as non-teacher for routing purposes and SHALL NOT expose the teacher app shell or the teacher onboarding wizard.

### Unchanged Behavior (Regression Prevention)

Existing routing for teachers, anonymous visitors, and already-working student quiz flows must continue to work exactly as today.

3.1 WHEN a teacher user (an authenticated user who is a teacher) signs in via email OTP (`sendEmailOtp` / `verifyEmailOtp`) THEN the system SHALL CONTINUE TO land them on `/dashboard` (or on `/onboarding` if they have not yet completed onboarding).
3.2 WHEN a teacher user signs in via email/password (`signInTeacherPassword`) or via email OTP (`sendEmailOtp` / `verifyEmailOtp`) THEN the system SHALL CONTINUE TO land them on `/dashboard` (or on `/onboarding` if they have not yet completed onboarding).
3.3 WHEN a genuine new teacher who has not yet completed onboarding signs in for the first time THEN the system SHALL CONTINUE TO make the teacher onboarding wizard reachable to them and SHALL CONTINUE TO let them complete it without an infinite redirect loop.
3.4 WHEN an already-onboarded teacher navigates within the teacher app shell (`/dashboard`, `/roster`, `/attendance`, `/timetable`, `/syllabus`, `/marks`, `/quizzes`, `/assignments`, `/material`, `/analytics`, `/leaderboard`, `/reports`, `/profile`, `/ai/*`) THEN the system SHALL CONTINUE TO render those routes without redirecting them away.
3.5 WHEN an already-enrolled student (their enrollment number is stored) opens a quiz link THEN the system SHALL CONTINUE TO route them through the student quiz-access flow, skipping the one-time enrollment prompt exactly as today.
3.6 WHEN a first-time student opens a quiz link and uses email OTP (`sendStudentEmailOtp` / `verifyStudentEmailOtp`) THEN the system SHALL CONTINUE TO route them through email verification, enrollment autocomplete, and attempt exactly as today.
3.7 WHEN an anonymous visitor requests any teacher-only route (routes under `TeacherShell`, or `/onboarding`) THEN the system SHALL CONTINUE TO redirect them to `/sign-in`.
3.8 WHEN an anonymous visitor requests a public route (`/sign-in`, `/quiz/:token`, `/quiz/:token/attempt`) THEN the system SHALL CONTINUE TO serve that route without requiring a teacher session.
3.9 WHEN Postgres Row-Level Security governs any data read or write THEN the system SHALL CONTINUE TO enforce RLS unchanged — this fix is a client-side routing change and does not alter migrations, RLS policies, or the `is_teacher()` helper.
3.10 WHEN a teacher signs out (`signOut`) or their session expires THEN the system SHALL CONTINUE TO reduce the actor to anonymous and redirect protected navigation to `/sign-in`.

## Bug Condition and Property

### Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type AuthenticatedRoutingContext
    // X captures: the authenticated user's identity, whether that identity
    // is a teacher in the authoritative teachers table, and the route being
    // resolved (post-signin redirect, teacher-shell guard, or onboarding gate).
  OUTPUT: boolean

  // The bug fires whenever a non-teacher authenticated user is being routed
  // by any decision point that currently only checks "actor is not anonymous".
  RETURN X.hasAuthenticatedSession = true
     AND X.isTeacherInAuthoritativeSource = false
END FUNCTION
```

### Fix Checking Property

```pascal
// Property: a non-teacher authenticated user must never be routed into,
// nor be allowed to complete, any teacher-only surface.
FOR ALL X WHERE isBugCondition(X) DO
  destination ← routeAfterAuth'(X)
  ASSERT destination ∉ TeacherOnlyRoutes
     AND wizardOfferedTo'(X) = false
     AND teacherRowCreatedFor'(X) = false
END FOR

// Where:
//   TeacherOnlyRoutes = { '/dashboard', '/onboarding',
//                         and every route rendered under TeacherShell }
//   routeAfterAuth'(X) = the fixed post-authentication redirect target
//   wizardOfferedTo'(X) = whether the fixed OnboardingRoute renders the
//                        teacher onboarding wizard for X
//   teacherRowCreatedFor'(X) = whether the fixed onboarding completion
//                              inserts a row into the teachers table for X
```

Additionally, for the student-with-quiz-link sub-case:

```pascal
// Property: a student who arrives from a quiz link and then authenticates
// (by whichever method) must land in the student quiz-access flow for
// that specific quiz.
FOR ALL X WHERE isBugCondition(X)
             AND X.arrivedFromQuizLink = true
             AND X.quizToken = T DO
  destination ← routeAfterAuth'(X)
  ASSERT destination = StudentQuizAccessFlowFor(T)
END FOR
```

### Preservation Property

```pascal
// For every non-buggy input the fixed system must behave identically
// to the original system.
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT routeAfterAuth(X)       = routeAfterAuth'(X)
     AND wizardOfferedTo(X)      = wizardOfferedTo'(X)
     AND teacherRowFlow(X)       = teacherRowFlow'(X)
     AND rlsEnforcement(X)       = rlsEnforcement'(X)
END FOR

// NOT isBugCondition(X) covers:
//   - anonymous visitors (X.hasAuthenticatedSession = false)
//   - authenticated users who ARE teachers in the authoritative source
//     (including new teachers who haven't onboarded yet)
```

### Key Definitions

- **F**: the current unfixed application — `actorFromSession` + `RequireTeacher` + `RootRedirect` + `SignInRoute` + `OnboardingGate` + `OnboardingRoute` as they exist today.
- **F'**: the fixed application, where post-authentication routing and the onboarding-wizard gate use a reliable teacher/non-teacher signal instead of `actor.kind !== 'anonymous'`.
- **Counterexample (concrete)**: a student email that is not present in the `teachers` table and does not match `VITE_TEACHER_EMAIL` opens `/sign-in` (or a quiz link), enters that email, receives and verifies the one-time code, and — under F — is routed to `/dashboard` → `/onboarding` → completes the teacher wizard → is inserted into `teachers`.
