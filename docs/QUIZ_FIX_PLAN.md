# Quiz Module — Complete Fix Plan

> **Purpose:** Implementation brief for fixing every known gap in the Quiz module,
> from a deep audit of both the teacher side and the student side.
> Work through phases **in order** — Phase 1 changes the attempt lifecycle that
> later phases build on.
>
> **Rule for the implementer:** Read every file in "Key files" before writing code.
> Follow project conventions: layered `presentation → domain → data/access`,
> server-authoritative quiz logic in SECURITY DEFINER RPCs (grading/answers never
> reach the client), SQL migrations in `src/data/migrations` with the next
> sequential number and Problem/Fix header comments. Latest migration at time of
> writing: `0028` → new migrations start at **0029** (check for collisions with
> the attendance plan — if `0029/0030` are taken, renumber upward).

---

## Key files (current state)

| Layer | File | Role |
|---|---|---|
| Teacher UI | `src/presentation/views/QuizCreationView.tsx` | Authoring form, saved-quiz list, results dialog, delete, reset attempt |
| Teacher page | `src/presentation/pages/QuizCreationPage.tsx` | Wires view to access + selected section/subject |
| AI authoring | `src/presentation/pages/AiQuizGeneratorPage.tsx`, `src/domain/services/quizGenerationService.ts` | AI-generated drafts (reuses same publish path) |
| Student UI | `src/presentation/views/StudentQuizAccessView.tsx` | Public access gate: Google sign-in → enrollment → grant/deny |
| Student UI | `src/presentation/views/QuizAttemptView.tsx` | Attempt: client-side countdown, radio options, submit, score |
| Student pages | `src/presentation/pages/StudentQuizAccessPage.tsx`, `QuizAttemptPage.tsx` | Routes `/quiz/:token`, `/quiz/:token/attempt` |
| Access | `src/data/access/quizAccess.ts` | createQuiz/addQuestion/listQuizzes/listQuizResults/deleteQuiz/resetAttempt + student RPC wrappers |
| Domain | `src/domain/services/quizService.ts`, `rosterService.ts` | Types + pure logic + tests |
| DB | `0003_quiz_functions.sql` | `request_quiz_access`, `submit_attempt`, `quiz_total_marks` |
| DB | `0020_quiz_active_window.sql` | `active_from`/`active_until` + gate in access RPC |
| DB | `0021_quiz_share_token_access.sql`, `0022`, `0023_reset_quiz_attempt.sql`, `0024_quiz_section_roster_options.sql`, `0025_quiz_specific_access_errors.sql` | Token access, self-register, reset, roster options, error reasons |
| Demo | `src/data/demo/localDemoMode.ts` | Must stay in parity with contract changes |

---

# PHASE 1 — Attempt integrity (CRITICAL, do first)

## Fix 1: Server-authoritative timer (refresh no longer resets time)

**Problem.** The countdown lives only in client state (`QuizAttemptView.tsx` —
`useState(totalSeconds)` + `setInterval`). No server record exists until submit.
A student can refresh the page (or close and reopen the link) to get a fresh
full timer, or read questions, leave, research, and return. The time limit is
effectively decorative, and `submit_attempt` never checks elapsed time.

**Fix.**
1. **Migration `0029_quiz_attempt_sessions.sql`:**
   - `create table if not exists public.quiz_attempt_sessions (quiz_id uuid not null references public.quizzes(id) on delete cascade, student_id uuid not null references public.students(id) on delete cascade, started_at timestamptz not null default now(), primary key (quiz_id, student_id));`
   - RLS: no direct client access needed (RPCs are SECURITY DEFINER); enable RLS with no permissive policies, or a teacher-read policy for Fix 14's UI.
   - New RPC `start_quiz_attempt(p_quiz_id uuid) returns jsonb`: validates access exactly like `request_quiz_access` (reuse its checks — factor the shared validation into a helper function or duplicate carefully), then `insert ... on conflict do nothing returning started_at` (idempotent — a re-entry returns the ORIGINAL `started_at`). Returns `{startedAt, serverNow, timeLimitMinutes}`.
   - Recreate `request_quiz_access`: when a session row already exists and `now() > started_at + time_limit + grace`, return a new status `'time-expired'` with the recorded score if an attempt exists, else deny with reason `'time-expired'`.
   - Recreate `submit_attempt`: reject (or clamp) submissions where `now() > started_at + (time_limit_minutes || ' minutes')::interval + interval '30 seconds'` → outcome `'denied', reason 'time-expired'`. **A missing session row also denies** (client must call start first). Keep the already-attempted short-circuit first.
