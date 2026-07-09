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
) => Promise<SubmitAttemptOutcome>;

export interface QuizAttemptViewProps {
  /** The answer-free quiz payload received from the access gate. */
  quiz: QuizPayloadNoAnswers;
  /** Server-authoritative timer session. */
  attemptSession: QuizAttemptSessionInfo;
  /** Submits the attempt server-side and returns the outcome. */
  submitAttempt: SubmitAttemptFn;
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
}: QuizAttemptViewProps) {
  const { actor } = useAuth();
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
        const outcome = await submitAttempt(quiz.id, currentAnswers);
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

  function jumpToQuestion(questionId: string) {
    document.getElementById(`question-${questionId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
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
        </div>
      </div>
    );
  }

  if (phase.kind === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="card w-full max-w-sm p-6 text-center">
          <h1 className="text-lg font-semibold text-text">Submission failed</h1>
          <p role="alert" className="mt-2 text-sm text-status-red">
            {phase.message}
          </p>
          {phase.retryable && (
            <Button variant="primary" onClick={retrySubmit} className="mt-4">
              Retry submit
            </Button>
          )}
        </div>
      </div>
    );
  }

  // --- In-progress / submitting phase ---

  const isSubmitting = phase.kind === 'submitting';

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Sticky timer header */}
      <header className="sticky top-0 z-10 flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3 shadow-sm">
        <div>
          <h1 className="text-base font-semibold text-text">{quiz.title ?? 'Quiz'}</h1>
          <p className="text-xs text-muted">
            Answered {answeredCount}/{displayQuestions.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Time remaining</span>
          <span
            className={`text-lg tabular-nums ${timerUrgency}`}
            aria-hidden="true"
          >
            {formatTime(remainingSeconds)}
          </span>
          <span role="timer" aria-live="polite" className="sr-only">
            {timerAnnouncement}
          </span>
        </div>
      </header>

      <nav
        className="mt-4 flex flex-wrap gap-2"
        aria-label="Question navigation"
      >
        {displayQuestions.map((question, index) => (
          <button
            key={question.id}
            type="button"
            onClick={() => jumpToQuestion(question.id)}
            className={`h-9 w-9 rounded-full border text-sm font-semibold ${
              answers[question.id] !== undefined
                ? 'border-accent bg-accent text-white'
                : 'border-border bg-surface text-muted'
            }`}
            aria-label={`Go to question ${index + 1}`}
          >
            {index + 1}
          </button>
        ))}
      </nav>

      {/* Questions */}
      <div className="mt-6 flex flex-col gap-6">
        {displayQuestions.map((question, qIndex) => (
          <fieldset
            key={question.id}
            id={`question-${question.id}`}
            className="card p-5"
            disabled={isSubmitting}
          >
            <legend className="text-sm font-semibold text-text">
              Question {qIndex + 1}
            </legend>
            <p className="mt-2 text-sm text-text">{question.text}</p>
            <div className="mt-3 flex flex-col gap-2">
              {question.options.map((option, oIndex) => (
                <label
                  key={oIndex}
                  className={`flex cursor-pointer items-center gap-3 rounded-button border px-3 py-2 text-sm transition-colors ${
                    answers[question.id] === oIndex
                      ? 'border-accent bg-accent-tint text-text'
                      : 'border-border bg-surface text-text hover:bg-background'
                  }`}
                >
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={oIndex}
                    checked={answers[question.id] === oIndex}
                    onChange={() => selectOption(question.id, oIndex)}
                    disabled={isSubmitting}
                    className="h-4 w-4 accent-accent"
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {/* Submit button */}
      <div className="mt-8 flex justify-center">
        <Button
          variant="primary"
          onClick={handleSubmit}
          loading={isSubmitting}
          className="px-8"
        >
          {isSubmitting && (phase as any).auto ? 'Auto-submitting…' : 'Submit quiz'}
        </Button>
      </div>
    </div>
  );
}
