/**
 * Student quiz access & enrollment flow (task 17.2).
 *
 * This is the public, link-reached entry point for a student attempting a quiz
 * (Req 2.3). It composes the four observable states of the roster-gated access
 * decision (`rosterService.resolveQuizAccess`, resolved server-side):
 *
 *  1. **Anonymous** — the student arrived via the shareable link but has not
 *     signed in. The view offers a Google sign-in button (Req 2.3); the Google
 *     profile supplies the name/email automatically on return (Req 2.4).
 *  2. **Enrollment required** — a first-time student whose enrollment number is
 *     not yet stored. The view prompts for it **once** (Req 2.7), validating the
 *     format inline before resubmitting. A returning student whose enrollment is
 *     already stored never reaches this state, so the prompt is skipped
 *     entirely (Req 2.8) — the server resolves straight to granted/attempted.
 *  3. **Denied (not-registered)** — the email is not on the roster, or the
 *     enrollment number does not match. The view shows the English
 *     not-registered message (Req 2.6).
 *  4. **Already attempted** — a prior attempt exists; the view shows the English
 *     already-attempted message with the recorded score (Req 8.10).
 *  5. **Granted** — access is allowed; the answer-free quiz payload is handed to
 *     the {@link StudentQuizAccessViewProps.onGranted} render callback, which the
 *     quiz-attempt view (task 21.2) supplies. When no callback is given a simple
 *     confirmation is rendered.
 *
 * Access resolution is delegated to an injected `resolveAccess` function (the
 * Supabase-backed `rosterAccess`/`quizAccess` wrapper in production), so this
 * view performs no I/O of its own beyond initiating Google OAuth.
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



/** Student-facing quiz access gate with the one-time enrollment prompt. */
export default function StudentQuizAccessView({
  quizId,
  resolveAccess,
  startAttempt,
  onGranted,
}: StudentQuizAccessViewProps) {
  const { actor, sendStudentEmailOtp, verifyStudentEmailOtp } = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: 'email-required', submitting: false, error: null });
  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [enrollmentInput, setEnrollmentInput] = useState('');
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
    };
  }, []);

  const applyDecision = useCallback((decision: QuizAccess, email: string) => {
    switch (decision.status) {
      case 'granted':
        if (decision.preview || decision.attemptSession) {
          setPhase({ 
            kind: 'granted', 
            quiz: decision.quiz, 
            session: decision.attemptSession ?? { startedAt: '', serverNow: '', timeLimitMinutes: decision.quiz.timeLimitMinutes },
            preview: decision.preview === true,
            email 
          });
        } else if (startAttempt) {
          setPhase({
            kind: 'granted',
            quiz: decision.quiz,
            session: { startedAt: '', serverNow: '', timeLimitMinutes: decision.quiz.timeLimitMinutes }, // Placeholder until they click start
            preview: false,
            email
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
  }, []);

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

  const inputClass =
    'w-full border-b-2 border-border bg-transparent px-1 py-2 text-sm text-text ' +
    'placeholder:text-muted focus:border-[#5746e3] focus:outline-none transition-colors';

  const formCardClass = "w-full max-w-3xl overflow-hidden rounded-lg bg-surface shadow-md";

  switch (phase.kind) {
    case 'resolving':
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#f0ebf8] px-4 py-10">
          <div className={formCardClass}>
            <div className="h-2 w-full bg-[#5746e3]"></div>
            <div className="p-6">
              <h1 className="text-2xl font-normal text-text">Checking access...</h1>
              <p className="mt-2 text-sm text-soft">One moment while we verify your details.</p>
            </div>
          </div>
        </div>
      );

    case 'email-required': {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#f0ebf8] px-4 py-10">
          <div className={formCardClass}>
            <div className="h-2 w-full bg-[#5746e3]"></div>
            <div className="p-6">
              <h1 className="text-3xl font-normal text-text">Computer Org. &amp; Architecture</h1>
              <p className="mt-3 text-sm text-text">
                Welcome! Please enter your registered email address to begin the quiz.
              </p>
            </div>
          </div>
          
          <form className="mt-4 flex w-full max-w-3xl flex-col gap-4 text-left" onSubmit={handleEmailSubmit} noValidate>
            <div className="rounded-lg bg-surface p-6 shadow-md">
              <label htmlFor="email" className="block text-sm font-medium text-text">
                Email <span className="text-status-red">*</span>
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className={inputClass + " mt-4"}
                placeholder="Your email"
              />
              {phase.error !== null && (
                <p role="alert" className="mt-2 text-xs font-medium text-status-red">
                  {phase.error}
                </p>
              )}
            </div>
            
            <div className="flex justify-between items-center mt-2">
              <button
                type="submit"
                className="rounded px-6 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#5746e3' }}
                disabled={phase.submitting || emailInput.trim() === ''}
              >
                {phase.submitting ? 'Checking…' : 'Next'}
              </button>
            </div>
          </form>
        </div>
      );
    }

    case 'otp-required': {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#f0ebf8] px-4 py-10">
          <div className={formCardClass}>
            <div className="h-2 w-full bg-[#5746e3]"></div>
            <div className="p-6">
              <h1 className="text-3xl font-normal text-text">Computer Org. &amp; Architecture</h1>
              <p className="mt-3 text-sm text-text">
                We sent a verification code to <strong>{phase.email}</strong>. Enter it below to confirm
                it's really you.
              </p>
            </div>
          </div>

          <form className="mt-4 flex w-full max-w-3xl flex-col gap-4 text-left" onSubmit={handleOtpSubmit} noValidate>
            <div className="rounded-lg bg-surface p-6 shadow-md">
              <label htmlFor="otp-code" className="block text-sm font-medium text-text">
                Verification code <span className="text-status-red">*</span>
              </label>
              <input
                id="otp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value)}
                className={inputClass + " mt-4"}
                placeholder="123456"
              />
              {phase.error !== null && (
                <p role="alert" className="mt-2 text-xs font-medium text-status-red">
                  {phase.error}
                </p>
              )}
            </div>

            <div className="flex justify-between items-center mt-2">
              <button
                type="submit"
                className="rounded px-6 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#5746e3' }}
                disabled={phase.submitting || otpInput.trim() === ''}
              >
                {phase.submitting ? 'Verifying…' : 'Verify'}
              </button>
              <button
                type="button"
                onClick={() => void resendOtp(phase.email)}
                disabled={phase.submitting || resendSecondsLeft > 0}
                className="text-sm font-medium text-[#5746e3] transition-colors disabled:opacity-50 disabled:text-muted"
              >
                {resendSecondsLeft > 0 ? `Resend code in ${resendSecondsLeft}s` : 'Resend code'}
              </button>
            </div>
          </form>
        </div>
      );
    }

    case 'enrollment-required': {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#f0ebf8] px-4 py-10">
          <div className={formCardClass}>
            <div className="h-2 w-full bg-[#5746e3]"></div>
            <div className="p-6">
              <h1 className="text-3xl font-normal text-text">Computer Org. &amp; Architecture</h1>
              <p className="mt-3 text-sm text-text">
                Please enter your enrollment number to confirm your identity.
              </p>
            </div>
          </div>
          
          <form className="mt-4 flex w-full max-w-3xl flex-col gap-4 text-left" onSubmit={handleEnrollmentSubmit} noValidate>
            <div className="rounded-lg bg-surface p-6 shadow-md">
              <label htmlFor="enrollment-number" className="block text-sm font-medium text-text">
                Enrollment Number <span className="text-status-red">*</span>
              </label>
              <input
                id="enrollment-number"
                type="text"
                autoComplete="off"
                value={enrollmentInput}
                onChange={(e) => setEnrollmentInput(e.target.value)}
                className={inputClass + " mt-4"}
                placeholder="0131CS241000"
              />
              {phase.error !== null && (
                <p role="alert" className="mt-2 text-xs font-medium text-status-red">
                  {phase.error}
                </p>
              )}
            </div>
            
            <div className="flex justify-between items-center mt-2">
              <button
                type="submit"
                className="rounded px-6 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#5746e3' }}
                disabled={phase.submitting || enrollmentInput.trim() === ''}
              >
                {phase.submitting ? 'Checking…' : 'Next'}
              </button>
            </div>
          </form>
        </div>
      );
    }

    case 'denied':
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#f0ebf8] px-4 py-10">
          <div className={formCardClass}>
            <div className="h-2 w-full bg-[#5746e3]"></div>
            <div className="p-6">
              <h1 className="text-2xl font-normal text-text">{DENIED_COPY[phase.reason].title}</h1>
              <p className="mt-3 text-sm text-status-red">
                {DENIED_COPY[phase.reason].body}
              </p>
            </div>
          </div>
        </div>
      );

    case 'already-attempted':
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#f0ebf8] px-4 py-10">
          <div className={formCardClass}>
            <div className="h-2 w-full bg-[#5746e3]"></div>
            <div className="p-6">
              <h1 className="text-2xl font-normal text-text">Attempt already submitted</h1>
              <p className="mt-3 text-sm text-text">{messages.auth.alreadyAttempted}</p>
              <div className="mt-6 rounded-lg bg-surface-muted p-4 border border-border">
                <p className="font-medium text-text">
                  Your score: {phase.score} / {phase.totalMarks}
                </p>
              </div>
            </div>
          </div>
        </div>
      );

    case 'granted':
      // Teacher preview: show the questions read-only (no attempt/submit), so
      // the owner can verify what students will see.
      if (phase.preview) {
        return (
          <div className="min-h-screen bg-[#f0ebf8] px-4 py-10">
            <div className="mx-auto w-full max-w-3xl">
              <div className="mb-4 rounded-card border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
                Teacher preview — this is exactly what students will see. Answers are hidden and no
                attempt is recorded.
              </div>
              <div className="card p-6 shadow-md border-t-8 border-t-[#5746e3]">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {phase.quiz.questions.length} questions · {phase.quiz.timeLimitMinutes} min
                </p>
                <ol className="mt-4 flex flex-col gap-5">
                  {phase.quiz.questions.map((q: any, i: number) => (
                    <li key={q.id} className="text-left rounded-lg bg-surface p-6 shadow-sm border border-border">
                      <p className="text-base text-text">
                        {i + 1}. {q.text}
                      </p>
                      <ul className="mt-4 flex flex-col gap-3">
                        {q.options.map((opt: string, oi: number) => (
                          <li
                            key={oi}
                            className="flex items-center gap-3 text-sm text-text"
                          >
                            <input type="radio" disabled className="h-4 w-4 text-[#5746e3]" />
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
          <div className="flex min-h-screen flex-col items-center justify-center bg-[#f0ebf8] px-4 py-10">
            <div className={formCardClass}>
              <div className="h-2 w-full bg-[#5746e3]"></div>
              <div className="p-6">
                <h1 className="text-3xl font-normal text-text">Computer Org. &amp; Architecture</h1>
                <p className="mt-3 text-sm text-text font-medium">
                  Welcome! You have been granted access.
                </p>
                <p className="mt-1 text-sm text-soft">
                  Time limit: {phase.quiz.timeLimitMinutes} minutes. The timer will start as soon as you click "Start Quiz".
                </p>
              </div>
            </div>
            
            <div className="mt-4 flex w-full max-w-3xl justify-end">
              <button
                type="button"
                className="rounded px-6 py-2 text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: '#5746e3' }}
                onClick={() => {
                  if (startAttempt) {
                    startAttempt(quizId, phase.email).then(session => {
                      setPhase({ ...phase, session });
                    }).catch(() => {
                      setPhase({ kind: 'denied', reason: 'not-authenticated' });
                    });
                  }
                }}
              >
                Start Quiz
              </button>
            </div>
          </div>
        );
      }
      
      return (
        <>
          {onGranted ? (
            onGranted(phase.quiz, phase.session, phase.email)
          ) : (
            <div className="flex min-h-screen flex-col items-center justify-center bg-[#f0ebf8] px-4 py-10">
              <div className={formCardClass}>
                <div className="h-2 w-full bg-[#5746e3]"></div>
                <div className="p-6">
                  <h1 className="text-2xl font-normal text-text">Access granted</h1>
                  <p className="mt-3 text-sm text-text">You may now attempt the quiz.</p>
                </div>
              </div>
            </div>
          )}
        </>
      );

    default:
      return null;
  }
}