2. **`quizAccess.ts`:** add `startAttempt(quizId)` wrapper; extend `SubmitAttemptOutcome` and `QuizAccessDeniedReason` parsers (`parsers.ts`) with `'time-expired'`.
3. **`QuizAttemptView.tsx`:** compute remaining time as `timeLimit - (serverNow - startedAt)` drift-corrected (capture `Date.now()` at response receipt, tick locally from there). On mount with an existing session, the student resumes with the REAL remaining time.
4. **`StudentQuizAccessView.tsx` / DENIED_COPY:** add `'time-expired'` copy ("Your time for this quiz has run out.").
5. Demo mode: mirror the session store in `localDemoMode.ts`.

**Acceptance:** open quiz → wait 2 min → refresh → timer shows ~13:00 remaining, not 15:00. Submitting after expiry (via devtools) is rejected server-side.

## Fix 2: Explicit "Start quiz" gate (no more instant start on link open)

**Problem.** Access grant immediately renders the attempt view and the timer
starts. A student who opens the link out of curiosity has "started" the quiz
without consenting; there is no screen showing question count, time limit, or
the single-attempt rule.

**Fix.** In the granted (non-preview) state, render a **Start screen** instead
of the attempt view: quiz title/subject/unit, question count, total marks, time
limit, and rules ("Single attempt. Timer starts when you press Start. Timer
keeps running even if you close the page."). The **Start button calls
`start_quiz_attempt`** (Fix 1) and only then mounts `QuizAttemptView` with the
returned `startedAt`. `request_quiz_access` must therefore NOT create the
session — only `start_quiz_attempt` does. If a session already exists (resume),
skip the start screen and go straight to the attempt with remaining time.

## Fix 3: Answer draft resilience (network failure ≠ lost attempt)

**Problem.** Answers live only in component state. A failed submit sets an error
phase; if the student closes/refreshes in panic, all selections are gone (and
after Fix 1 the timer keeps burning).

**Fix.**
1. Persist answers to `localStorage` keyed by `quiz:{quizId}:answers:{studentId?}`
   on every selection; hydrate on mount; clear on successful submit/score.
2. On submit failure show a **Retry submit** button (do not reset
   `submittedRef` permanently — allow retry attempts) plus "your answers are
   saved on this device" copy.
3. On auto-submit at expiry, if the network call fails, retry twice with backoff
   before showing the error+retry state.

## Fix 4: Unanswered-questions guard + progress indicator

**Problem.** Manual submit fires instantly even with 8 of 10 questions blank;
no visible progress.

**Fix.** In `QuizAttemptView.tsx`: (a) sticky header shows "Answered X / Y";
(b) manual submit with unanswered questions opens a confirm dialog ("3 questions
unanswered — submit anyway?"); (c) a compact question palette (numbered chips,
answered = filled) that scroll-jumps to the question — helpful on mobile for
20+ question quizzes. Auto-submit on expiry stays unconditional.

---

# PHASE 2 — Teacher control

## Fix 5: Quiz scheduling UI (the DB feature that has no UI)

**Problem.** `active_from`/`active_until` exist (migration 0020) and status
badges render, but the creation form has NO fields to set them — every quiz is
created "Always open". There is also no way to close or reschedule a quiz.

**Fix.**
1. Creation form: add optional "Opens at" / "Closes at" datetime-local inputs
   (default empty = always open) with quick presets ("Open now for 1 hour",
   "Today 5–6 PM"). Pass through `createQuiz` (extend `QuizAccess` input +
   demo mode).
2. Saved-quiz rows: add a **Close now** action (sets `active_until = now()`)
   and an **Edit window** action (small dialog editing both bounds). New access
   function `updateQuizWindow(quizId, activeFrom, activeUntil)` — plain
   owner-scoped update, RLS already covers it.
3. `submit_attempt` already gates by window? **Verify** — 0020 only gates
   `request_quiz_access`. With Fix 1's session model, a student who started
   inside the window may finish up to `started_at + limit + grace` even if
   `active_until` passes mid-attempt (document this as intended).

## Fix 6: Atomic quiz creation (no partial/live-while-authoring quizzes)

**Problem.** `handleSubmit` calls `createQuiz` then `addQuestion` in a loop.
A mid-loop failure leaves a live quiz with partial questions; a student opening
the link during creation sees an incomplete quiz. Also N+1 latency.

**Fix.** New RPC `create_quiz_with_questions(p_quiz jsonb, p_questions jsonb)`
in migration 0029 — inserts quiz + all questions in one transaction, returns the
quiz id. Replace the loop in `QuizCreationView.tsx`/`quizAccess.ts` with one
call. Keep `addQuestion` for the AI-generator path only if it also can't batch —
otherwise migrate both. Demo mode: mirror.

## Fix 7: Deterministic question order

**Problem.** `request_quiz_access` returns questions `order by q.id` — UUIDs, so
display order is arbitrary, not authoring order.

**Fix.** Migration 0029: `alter table public.questions add column if not exists position integer not null default 0;`
backfill existing rows by `created_at` (or id) per quiz; `create_quiz_with_questions`
writes explicit positions; recreate `request_quiz_access` (and any other
question-listing path, e.g. teacher preview) with `order by q.position, q.id`.

## Fix 8: Edit quiz after publish

**Problem.** A typo in one question forces deleting the whole quiz, losing all
submissions. Only Delete exists.

**Fix (bounded scope).**
1. Allow editing question text/options/marks and quiz title **only while the
   quiz has zero attempts** (`responseCount === 0`) — full edit form, reusing the
   authoring UI pre-filled. Access: `updateQuizQuestions(quizId, questions)`
   RPC that replaces questions atomically; owner-scoped; rejects when attempts
   exist (`raise exception`).
2. Once attempts exist, allow only: fixing question TEXT typos (not options/
   correct answer/marks — those would invalidate recorded scores) via a
   restricted `updateQuestionText` — plus the window edits from Fix 5.
3. UI: "Edit" button on each saved-quiz row; disabled state with tooltip
   "Has submissions — only text fixes allowed" routing to the restricted mode.

## Fix 9: Custom title + instructions

**Problem.** Title is forced to the unit name (`selectedUnit?.name ?? 'Unit quiz'`);
no description/instructions field for students.

**Fix.** Add optional Title (prefilled with unit name) and Instructions
(textarea) to the form. Migration: `alter table public.quizzes add column if not exists instructions text;`
Show instructions on the Fix 2 Start screen. `title` column already exists.

## Fix 10: Enrollment unbind (the promise the UI can't keep)

**Problem.** Denial copy says "This enrollment number is already linked with
another Google account. Ask your teacher to reset the binding" — but no teacher
UI or RPC exists to unbind.

**Fix.** Migration 0029: RPC `unbind_student_enrollment(p_enrollment text)`
(teacher-only; verifies the enrollment belongs to the caller's roster; clears
the `students` row binding — inspect `0022_quiz_access_self_register.sql` for
the exact binding shape before writing). UI: in the Results dialog (or the
roster page — pick where teachers will look first: Results dialog, since that's
where the student complaint surfaces), add "Unbind Google account" per student
row with a confirm dialog explaining the student will re-verify next time.

---

# PHASE 3 — Results & insight

## Fix 11: "Not attempted" list (defaulters) + WhatsApp copy

**Problem.** Results show only who DID submit. The teacher's first question —
"kisne nahi diya?" — requires manually diffing against the register.

**Fix.** In the Results dialog add a second tab "Not attempted": roster of the
quiz's section minus attempters (new access function
`listQuizNonAttempters(quizId)` — reuse the roster query from
`0024_quiz_section_roster_options.sql` joined against `quiz_attempts`).
Include a **"Copy list"** button producing a WhatsApp-ready message:
`"<Subject> — <Unit> quiz pending: 007 Rahul, 015 Priya. Link: <shareLink>, closes <active_until>."`

