/**
 * Student quiz access & enrollment flow (task 17.2).
 *
 * This is the public, link-reached entry point for a student attempting a quiz
 * (Req 2.3). It composes the observable states of the roster-gated access
 * decision (`rosterService.resolveQuizAccess`, resolved server-side):
 *
 *  1. **Email required** — the student arrived via the shareable link and
 *     enters their registered email address.
 *  2. **OTP required** — the student verifies ownership of that email with a
 *     one-time code before any roster check happens.
 *  3. **Enrollment required** — a first-time student whose enrollment number is
 *     not yet stored. The view prompts for it **once** (Req 2.7), validating the
 *     format inline before resubmitting. A returning student whose enrollment is
 *     already stored never reaches this state, so the prompt is skipped
 *     entirely (Req 2.8) — the server resolves straight to granted/attempted.
 *  4. **Denied (not-registered)** — the email is not on the roster, or the
 *     enrollment number does not match. The view shows the English
 *     not-registered message (Req 2.6).
 *  5. **Already attempted** — a prior attempt exists; the view shows the English
 *     already-attempted message with the recorded score (Req 8.10).
 *  6. **Granted** — access is allowed; the answer-free quiz payload is handed to
 *     the {@link StudentQuizAccessViewProps.onGranted} render callback, which the
 *     quiz-attempt view (task 21.2) supplies. When no callback is given a simple
 *     confirmation is rendered.
 *
 * Access resolution is delegated to an injected `resolveAccess` function (the
 * Supabase-backed `rosterAccess`/`quizAccess` wrapper in production), so this
 * view performs no I/O of its own beyond the OTP calls it makes through
 * `useAuth()`.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '@presentation/auth/AuthContext';
import {
  isValidEnrollmentNumber,
  type QuizAccess,
  type QuizAccessDeniedReason,
  type QuizPayloadNoAnswers,
  type QuizAttemptSessionInfo,
} from '@domain/services/rosterService';
import { messages } from '@domain/shared/messages';
import type { QuizRosterOption } from '@data/access/quizAccess';
import { Button } from '@presentation/components/ui';

/** Metadata for the quiz title / section banner shown after authentication. */
export interface QuizMeta {
  title?: string;
  sectionNames?: string[];
}


/** Resolve quiz access for the signed-in student (server-side in production). */
export type ResolveQuizAccess = (
  quizId: string,
  providedEnrollment: string | null,
  providedEmail?: string | null,
) => Promise<QuizAccess>;

export type LoadQuizRosterOptions = (quizId: string, searchPrefix?: string) => Promise<QuizRosterOption[]>;

export interface StudentQuizAccessViewProps {
  /** The quiz the shareable link points to. */
  quizId: string;
  /** Resolves the gated access decision (defaults to the Supabase wrapper). */
  resolveAccess: ResolveQuizAccess;
  /** Loads the quiz section's safe roster choices for the enrollment prompt. */
  loadRosterOptions?: LoadQuizRosterOptions;
  /** Start a quiz attempt and return session info */
  startAttempt?: (quizId: string, email: string) => Promise<QuizAttemptSessionInfo>;
  /** Render the actual quiz taking interface when access is granted. */
  onGranted: (quiz: QuizPayloadNoAnswers, session: QuizAttemptSessionInfo, email: string) => ReactNode;
}

/** Internal phase machine for the access/enrollment flow. */
type Phase =
  | { kind: 'email-required'; submitting: boolean; error: string | null }
  | { kind: 'otp-required'; email: string; submitting: boolean; error: string | null }
  | { kind: 'resolving' }
  | { kind: 'enrollment-required'; email: string; submitting: boolean; error: string | null }
  | { kind: 'denied'; reason: QuizAccessDeniedReason }
  | { kind: 'already-attempted'; score: number; totalMarks: number }
  | { kind: 'granted'; quiz: QuizPayloadNoAnswers; session: QuizAttemptSessionInfo; preview: boolean; email: string };

/**
 * Specific title/body copy per denial reason. Exported so other student-facing
 * surfaces (e.g. {@link import('./QuizAttemptView').default}) that receive a
 * `SubmitAttemptDeniedReason` (a subset of this) show the exact same wording
 * instead of a generic fallback.
 */
