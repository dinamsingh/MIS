/**
 * Student quiz attempt view (task 21.2).
 *
 * Renders the quiz-taking experience once access has been granted by the
 * {@link StudentQuizAccessView}. The component receives the answer-free quiz
 * payload (`QuizPayloadNoAnswers`) and implements:
 *
 *  - **Remaining-time countdown** displayed prominently, ticking down each
 *    second from the quiz's configured time limit (Req 8.7).
 *  - **Option selection** per question via radio inputs.
 *  - **Auto-submit on timer expiry** — when remaining time reaches zero the
 *    current answers are submitted automatically (Req 8.7).
 *  - **Manual submit** — a button the student may press at any time.
 *  - **Score display** — after submission the student sees their score out of
 *    the total (Req 8.9).
 *  - **Already-attempted handling** — if the server returns `already-attempted`
 *    on submit (race condition or replay), the existing result is shown with the
 *    `messages.auth.alreadyAttempted` message (Req 8.10).
 *
 * Grading and single-attempt enforcement happen server-side via the
 * `submit_attempt` RPC function; this view never receives correct answers.
/**
 * Student quiz attempt view (task 21.2).
 *
 * Renders the quiz-taking experience once access has been granted by the
 * {@link StudentQuizAccessView}. The component receives the answer-free quiz
 * payload (`QuizPayloadNoAnswers`) and implements:
 *
 *  - **Remaining-time countdown** displayed prominently, ticking down each
 *    second from the quiz's configured time limit (Req 8.7).
 *  - **Option selection** per question via radio inputs.
 *  - **Auto-submit on timer expiry** — when remaining time reaches zero the
 *    current answers are submitted automatically (Req 8.7).
 *  - **Manual submit** — a button the student may press at any time.
 *  - **Score display** — after submission the student sees their score out of
 *    the total (Req 8.9).
 *  - **Already-attempted handling** — if the server returns `already-attempted`
 *    on submit (race condition or replay), the existing result is shown with the
 *    `messages.auth.alreadyAttempted` message (Req 8.10).
 *
 * Grading and single-attempt enforcement happen server-side via the
 * `submit_attempt` RPC function; this view never receives correct answers.
 *
 * _Requirements: 8.7, 8.9, 8.10_
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QuizAttemptSessionInfo, QuizPayloadNoAnswers } from '@domain/services/rosterService';
import type { SubmitAttemptOutcome } from '@data/access/parsers';
import { messages } from '@domain/shared/messages';
import { DENIED_COPY } from './StudentQuizAccessView';
import { Button } from '@presentation/components/ui';
import { useAuth } from "@presentation/auth/AuthContext";

/** The function that submits an attempt to the server (RPC wrapper). */
export type SubmitAttemptFn = (
  quizId: string,
  answers: Record<string, number>,
  email: string,
) => Promise<SubmitAttemptOutcome>;

export interface QuizAttemptViewProps {
  /** The answer-free quiz payload received from the access gate. */
  quiz: QuizPayloadNoAnswers;
  /** Server-authoritative timer session. */
  attemptSession: QuizAttemptSessionInfo;
  /** Submits the attempt server-side and returns the outcome. */
  /** Submits the attempt server-side and returns the outcome. */
  submitAttempt: SubmitAttemptFn;
  /** The email used to start the session */
  email: string;
}

/** Phase machine for the attempt lifecycle. */
type AttemptPhase =
  | { kind: 'in-progress' }
  | { kind: 'submitting'; auto?: boolean }
  | { kind: 'scored'; score: number; totalMarks: number; auto?: boolean }
  | { kind: 'already-attempted'; score: number; totalMarks: number }
  | { kind: 'error'; message: string; retryable: boolean };