## Fix 12: CSV export of results

**Fix.** "Export CSV" button in the Results dialog — client-side Blob download
(no dependency), columns: `Enrollment, Name, Section, Score, Total, Percent,
Submitted At`, plus a second section for non-attempters. Same pattern as the
attendance plan's CSV export.

## Fix 13: Question-level analytics

**Problem.** Teacher can't see which question most students got wrong — the
whole pedagogic payoff of an MCQ tool.

**Fix.** `quiz_attempts` stores per-question answers (verify column shape in
0003 — likely `answers jsonb`). New RPC `quiz_question_stats(p_quiz_id)`
(owner-only) returning per question: attempts, correct count, %-correct, and
per-option pick counts. UI: "Insights" tab in the Results dialog — one row per
question, red-highlight below 50% correct, option distribution as small bars.
**Answer key stays server-side** — the RPC returns only aggregates plus which
option index is correct for display to the TEACHER (owner check makes this
safe).

## Fix 14: Per-student answer sheet (teacher view)

**Fix.** Clicking a student row in Results opens their sheet: each question,
the option they picked, correct/incorrect flag, marks earned. New owner-only
RPC `quiz_attempt_detail(p_quiz_id, p_student_id)`. Read-only.

## Fix 15: Results staleness + sorting

**Problem.** `openResultsModal` caches `resultsByQuiz` and never refetches —
reopening during a live quiz shows stale data.