export const DENIED_COPY: Record<QuizAccessDeniedReason, { title: string; body: string }> = {
  'not-authenticated': {
    title: 'Sign in required',
    body: 'Your sign-in session could not be verified. Please sign in again with Google.',
  },
  'quiz-not-found': {
    title: 'Quiz link not found',
    body: 'This quiz link is invalid or the quiz has been removed. Ask your teacher for a fresh link.',
  },
  'enrollment-not-found': {
    title: 'Enrollment not found',
    body: 'This enrollment number is not present in the quiz roster. Check the number or contact your teacher.',
  },
  'enrollment-already-bound': {
    title: 'Enrollment already linked',
    body: 'This enrollment number is already linked with another Google account. Ask your teacher to reset the binding.',
  },
  'wrong-section': {
    title: 'Wrong section for this quiz',
    body: 'Your enrollment belongs to a different section than this quiz. Ask your teacher for the correct quiz link.',
  },
  'not-registered': {
    title: 'Access not available',
    body: messages.auth.notRegistered,
  },
  'not-active': {
    title: 'Quiz not available',
    body: 'This quiz is not open right now. It may not have started yet or the deadline has passed.',
  },
  'time-expired': {
    title: 'Quiz time expired',
    body: 'The time allocated for this quiz has expired.',
  },
  'teacher-account': {
    title: 'Teacher accounts cannot attempt quizzes',
    body: 'This Google account is registered as a teacher and cannot self-register as a student. Sign in with your personal student account instead.',
  },
};

