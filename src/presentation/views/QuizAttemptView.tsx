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

import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuizPayloadNoAnswers } from '@domain/services/rosterService';
import type { SubmitAttemptOutcome } from '@data/access/parsers';
import { messages } from '@domain/shared/messages';
import { DENIED_COPY } from './StudentQuizAccessView';
import { Button } from '@presentation/components/ui';

/** The function that submits an attempt to the server (RPC wrapper). */
export type SubmitAttemptFn = (
  quizId: string,
  answers: Record<string, number>,
) => Promise<SubmitAttemptOutcome>;

export interface QuizAttemptViewProps {
  /** The answer-free quiz payload received from the access gate. */
  quiz: QuizPayloadNoAnswers;
  /** Submits the attempt server-side and returns the outcome. */
  submitAttempt: SubmitAttemptFn;
}

/** Phase machine for the attempt lifecycle. */
type AttemptPhase =
  | { kind: 'in-progress' }
  | { kind: 'submitting' }
  | { kind: 'scored'; score: number; totalMarks: number }
  | { kind: 'already-attempted'; score: number; totalMarks: number }
  | { kind: 'error'; message: string };

/** Format remaining seconds as MM:SS. */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Student quiz attempt with countdown, option selection, and score display. */
export default function QuizAttemptView({
  quiz,
  submitAttempt,
}: QuizAttemptViewProps) {
  const totalSeconds = quiz.timeLimitMinutes * 60;
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<AttemptPhase>({ kind: 'in-progress' });

  // Track whether a submission is already in flight to prevent double-submit.
  const submittedRef = useRef(false);

  /** Perform the actual submission. */
  const doSubmit = useCallback(
    async (currentAnswers: Record<string, number>) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setPhase({ kind: 'submitting' });

      try {
        const outcome = await submitAttempt(quiz.id, currentAnswers);
        switch (outcome.status) {
          case 'recorded':
            setPhase({
              kind: 'scored',
              score: outcome.result.score,
              totalMarks: outcome.result.totalMarks,
            });
            break;
          case 'already-attempted':
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
            setPhase({ kind: 'error', message: DENIED_COPY[outcome.reason].body });
            break;
          default:
            setPhase({ kind: 'error', message: messages.error.generic });
            break;
        }
      } catch {
        submittedRef.current = false;
        setPhase({ kind: 'error', message: messages.error.generic });
      }
    },
    [quiz.id, submitAttempt],
  );

  // Use a ref to always have access to the latest answers inside the timer
  // callback without re-creating the interval.
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const doSubmitRef = useRef(doSubmit);
  doSubmitRef.current = doSubmit;

  // Countdown timer — ticks every second and auto-submits on expiry (Req 8.7).
  useEffect(() => {
    if (phase.kind !== 'in-progress') return;

    const intervalId = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(intervalId);
          // Auto-submit with the current answers on expiry.
          void doSubmitRef.current(answersRef.current);
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
    void doSubmit(answers);
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
          <h1 className="text-lg font-semibold text-text">Quiz submitted</h1>
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
        <h1 className="text-base font-semibold text-text">Quiz</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Time remaining</span>
          <span className={`text-lg tabular-nums ${timerUrgency}`} aria-live="polite" aria-atomic="true">
            {formatTime(remainingSeconds)}
          </span>
        </div>
      </header>

      {/* Questions */}
      <div className="mt-6 flex flex-col gap-6">
        {quiz.questions.map((question, qIndex) => (
          <fieldset
            key={question.id}
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
          Submit quiz
        </Button>
      </div>
    </div>
  );
}