**Fix.** Always refetch on open (keep cache only as instant-render placeholder);
add a refresh button; default-sort rows by score descending with a
name-sort toggle.

---

# PHASE 4 — Student UX, sharing & privacy

## Fix 16: Roster privacy on the access gate

**Problem.** `loadRosterOptions` exposes the full class list (names +
enrollment numbers) as a dropdown to ANY Google-signed-in visitor who has the
link — links get forwarded outside the class.

**Fix.** Replace the open dropdown with a typed-input flow: student types their
enrollment number (input already exists as fallback); after 3+ characters,
offer only the narrow matches (max ~5) for confirmation — or keep it fully
manual with inline format validation. Server: change/replace the RPC from
`0024_quiz_section_roster_options.sql` to require a prefix parameter (min
length 3) and cap results, so bulk enumeration isn't possible. Keep the
existing manual fallback path.

## Fix 17: Post-submit review (teacher-controlled)

**Problem.** Students see only `score/total` — no learning feedback, ever.

**Fix.** Add `show_answers_after_close boolean default false` to `quizzes`
(migration; expose as a checkbox in the creation form). New RPC
`quiz_review(p_quiz_id)`: only when the caller has an attempt AND
(`active_until` passed OR always-open quiz + flag true) returns questions with
the student's answer + correct index. Student result screen gains a "Review
answers" button when eligible. Default OFF so the answer key never leaks while
a quiz is live.

## Fix 18: WhatsApp share for quizzes

**Fix.** Next to "Copy link" add "Share on WhatsApp": opens
`https://wa.me/?text=<encoded>` with
`"📝 <Subject> — <Unit> quiz (<questionCount> Qs, <timeLimit> min). Open till <active_until|no deadline>. Attempt: <shareLink>"`.
Pure URL construction, no SDK. (Same component should be reusable for the
assignment module's share button — put the message-builder in a small shared
helper, e.g. `src/presentation/format/whatsappShare.ts`.)

## Fix 19: Small student-side fixes (batch)

1. **Timer urgency a11y:** add `role="timer"` and announce at 5/1 min marks.
2. **Auto-submit copy:** after expiry auto-submit, show "Time up — your answers
   were submitted automatically" instead of the generic scored screen title.
3. **`quiz-not-found` reason:** `request_quiz_access` returns `'not-registered'`
   when the quiz id doesn't exist (0020 line ~109) — return
   `'quiz-not-found'` so the student sees the accurate message that already
   exists in `DENIED_COPY`.
4. **Payload trim:** the granted payload includes `shareToken` — drop it,
   the client already knows the token from the URL.
5. **Anti-cheat (optional, teacher toggle):** per-student question order
   shuffle — with Fix 7's `position` column, shuffle client-side with a seed
   derived from `student_id + quiz_id` so order is stable across refreshes but
   differs between students. Do NOT shuffle options (correct-index bugs risk);
   note option-shuffle as future work.

---

# Cross-cutting requirements

1. **Migrations:** 0029 (attempt sessions, atomic create, position, unbind,
   RPC recreates), 0030 (instructions, show_answers flag, review/stats RPCs) —
   renumber if the attendance plan already claimed these. Idempotent, with
   Problem/Fix headers.
2. **Security invariants (do not regress):** correct answers never reach an
   unauthenticated/student client except via `quiz_review` post-close; all
   grading server-side; all new RPCs `security definer` + `set search_path = public`
   + explicit `grant execute ... to authenticated`; owner checks inside every
   teacher RPC (`auth.uid()` vs quiz owner).
3. **Demo mode parity:** every `quizAccess` contract change mirrored in
   `localDemoMode.ts`.
4. **Tests:** extend `quizService.test.ts` / add tests for: remaining-time
   computation from `startedAt/serverNow`, unanswered-count logic, seed-shuffle
   determinism, CSV builder, WhatsApp message builder.
5. **Parsers:** `SubmitAttemptOutcome` / access-decision parsers in
   `src/data/access/parsers.ts` must learn the new statuses
   (`time-expired`, review payloads) — update `0025`-style specific errors
   consistently.
6. **Verify after each phase:** `npm run build` + test suite + manual flow:
   create scheduled quiz → student start → refresh (timer persists) → expiry
   reject → results/insights/export.

# Suggested order & sizing

| Phase | Fixes | Size |
|---|---|---|
| 1 | 1–4 (attempt integrity) | Large — RPC surgery, do alone, test hard |
| 2 | 5–10 (teacher control) | Medium-large — 6 & 7 together, then 5, 8, 9, 10 |
| 3 | 11–15 (results) | Medium |
| 4 | 16–19 (privacy, sharing, UX) | Small-medium batch |

Each phase = separate commit/PR.