/** Shared shell every step of the flow renders inside — centered, branded, on the app's own background. */
function QuizShell({ children, quizMeta }: { children: ReactNode; quizMeta?: QuizMeta }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10 pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-card bg-accent text-lg font-semibold text-surface shadow-soft">
            Q
          </span>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Student Quiz Access</p>
        </div>
        {/* Quiz title / section banner — shown when quiz metadata is available */}
        {quizMeta?.title && (
          <div className="bg-accent-tint text-accent text-xs font-medium rounded-control px-3 py-2 mb-3 text-center break-words">
            {quizMeta.title}
            {/* TODO: Add section names when the student-facing access payload includes them */}
            {quizMeta.sectionNames && quizMeta.sectionNames.length > 0 && (
              <span className="block mt-0.5">This quiz is for: {quizMeta.sectionNames.join(', ')}</span>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** A small step tracker shown above the auth steps (email → verify → enrollment). */
function StepTracker({ step }: { step: 1 | 2 | 3 }) {
  const steps: Array<{ label: string }> = [
    { label: 'Email' },
    { label: 'Verify' },
    { label: 'Access' },
  ];
  return (
    <div className="mb-5 flex items-center justify-center gap-2" aria-hidden="true">
      {steps.map((s, i) => {
        const index = i + 1;
        const state = index < step ? 'done' : index === step ? 'active' : 'upcoming';
        return (
          <div key={s.label} className="flex items-center gap-2">
            <div
              className={
                state === 'done'
                  ? 'flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-surface'
                  : state === 'active'
                    ? 'flex h-6 w-6 items-center justify-center rounded-full border-2 border-accent text-[11px] font-semibold text-accent'
                    : 'flex h-6 w-6 items-center justify-center rounded-full border border-border text-[11px] font-semibold text-muted'
              }
            >
              {state === 'done' ? '✓' : index}
            </div>
            {index < steps.length && <div className={state === 'upcoming' ? 'h-px w-6 bg-border' : 'h-px w-6 bg-accent'} />}
          </div>
        );
      })}
    </div>
  );
}

const fieldLabelClass = 'block text-xs font-semibold uppercase tracking-wide text-muted';
const inputClass =
  'input mt-2 text-sm';

/** Student-facing quiz access gate with OTP verification and the one-time enrollment prompt. */
export default function StudentQuizAccessView({
  quizId,
  resolveAccess,
  loadRosterOptions,
  startAttempt,
  onGranted,
}: StudentQuizAccessViewProps) {
  const { actor, sendStudentEmailOtp, verifyStudentEmailOtp } = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: 'email-required', submitting: false, error: null });
  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [enrollmentInput, setEnrollmentInput] = useState('');
  /** Quiz metadata extracted from the granted/enrollment-required phase for the banner. */
  const [quizMeta, setQuizMeta] = useState<QuizMeta | undefined>(undefined);
  /** Autocomplete state for enrollment search. */
  const [rosterOptions, setRosterOptions] = useState<QuizRosterOption[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<number | null>(null);
  // Resend cooldown (in seconds) — prevents a student from spamming the OTP
  // endpoint by repeatedly clicking "Resend code", which would otherwise
  // flood their own inbox with codes. Supabase applies its own server-side
  // rate limit too; this is a client-side UX guard on top of that.
  const RESEND_COOLDOWN_SECONDS = 60;
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);
  const resendIntervalRef = useRef<number | null>(null);

  const startResendCooldown = useCallback(() => {
    if (resendIntervalRef.current !== null) {
      window.clearInterval(resendIntervalRef.current);
    }
    setResendSecondsLeft(RESEND_COOLDOWN_SECONDS);
    resendIntervalRef.current = window.setInterval(() => {
      setResendSecondsLeft((prev) => {
        if (prev <= 1) {
          if (resendIntervalRef.current !== null) {
            window.clearInterval(resendIntervalRef.current);
            resendIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Clean up the interval on unmount so it never fires after the component
  // is gone.
  useEffect(() => {
    return () => {
      if (resendIntervalRef.current !== null) {
        window.clearInterval(resendIntervalRef.current);
      }
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  /** Debounced roster search triggered on enrollment input change (3+ chars). */
  const searchRoster = useCallback(
    (value: string) => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
      const trimmed = value.trim();
      if (trimmed.length < 3 || !loadRosterOptions) {
        setRosterOptions([]);
        setShowDropdown(false);
        return;
      }
      debounceRef.current = window.setTimeout(() => {
        setRosterLoading(true);
        setShowDropdown(true);
        loadRosterOptions(quizId, trimmed)
          .then((options) => {
            setRosterOptions(options);
            setShowDropdown(true);
          })
          .catch(() => {
            setRosterOptions([]);
          })
          .finally(() => {
            setRosterLoading(false);
          });
      }, 300);
    },
    [loadRosterOptions, quizId],
  );

  const applyDecision = useCallback((decision: QuizAccess, email: string) => {
    switch (decision.status) {
      case 'granted':
        // Extract quiz metadata for the section/title banner
        if (decision.quiz.title) {
          setQuizMeta({ title: decision.quiz.title });
        }
        if (decision.preview || decision.attemptSession) {
          setPhase({
            kind: 'granted',
            quiz: decision.quiz,
            session: decision.attemptSession ?? { startedAt: '', serverNow: '', timeLimitMinutes: decision.quiz.timeLimitMinutes },
            preview: decision.preview === true,
            email,
          });
        } else if (startAttempt) {
          setPhase({
            kind: 'granted',
            quiz: decision.quiz,
            session: { startedAt: '', serverNow: '', timeLimitMinutes: decision.quiz.timeLimitMinutes }, // Placeholder until they click start
            preview: false,
            email,
          });
        } else {
          setPhase({ kind: 'denied', reason: 'not-authenticated' });
        }
        break;
      case 'enrollment-required':
      case 'needs-enrollment':
        // The server (all `request_quiz_access` migrations) returns
        // 'enrollment-required' for a first-time student whose enrollment
        // number isn't known yet. 'needs-enrollment' is kept as an alias in
        // case any caller still emits it, but it is never actually returned
        // by the current server-side function.
        setPhase({ kind: 'enrollment-required', email, submitting: false, error: null });
        break;
      case 'already-attempted':
        setPhase({
          kind: 'already-attempted',
          score: decision.result.score,
          totalMarks: decision.result.totalMarks,
        });
        break;
      case 'denied':
        setPhase({ kind: 'denied', reason: decision.reason });
        break;
      default:
        setPhase({ kind: 'denied', reason: 'not-registered' });
        break;
    }
  }, [startAttempt]);

  // If a teacher visits, they might get preview access immediately.
  useEffect(() => {
    if (actor.kind !== 'teacher') {
      return;
    }
    let active = true;
    setPhase({ kind: 'resolving' });
    void resolveAccess(quizId, null)
      .then((decision) => {
        if (active) {
          applyDecision(decision, '');
        }
      })
      .catch(() => {
        if (active) {
          setPhase({ kind: 'denied', reason: 'not-registered' });
        }
      });
    return () => {
      active = false;
    };
  }, [actor.kind, quizId, resolveAccess, applyDecision]);

  async function submitEmail(value: string) {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === '' || !trimmed.includes('@')) {
      setPhase({
        kind: 'email-required',
        submitting: false,
        error: 'Please enter a valid email address.',
      });
      return;
    }
    setPhase({ kind: 'email-required', submitting: true, error: null });
    try {
      // Verify the student actually owns this email via a one-time code
      // before resolving roster access with it.
      const result = await sendStudentEmailOtp(trimmed);
      if (result.ok) {
        setOtpInput('');
        startResendCooldown();
        setPhase({ kind: 'otp-required', email: trimmed, submitting: false, error: null });
      } else {
        setPhase({
          kind: 'email-required',
          submitting: false,
          error: result.error.message,
        });
      }
    } catch {
      setPhase({
        kind: 'email-required',
        submitting: false,
        error: messages.error.generic,
      });
    }
  }

  /** Resend the OTP to the same email, subject to the client-side cooldown. */
  async function resendOtp(email: string) {
    if (resendSecondsLeft > 0) {
      return;
    }
    setPhase({ kind: 'otp-required', email, submitting: false, error: null });
    try {
      const result = await sendStudentEmailOtp(email);
      if (result.ok) {
        setOtpInput('');
        startResendCooldown();
        setPhase({ kind: 'otp-required', email, submitting: false, error: null });
      } else {
        setPhase({
          kind: 'otp-required',
          email,
          submitting: false,
          error: result.error.message,
        });
      }
    } catch {
      setPhase({
        kind: 'otp-required',
        email,
        submitting: false,
        error: messages.error.generic,
      });
    }
  }

  async function submitOtp(email: string, code: string) {
    const trimmed = code.trim();
    if (trimmed === '') {
      setPhase({
        kind: 'otp-required',
        email,
        submitting: false,
        error: 'Please enter the code sent to your email.',
      });
      return;
    }
    setPhase({ kind: 'otp-required', email, submitting: true, error: null });
    try {
      const verified = await verifyStudentEmailOtp(email, trimmed);
      if (!verified.ok) {
        setPhase({
          kind: 'otp-required',
          email,
          submitting: false,
          error: verified.error.message,
        });
        return;
      }
      // Email ownership confirmed — now resolve roster access as before.
      const decision = await resolveAccess(quizId, null, email);
      applyDecision(decision, email);
    } catch {
      setPhase({
        kind: 'otp-required',
        email,
        submitting: false,
        error: messages.error.generic,
      });
    }
  }

  async function submitEnrollment(email: string, value: string) {
    const trimmed = value.trim();
    if (!isValidEnrollmentNumber(trimmed)) {
      setPhase({
        kind: 'enrollment-required',
        email,
        submitting: false,
        error: messages.validation.enrollmentNumberInvalid,
      });
      return;
    }
    setPhase({ kind: 'enrollment-required', email, submitting: true, error: null });
    try {
      const decision = await resolveAccess(quizId, trimmed, email);
      applyDecision(decision, email);
    } catch {
      setPhase({
        kind: 'enrollment-required',
        email,
        submitting: false,
        error: messages.error.generic,
      });
    }
  }

  function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitEmail(emailInput);
  }

  function handleOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase.kind === 'otp-required') {
      void submitOtp(phase.email, otpInput);
    }
  }

  function handleEnrollmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase.kind === 'enrollment-required') {
      void submitEnrollment(phase.email, enrollmentInput);
    }
  }

  switch (phase.kind) {
    case 'resolving':
      return (
        <QuizShell>
          <div className="card items-center p-8 text-center">
            <span className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
            <h1 className="mt-4 text-lg font-semibold text-text">Checking access…</h1>
            <p className="mt-1 text-sm text-soft">One moment while we verify your details.</p>
          </div>
        </QuizShell>
      );

    case 'email-required': {
      return (
        <QuizShell>
          <StepTracker step={1} />
          <div className="card">
            <h1 className="text-xl font-semibold text-text">Welcome</h1>
            <p className="mt-1 text-sm text-soft">Enter your registered email address to begin the quiz.</p>

            <form className="mt-5 flex flex-col gap-4" onSubmit={handleEmailSubmit} noValidate>
              <div>
                <label htmlFor="email" className={fieldLabelClass}>
                  Email <span className="text-status-red">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className={inputClass}
                  placeholder="you@college.edu"
                />
                {phase.error !== null && (
                  <p role="alert" className="mt-2 text-xs font-medium text-status-red">
                    {phase.error}
                  </p>
                )}
              </div>

              <Button type="submit" variant="primary" loading={phase.submitting} disabled={emailInput.trim() === ''} className="w-full">
                {phase.submitting ? 'Sending code…' : 'Continue'}
              </Button>
            </form>
          </div>
          <p className="mt-4 text-center text-xs text-muted">
            We'll send a one-time code to confirm this is your email.
          </p>
        </QuizShell>
      );
    }

    case 'otp-required': {
      return (
        <QuizShell>
          <StepTracker step={2} />
          <div className="card">
            <h1 className="text-xl font-semibold text-text">Check your email</h1>
            <p className="mt-1 text-sm text-soft">
              We sent a 6-digit code to <span className="font-medium text-text">{phase.email}</span>.
            </p>

            <form className="mt-5 flex flex-col gap-4" onSubmit={handleOtpSubmit} noValidate>
              <div>
                <label htmlFor="otp-code" className={fieldLabelClass}>
                  Verification code <span className="text-status-red">*</span>
                </label>
                <input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  className={inputClass + ' text-center text-lg tracking-[0.5em]'}
                  placeholder="••••••"
                  maxLength={6}
                />
                {phase.error !== null && (
                  <p role="alert" className="mt-2 text-xs font-medium text-status-red">
                    {phase.error}
                  </p>
                )}
              </div>

              <Button type="submit" variant="primary" loading={phase.submitting} disabled={otpInput.trim() === ''} className="w-full">
                {phase.submitting ? 'Verifying…' : 'Verify'}
              </Button>

              <button
                type="button"
                onClick={() => void resendOtp(phase.email)}
                disabled={phase.submitting || resendSecondsLeft > 0}
                className="text-center text-xs font-medium text-accent transition-colors hover:text-accent-hover disabled:cursor-not-allowed disabled:text-muted"
              >
                {resendSecondsLeft > 0 ? `Resend code in ${resendSecondsLeft}s` : 'Resend code'}
              </button>
            </form>
          </div>
        </QuizShell>
      );
    }

    case 'enrollment-required': {
      return (
        <QuizShell quizMeta={quizMeta}>
          <StepTracker step={3} />
          <div className="card">
            <h1 className="text-xl font-semibold text-text">Confirm your identity</h1>
            <p className="mt-1 text-sm text-soft">
              This looks like your first time here. Enter your enrollment number to link it with this email.
            </p>

            <form className="mt-5 flex flex-col gap-4" onSubmit={handleEnrollmentSubmit} noValidate>
              <div className="relative">
                <label htmlFor="enrollment-number" className={fieldLabelClass}>
                  Enrollment number <span className="text-status-red">*</span>
                </label>
                <input
                  id="enrollment-number"
                  type="text"
                  autoComplete="off"
                  autoFocus
                  value={enrollmentInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEnrollmentInput(val);
                    searchRoster(val);
                  }}
                  onFocus={() => {
                    if (rosterOptions.length > 0) setShowDropdown(true);
                  }}
                  onBlur={() => {
                    // Delay hiding so click on dropdown option registers
                    window.setTimeout(() => setShowDropdown(false), 200);
                  }}
                  className={inputClass}
                  placeholder="Type last 3 digits (e.g. 005)"
                />
                <p className="mt-1 text-[11px] text-muted">
                  Type at least 3 characters to search, or enter your full enrollment number.
                </p>
                {/* Autocomplete dropdown */}
                {showDropdown && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-control border border-border bg-surface shadow-soft overflow-hidden">
                    {rosterLoading ? (
                      <div className="flex items-center justify-center px-3 py-3">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                        <span className="ml-2 text-xs text-muted">Searching…</span>
                      </div>
                    ) : rosterOptions.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-muted text-center">
                        No students found
                      </div>
                    ) : (
                      <ul role="listbox" className="max-h-48 overflow-y-auto">
                        {rosterOptions.map((opt) => (
                          <li
                            key={opt.enrollmentNumber}
                            role="option"
                            aria-selected={false}
                            className="cursor-pointer px-3 py-2.5 text-sm text-text hover:bg-surface-muted transition-colors min-h-[44px] flex items-center"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setEnrollmentInput(opt.enrollmentNumber);
                              setShowDropdown(false);
                              setRosterOptions([]);
                              // Auto-submit after selecting
                              void submitEnrollment(phase.email, opt.enrollmentNumber);
                            }}
                          >
                            <span className="break-words">
                              {opt.name} <span className="text-muted">— {opt.enrollmentNumber}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {phase.error !== null && (
                  <p role="alert" className="mt-2 text-xs font-medium text-status-red">
                    {phase.error}
                  </p>
                )}
              </div>

              <Button type="submit" variant="primary" loading={phase.submitting} disabled={enrollmentInput.trim() === ''} className="w-full">
                {phase.submitting ? 'Checking…' : 'Continue'}
              </Button>
            </form>
          </div>
        </QuizShell>
      );
    }

    case 'denied':
      return (
        <QuizShell>
          <div className="card text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-red/10 text-2xl text-status-red" aria-hidden="true">
              ✕
            </span>
            <h1 className="mt-4 text-lg font-semibold text-text">{DENIED_COPY[phase.reason].title}</h1>
            <p className="mt-2 text-sm text-soft">{DENIED_COPY[phase.reason].body}</p>
          </div>
        </QuizShell>
      );

    case 'already-attempted':
      return (
        <QuizShell>
          <div className="card text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-green/10 text-2xl text-status-green" aria-hidden="true">
              ✓
            </span>
            <h1 className="mt-4 text-lg font-semibold text-text">Attempt already submitted</h1>
            <p className="mt-2 text-sm text-soft">{messages.auth.alreadyAttempted}</p>
            <div className="mt-5 rounded-control border border-border bg-surface-muted px-4 py-3">
              <p className="text-2xl font-semibold text-accent">
                {phase.score} <span className="text-base font-normal text-muted">/ {phase.totalMarks}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted">Your recorded score</p>
            </div>
          </div>
        </QuizShell>
      );

    case 'granted':
      // Teacher preview: show the questions read-only (no attempt/submit), so
      // the owner can verify what students will see.
      if (phase.preview) {
        return (
          <div className="min-h-screen bg-background px-4 py-10">
            <div className="mx-auto w-full max-w-3xl">
              <div className="mb-4 rounded-card border border-accent/30 bg-accent-tint px-4 py-3 text-sm font-medium text-accent">
                Teacher preview — this is exactly what students will see. Answers are hidden and no
                attempt is recorded.
              </div>
              <div className="card">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {phase.quiz.questions.length} questions · {phase.quiz.timeLimitMinutes} min
                </p>
                <ol className="mt-4 flex flex-col gap-4">
                  {phase.quiz.questions.map((q, i) => (
                    <li key={q.id} className="rounded-control border border-border bg-surface-muted/40 p-5 text-left">
                      <p className="text-sm font-medium text-text">
                        {i + 1}. {q.text}
                      </p>
                      <ul className="mt-3 flex flex-col gap-2">
                        {q.options.map((opt, oi) => (
                          <li key={oi} className="flex items-center gap-3 text-sm text-soft">
                            <input type="radio" disabled className="h-4 w-4 accent-accent" />
                            {opt}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        );
      }

      // If we don't have a started session yet, prompt them to start
      if (!phase.session.startedAt) {
        return (
          <QuizShell quizMeta={quizMeta}>
            <div className="card text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-green/10 text-2xl text-status-green" aria-hidden="true">
                ✓
              </span>
              <h1 className="mt-4 text-lg font-semibold text-text break-words">
                {phase.quiz.title ?? 'You have been granted access'}
              </h1>
              <p className="mt-2 text-sm text-soft break-words">
                {phase.quiz.questions.length} questions · {phase.quiz.timeLimitMinutes} minute time limit. The
                timer starts as soon as you click "Start Quiz" — make sure you're ready before continuing.
              </p>
              <Button
                type="button"
                variant="primary"
                className="mt-5 w-full"
                onClick={() => {
                  if (startAttempt) {
                    // Use the actual quiz.id (from resolveAccess response), not
                    // the URL share-token — start_quiz_attempt(uuid) looks up by
                    // primary key, not by share_token.
                    startAttempt(phase.quiz.id, phase.email)
                      .then((session) => {
                        setPhase({ ...phase, session });
                      })
                      .catch((err) => {
                        console.error('[StartQuiz] startAttempt failed:', err);
                        setPhase({ kind: 'denied', reason: 'not-authenticated' });
                      });
                  }
                }}
              >
                Start Quiz
              </Button>
            </div>
          </QuizShell>
        );
      }

      return (
        <>
          {onGranted ? (
            onGranted(phase.quiz, phase.session, phase.email)
          ) : (
            <QuizShell quizMeta={quizMeta}>
              <div className="card text-center">
                <h1 className="text-lg font-semibold text-text">Access granted</h1>
                <p className="mt-2 text-sm text-soft">You may now attempt the quiz.</p>
              </div>
            </QuizShell>
          )}
        </>
      );

    default:
      return null;
  }
}
