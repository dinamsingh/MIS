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

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '@presentation/auth/AuthContext';
import {
  isValidEnrollmentNumber,
  type QuizAccess,
  type QuizPayloadNoAnswers,
} from '@domain/services/rosterService';
import { messages } from '@domain/shared/messages';

/** Resolve quiz access for the signed-in student (server-side in production). */
export type ResolveQuizAccess = (
  quizId: string,
  providedEnrollment: string | null,
) => Promise<QuizAccess>;

export interface StudentQuizAccessViewProps {
  /** The quiz the shareable link points to. */
  quizId: string;
  /** Resolves the gated access decision (defaults to the Supabase wrapper). */
  resolveAccess: ResolveQuizAccess;
  /** Renders the attempt UI once access is granted (task 21.2 supplies this). */
  onGranted?: (quiz: QuizPayloadNoAnswers) => ReactNode;
}

/** Internal phase machine for the access/enrollment flow. */
type Phase =
  | { kind: 'resolving' }
  | { kind: 'enrollment-required'; submitting: boolean; error: string | null }
  | { kind: 'denied' }
  | { kind: 'already-attempted'; score: number; totalMarks: number }
  | { kind: 'granted'; quiz: QuizPayloadNoAnswers };

/** Card wrapper shared by every message/prompt state. */
function AccessCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="card w-full max-w-sm p-6 text-center">
        <h1 className="text-lg font-semibold text-text">{title}</h1>
        <div className="mt-3 text-sm text-soft">{children}</div>
      </div>
    </div>
  );
}

/** Student-facing quiz access gate with the one-time enrollment prompt. */
export default function StudentQuizAccessView({
  quizId,
  resolveAccess,
  onGranted,
}: StudentQuizAccessViewProps) {
  const { actor, isLoading, signInWithGoogle } = useAuth();
  const [phase, setPhase] = useState<Phase>({ kind: 'resolving' });
  const [enrollmentInput, setEnrollmentInput] = useState('');

  // Map an access decision onto the phase machine.
  const applyDecision = useCallback((decision: QuizAccess) => {
    switch (decision.status) {
      case 'granted':
        setPhase({ kind: 'granted', quiz: decision.quiz });
        break;
      case 'enrollment-required':
        setPhase({ kind: 'enrollment-required', submitting: false, error: null });
        break;
      case 'already-attempted':
        setPhase({
          kind: 'already-attempted',
          score: decision.result.score,
          totalMarks: decision.result.totalMarks,
        });
        break;
      case 'denied':
      default:
        setPhase({ kind: 'denied' });
        break;
    }
  }, []);

  // Once the student is signed in, resolve access with no provided enrollment.
  // A returning student's stored enrollment is applied server-side, so this
  // first resolution skips the prompt for them (Req 2.8); a first-time student
  // resolves to `enrollment-required` and is prompted once (Req 2.7).
  useEffect(() => {
    if (isLoading || actor.kind !== 'student') {
      return;
    }
    let active = true;
    setPhase({ kind: 'resolving' });
    void resolveAccess(quizId, null)
      .then((decision) => {
        if (active) {
          applyDecision(decision);
        }
      })
      .catch(() => {
        if (active) {
          setPhase({ kind: 'denied' });
        }
      });
    return () => {
      active = false;
    };
  }, [actor.kind, isLoading, quizId, resolveAccess, applyDecision]);

  async function handleEnrollmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = enrollmentInput.trim();
    // Validate the format inline before resubmitting (Req 2.2 pattern reuse).
    if (!isValidEnrollmentNumber(trimmed)) {
      setPhase({
        kind: 'enrollment-required',
        submitting: false,
        error: messages.validation.enrollmentNumberInvalid,
      });
      return;
    }
    setPhase({ kind: 'enrollment-required', submitting: true, error: null });
    try {
      const decision = await resolveAccess(quizId, trimmed);
      applyDecision(decision);
    } catch {
      setPhase({
        kind: 'enrollment-required',
        submitting: false,
        error: messages.error.generic,
      });
    }
  }

  // Still restoring the session: render nothing to avoid a flash.
  if (isLoading) {
    return null;
  }

  // Anonymous visitor arriving via the shareable link: offer Google sign-in.
  if (actor.kind !== 'student') {
    return (
      <AccessCard title="Sign in to attempt this quiz">
        <p>Sign in with Google to continue. Your name and email are captured automatically.</p>
        <button
          type="button"
          className="btn-primary mt-4 w-full"
          onClick={() => void signInWithGoogle('student')}
        >
          Continue with Google
        </button>
      </AccessCard>
    );
  }

  switch (phase.kind) {
    case 'resolving':
      return (
        <AccessCard title="Checking your access…">
          <p>One moment while we verify your enrollment.</p>
        </AccessCard>
      );

    case 'enrollment-required': {
      const inputClass =
        'w-full rounded-button border border-border bg-surface px-3 py-2 text-sm text-text ' +
        'placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';
      return (
        <AccessCard title="Enter your enrollment number">
          <p>Enter your enrollment number once to continue. We will remember it next time.</p>
          <form className="mt-4 flex flex-col gap-3 text-left" onSubmit={handleEnrollmentSubmit} noValidate>
            <label htmlFor="enrollment-number" className="text-sm font-medium text-text">
              Enrollment number
            </label>
            <input
              id="enrollment-number"
              type="text"
              autoComplete="off"
              value={enrollmentInput}
              onChange={(e) => setEnrollmentInput(e.target.value)}
              className={inputClass}
              placeholder="0131CS241000"
            />
            {phase.error !== null && (
              <p role="alert" className="text-sm font-medium text-red">
                {phase.error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={phase.submitting}>
              {phase.submitting ? 'Checking…' : 'Continue'}
            </button>
          </form>
        </AccessCard>
      );
    }

    case 'denied':
      return (
        <AccessCard title="Access not available">
          <p role="alert">{messages.auth.notRegistered}</p>
        </AccessCard>
      );

    case 'already-attempted':
      return (
        <AccessCard title="Attempt already submitted">
          <p role="alert">{messages.auth.alreadyAttempted}</p>
          <p className="mt-2 font-medium text-text">
            Your score: {phase.score} / {phase.totalMarks}
          </p>
        </AccessCard>
      );

    case 'granted':
      return (
        <>
          {onGranted ? (
            onGranted(phase.quiz)
          ) : (
            <AccessCard title="Access granted">
              <p>You may now attempt the quiz.</p>
            </AccessCard>
          )}
        </>
      );

    default:
      return null;
  }
}