/** Format remaining seconds as MM:SS. */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function remainingFromSession(session: QuizAttemptSessionInfo): number {
  const startedAt = new Date(session.startedAt).getTime();
  const serverNow = new Date(session.serverNow).getTime();
  const limitSeconds = session.timeLimitMinutes * 60;
  if (!Number.isFinite(startedAt) || !Number.isFinite(serverNow) || limitSeconds <= 0) {
    return 0;
  }
  return Math.max(0, limitSeconds - Math.floor((serverNow - startedAt) / 1000));
}

function readDraftAnswers(key: string): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Simple stable PRNG for question shuffling. */
function seededRandom(seedStr: string) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(31, h) + seedStr.charCodeAt(i) | 0;
  }
  return function() {
    h = Math.imul(h ^ (h >>> 15), 1 | h);
    h ^= h + Math.imul(h ^ (h >>> 7), 61 | h);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  }
}

/** Student quiz attempt with countdown, option selection, and score display. */
export default function QuizAttemptView({
  quiz,
  attemptSession,
  submitAttempt,
  email,
}: QuizAttemptViewProps) {
  const { actor, signOut } = useAuth();
  const draftKey = `quiz-draft:${quiz.id}:${attemptSession.startedAt}`;
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    remainingFromSession(attemptSession),
  );
  const [answers, setAnswers] = useState<Record<string, number>>(() =>
    readDraftAnswers(draftKey),
  );
  const [phase, setPhase] = useState<AttemptPhase>({ kind: 'in-progress' });
  const [timerAnnouncement, setTimerAnnouncement] = useState<string>('');

  // Shuffle questions if configured, using a stable seed (Req 8.1 / Phase 4).
  const displayQuestions = useMemo(() => {
    if (!quiz.shuffleQuestions) return quiz.questions;
    
    // Stable seed per student per quiz
    const actorId = actor.kind === 'student' ? actor.email : actor.kind === 'teacher' ? actor.userId : 'anon';
    const seed = `${actorId}-${quiz.id}`;
    const rng = seededRandom(seed);
    const qs = [...quiz.questions];
    for (let i = qs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [qs[i], qs[j]] = [qs[j], qs[i]];
    }
    return qs;
  }, [quiz.questions, quiz.shuffleQuestions, quiz.id, actor]);

  // Track whether a submission is already in flight to prevent double-submit.
  const submittedRef = useRef(false);
  const questionIds = useMemo(() => new Set(displayQuestions.map((question) => question.id)), [displayQuestions]);
  const answeredCount = Object.keys(answers).filter((id) => questionIds.has(id)).length;
  const unansweredCount = displayQuestions.length - answeredCount;

  const submitWithRetry = useCallback(
    async (currentAnswers: Record<string, number>, auto: boolean, retryCount: number) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setPhase({ kind: 'submitting', auto });

      try {
        const outcome = await submitAttempt(quiz.id, currentAnswers, email);
        switch (outcome.status) {
          case 'recorded':
            window.localStorage.removeItem(draftKey);
            setPhase({
              kind: 'scored',
              score: outcome.result.score,
              totalMarks: outcome.result.totalMarks,
              auto,
            });
            break;
          case 'already-attempted':
            window.localStorage.removeItem(draftKey);
            setPhase({
              kind: 'already-attempted',
              score: outcome.result.score,
              totalMarks: outcome.result.totalMarks,
            });
            break;
          case 'denied':
            // Show the specific reason's copy (e.g. "teacher-account",
            // "quiz-not-found") instead of a single generic message, so the
            // student sees exactly why the submission was denied.
            setPhase({
              kind: 'error',
              message: DENIED_COPY[outcome.reason].body,
              retryable: false,
            });
            break;
          default:
            setPhase({ kind: 'error', message: messages.error.generic, retryable: true });
            break;
        }
      } catch {
        submittedRef.current = false;
        if (auto && retryCount < 2) {
          window.setTimeout(() => {
            void submitWithRetry(currentAnswers, true, retryCount + 1);
          }, 800 * (retryCount + 1));
          return;
        }
        setPhase({ kind: 'error', message: messages.error.generic, retryable: true });
      }
    },
    [draftKey, quiz.id, submitAttempt],
  );

  /** Perform the actual submission. */
  const doSubmit = useCallback(
    async (currentAnswers: Record<string, number>) => {
      return submitWithRetry(currentAnswers, false, 0);
    },
    [submitWithRetry],
  );

  // Use a ref to always have access to the latest answers inside the timer
  // callback without re-creating the interval.
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const doSubmitRef = useRef(doSubmit);
  doSubmitRef.current = doSubmit;
  const submitWithRetryRef = useRef(submitWithRetry);
  submitWithRetryRef.current = submitWithRetry;

  useEffect(() => {
    if (phase.kind !== 'in-progress') {
      return;
    }
    window.localStorage.setItem(draftKey, JSON.stringify(answers));
  }, [answers, draftKey, phase.kind]);

  // Countdown timer — ticks every second and auto-submits on expiry (Req 8.7).
  useEffect(() => {
    if (phase.kind !== 'in-progress') return;

    const intervalId = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1;
        if (next === 300) {
          setTimerAnnouncement('5 minutes remaining');
        } else if (next === 60) {
          setTimerAnnouncement('1 minute remaining');
        }

        if (next <= 0) {
          clearInterval(intervalId);
          // Auto-submit with the current answers on expiry.
          void submitWithRetryRef.current(answersRef.current, true, 0);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [phase.kind]);

  // Post-result session expiry — once the student has finished (or already
  // finished) the quiz, their authenticated (post-OTP) session should not stay
  // open indefinitely. Start a single 5-minute timer that signs them out, plus
  // a best-effort sign-out on tab close. The timer is the reliable fallback:
  // `beforeunload` handlers are not guaranteed to complete async work before
  // the browser tears down the page, so it's a nice-to-have, not the guarantee.
  const isResultPhase = phase.kind === 'scored' || phase.kind === 'already-attempted';
  useEffect(() => {
    if (!isResultPhase) return;

    const timeoutId = window.setTimeout(() => {
      void signOut();
    }, 5 * 60 * 1000);

    const handleBeforeUnload = () => {
      // Best-effort only — browsers do not guarantee this async call
      // completes before the page unloads. The 5-minute timer above is what
      // actually guarantees the session eventually ends.
      void signOut();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isResultPhase, signOut]);

  /** Handle manual submit. */
  function handleSubmit() {
    if (phase.kind !== 'in-progress') return;
    if (
      unansweredCount > 0 &&
      !window.confirm(`${unansweredCount} questions unanswered. Submit anyway?`)
    ) {
      return;
    }
    void doSubmit(answers);
  }

  function retrySubmit() {
    if (phase.kind !== 'error' || !phase.retryable) return;
    void doSubmit(answersRef.current);
  }

  /** Select an option for a question. */
  function selectOption(questionId: string, optionIndex: number) {
    if (phase.kind !== 'in-progress') return;
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  }

  // Determine urgency class for the timer display.
  const timerUrgency =
    remainingSeconds <= 60
      ? 'text-status-red font-bold'
      : remainingSeconds <= 120
        ? 'text-amber-500 font-semibold'
        : 'text-text font-semibold';

  // --- Result phases ---

  if (phase.kind === 'scored') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="card w-full max-w-sm p-6 text-center">
          <h1 className="text-lg font-semibold text-text">
            {phase.auto ? 'Time up — your answers were submitted automatically' : 'Quiz submitted'}
          </h1>
          <p className="mt-2 text-sm text-soft">Your score has been recorded.</p>
          <p className="mt-4 text-2xl font-bold text-accent">
            {phase.score} / {phase.totalMarks}
          </p>
          <p className="mt-4 text-xs text-muted">This session will close in 5 minutes.</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-4 rounded px-6 py-2 text-sm font-medium text-white transition-opacity"
            style={{ backgroundColor: '#5746e3' }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (phase.kind === 'already-attempted') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="card w-full max-w-sm p-6 text-center">
          <h1 className="text-lg font-semibold text-text">Attempt already submitted</h1>
          <p role="alert" className="mt-2 text-sm text-soft">
            {messages.auth.alreadyAttempted}
          </p>
          <p className="mt-4 text-2xl font-bold text-accent">
            {phase.score} / {phase.totalMarks}
          </p>
          <p className="mt-4 text-xs text-muted">This session will close in 5 minutes.</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-4 rounded px-6 py-2 text-sm font-medium text-white transition-opacity"
            style={{ backgroundColor: '#5746e3' }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (phase.kind === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f0ebf8] px-4 py-10">
        <div className="w-full max-w-3xl overflow-hidden rounded-lg bg-surface shadow-md">
          <div className="h-2 w-full bg-[#5746e3]"></div>
          <div className="p-6">
            <h1 className="text-2xl font-normal text-text">Submission failed</h1>
            <p role="alert" className="mt-2 text-sm text-status-red">
              {phase.message}
            </p>
            {phase.retryable && (
              <Button variant="primary" onClick={retrySubmit} className="mt-6 w-full max-w-xs" style={{ backgroundColor: '#5746e3', color: 'white', borderRadius: '4px' }}>
                Retry submit
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- In-progress / submitting phase ---

  const isSubmitting = phase.kind === 'submitting';

  return (
    <div className="min-h-screen bg-[#f0ebf8] px-4 py-6">
      <div className="mx-auto max-w-3xl">
        {/* Sticky timer header */}
        <header className="sticky top-4 z-10 mb-6 flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-border bg-surface px-6 py-4 shadow-md transition-shadow">
          <div>
            <h1 className="text-lg font-normal text-text">{quiz.title ?? 'Quiz'}</h1>
            <p className="text-sm text-soft mt-1">
              Answered {answeredCount} of {displayQuestions.length}
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex items-center gap-3 rounded-md bg-[#f0ebf8] px-4 py-2 text-[#5746e3]">
            <span className="text-sm font-medium">Time remaining</span>
            <span
              className={`text-xl tabular-nums ${timerUrgency}`}
              aria-hidden="true"
            >
              {formatTime(remainingSeconds)}
            </span>
            <span role="timer" aria-live="polite" className="sr-only">
              {timerAnnouncement}
            </span>
          </div>
        </header>

        {/* Questions */}
        <div className="flex flex-col gap-6">
          {displayQuestions.map((question, qIndex) => (
            <fieldset
              key={question.id}
              id={`question-${question.id}`}
              className="rounded-lg bg-surface p-6 shadow-sm transition-shadow hover:shadow-md border border-border"
              disabled={isSubmitting}
            >
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 text-base text-text">{qIndex + 1}.</span>
                <legend className="text-base font-normal text-text leading-relaxed">
                  {question.text}
                </legend>
              </div>
              <div className="mt-5 flex flex-col gap-4 pl-6">
                {question.options.map((option, oIndex) => (
                  <label
                    key={oIndex}
                    className="flex cursor-pointer items-center gap-3 text-sm text-text"
                  >
                    <input
                      type="radio"
                      name={`question-${question.id}`}
                      value={oIndex}
                      checked={answers[question.id] === oIndex}
                      onChange={() => selectOption(question.id, oIndex)}
                      disabled={isSubmitting}
                      className="h-5 w-5 border-2 border-[#5746e3] text-[#5746e3] focus:ring-[#5746e3]"
                    />
                    <span className="leading-tight">{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        {/* Submit button */}
        <div className="mt-8 flex justify-between items-center bg-surface p-4 rounded-lg shadow-sm border border-border">
          <p className="text-sm text-soft">
            Make sure to review your answers before submitting.
          </p>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded px-8 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#5746e3' }}
          >
            {isSubmitting && (phase as any).auto ? 'Auto-submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
