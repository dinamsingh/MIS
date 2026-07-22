/**
 * Student quiz attempt view — Phase A UX redesign.
 *
 * Renders the quiz-taking experience once access has been granted by the
 * {@link StudentQuizAccessView}. Features:
 *
 *  - **Prominent, urgency-styled timer** with pill background that pulses in
 *    the last minute (Req 8.7).
 *  - **Question palette** — a compact chip row showing every question's state
 *    (unanswered / answered / marked-for-review) with click-to-jump.
 *  - **Mark for review** — students can flag a question to revisit later.
 *  - **Clear answer** — deselect an accidentally-picked option.
 *  - **Review-before-submit screen** replacing the native confirm dialog:
 *    lists unanswered + marked questions, lets student jump back or submit.
 *  - **Time warnings toast** at 5 min / 1 min / 30 sec — visible + accessible.
 *  - **Auto-submit on timer expiry** (Req 8.7).
 *  - **Draft auto-save** to localStorage — refresh survives.
 *  - **Score + percentage** on submit (Req 8.9).
 *  - **Already-attempted handling** (Req 8.10).
 *  - **5-minute post-result session expiry** with visible countdown.
 *
 * Grading and single-attempt enforcement happen server-side via the
 * `submit_attempt` RPC; this view never receives correct answers.
 *
 * _Requirements: 8.7, 8.9, 8.10_
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QuizAttemptSessionInfo, QuizPayloadNoAnswers } from '@domain/services/rosterService';
import type { SubmitAttemptOutcome } from '@data/access/parsers';
import { messages } from '@domain/shared/messages';
import { DENIED_COPY } from './StudentQuizAccessView';
import { Button } from '@presentation/components/ui';
import { useAuth } from '@presentation/auth/AuthContext';

/** The function that submits an attempt to the server (RPC wrapper). */
export type SubmitAttemptFn = (
  quizId: string,
  answers: Record<string, number>,
  email: string,
) => Promise<SubmitAttemptOutcome>;

export interface QuizAttemptViewProps {
  quiz: QuizPayloadNoAnswers;
  attemptSession: QuizAttemptSessionInfo;
  submitAttempt: SubmitAttemptFn;
  email: string;
}

type AttemptPhase =
  | { kind: 'in-progress' }
  | { kind: 'submitting'; auto?: boolean }
  | { kind: 'scored'; score: number; totalMarks: number; auto?: boolean }
  | { kind: 'already-attempted'; score: number; totalMarks: number }
  | { kind: 'error'; message: string; retryable: boolean };

type WarningLevel = 'info' | 'warning' | 'danger';
interface Warning {
  readonly message: string;
  readonly level: WarningLevel;
  readonly id: number;
}

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

function readDraftMarks(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function seededRandom(seedStr: string) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = (Math.imul(31, h) + seedStr.charCodeAt(i)) | 0;
  }
  return function () {
    h = Math.imul(h ^ (h >>> 15), 1 | h);
    h ^= h + Math.imul(h ^ (h >>> 7), 61 | h);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

export default function QuizAttemptView({
  quiz,
  attemptSession,
  submitAttempt,
  email,
}: QuizAttemptViewProps) {
  const { actor, signOut } = useAuth();
  const draftKey = `quiz-draft:${quiz.id}:${attemptSession.startedAt}`;
  const marksKey = `quiz-marks:${quiz.id}:${attemptSession.startedAt}`;

  const [remainingSeconds, setRemainingSeconds] = useState(() => remainingFromSession(attemptSession));
  const [answers, setAnswers] = useState<Record<string, number>>(() => readDraftAnswers(draftKey));
  const [markedForReview, setMarkedForReview] = useState<Set<string>>(() => new Set(readDraftMarks(marksKey)));
  const [phase, setPhase] = useState<AttemptPhase>({ kind: 'in-progress' });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [warning, setWarning] = useState<Warning | null>(null);
  const [postResultSecondsLeft, setPostResultSecondsLeft] = useState<number>(5 * 60);

  // Deterministic per-student question order when shuffleQuestions is on.
  const displayQuestions = useMemo(() => {
    if (!quiz.shuffleQuestions) return quiz.questions;
    const actorId =
      actor.kind === 'student' ? actor.email : actor.kind === 'teacher' ? actor.userId : 'anon';
    const seed = `${actorId}-${quiz.id}`;
    const rng = seededRandom(seed);
    const qs = [...quiz.questions];
    for (let i = qs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [qs[i], qs[j]] = [qs[j], qs[i]];
    }
    return qs;
  }, [quiz.questions, quiz.shuffleQuestions, quiz.id, actor]);

  const submittedRef = useRef(false);
  const questionIds = useMemo(() => new Set(displayQuestions.map((q) => q.id)), [displayQuestions]);
  const answeredCount = Object.keys(answers).filter((id) => questionIds.has(id)).length;
  const unansweredCount = displayQuestions.length - answeredCount;
  const markedCount = Array.from(markedForReview).filter((id) => questionIds.has(id)).length;
  const progressPercent =
    displayQuestions.length > 0 ? Math.round((answeredCount / displayQuestions.length) * 100) : 0;

  // Fired warnings tracker so each threshold fires exactly once.
  const firedWarningsRef = useRef<Set<number>>(new Set());

  // --- Draft persistence -----------------------------------------------------
  useEffect(() => {
    if (phase.kind !== 'in-progress') return;
    window.localStorage.setItem(draftKey, JSON.stringify(answers));
  }, [answers, draftKey, phase.kind]);

  useEffect(() => {
    if (phase.kind !== 'in-progress') return;
    window.localStorage.setItem(marksKey, JSON.stringify(Array.from(markedForReview)));
  }, [markedForReview, marksKey, phase.kind]);

  // --- Submission logic ------------------------------------------------------
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
            window.localStorage.removeItem(marksKey);
            setPhase({
              kind: 'scored',
              score: outcome.result.score,
              totalMarks: outcome.result.totalMarks,
              auto,
            });
            break;
          case 'already-attempted':
            window.localStorage.removeItem(draftKey);
            window.localStorage.removeItem(marksKey);
            setPhase({
              kind: 'already-attempted',
              score: outcome.result.score,
              totalMarks: outcome.result.totalMarks,
            });
            break;
          case 'denied':
            setPhase({ kind: 'error', message: DENIED_COPY[outcome.reason].body, retryable: false });
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
    [draftKey, marksKey, quiz.id, submitAttempt, email],
  );

  const doSubmit = useCallback(
    async (currentAnswers: Record<string, number>) => submitWithRetry(currentAnswers, false, 0),
    [submitWithRetry],
  );

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submitWithRetryRef = useRef(submitWithRetry);
  submitWithRetryRef.current = submitWithRetry;

  // --- Countdown timer + warnings -------------------------------------------
  useEffect(() => {
    if (phase.kind !== 'in-progress') return;

    const intervalId = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1;

        // Emit a warning exactly once at each threshold.
        for (const [threshold, message, level] of [
          [300, '5 minutes remaining', 'info'] as const,
          [60, '1 minute remaining', 'warning'] as const,
          [30, '30 seconds remaining', 'danger'] as const,
        ]) {
          if (next === threshold && !firedWarningsRef.current.has(threshold)) {
            firedWarningsRef.current.add(threshold);
            setWarning({ id: Date.now(), message, level });
          }
        }

        if (next <= 0) {
          window.clearInterval(intervalId);
          void submitWithRetryRef.current(answersRef.current, true, 0);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [phase.kind]);

  // Auto-dismiss warning toast after 4s.
  useEffect(() => {
    if (!warning) return;
    const t = window.setTimeout(() => setWarning(null), 4000);
    return () => window.clearTimeout(t);
  }, [warning]);

  // --- Post-result session countdown ----------------------------------------
  const isResultPhase = phase.kind === 'scored' || phase.kind === 'already-attempted';
  useEffect(() => {
    if (!isResultPhase) return;
    setPostResultSecondsLeft(5 * 60);
    const intervalId = window.setInterval(() => {
      setPostResultSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalId);
          void signOut();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const handleBeforeUnload = () => {
      // Best-effort — the 5-min timer is the reliable fallback.
      void signOut();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isResultPhase, signOut]);

  // --- Handlers --------------------------------------------------------------
  function selectOption(questionId: string, optionIndex: number) {
    if (phase.kind !== 'in-progress') return;
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  }

  function clearAnswer(questionId: string) {
    if (phase.kind !== 'in-progress') return;
    setAnswers((prev) => {
      const { [questionId]: _removed, ...rest } = prev;
      return rest;
    });
  }

  function toggleMarkForReview(questionId: string) {
    if (phase.kind !== 'in-progress') return;
    setMarkedForReview((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }

  function scrollToQuestion(questionId: string) {
    const el = document.getElementById(`question-${questionId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleOpenReview() {
    if (phase.kind !== 'in-progress') return;
    setReviewOpen(true);
  }

  function handleConfirmSubmit() {
    setReviewOpen(false);
    void doSubmit(answers);
  }

  function retrySubmit() {
    if (phase.kind !== 'error' || !phase.retryable) return;
    submittedRef.current = false;
    void doSubmit(answersRef.current);
  }

  const timerUrgency =
    remainingSeconds <= 60
      ? 'text-status-red'
      : remainingSeconds <= 120
        ? 'text-amber-500'
        : 'text-text';
  const timerPulse = remainingSeconds <= 60 ? 'motion-safe:animate-pulse' : '';

  // ============ RESULT PHASES ==============================================
  if (phase.kind === 'scored') {
    const percent =
      phase.totalMarks > 0 ? Math.round((phase.score / phase.totalMarks) * 100) : 0;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 pb-[env(safe-area-inset-bottom)]">
        <div className="card w-full max-w-md text-center">
          <span
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-status-green/10 text-3xl text-status-green motion-safe:animate-in motion-safe:zoom-in motion-safe:duration-300"
            aria-hidden="true"
          >
            ✓
          </span>
          <h1 className="mt-4 text-xl font-semibold text-text">
            {phase.auto ? 'Time up — auto-submitted' : 'Quiz submitted'}
          </h1>
          <p className="mt-1 text-sm text-soft">Your score has been recorded.</p>
          <div className="mt-5 rounded-card border border-border bg-surface-muted px-4 py-4">
            <p className="text-4xl font-bold tabular-nums text-accent">
              {phase.score}
              <span className="text-lg font-normal text-muted"> / {phase.totalMarks}</span>
            </p>
            <p className="mt-1 text-sm font-medium text-soft">{percent}%</p>
          </div>
          <p className="mt-5 text-xs text-muted">
            This session will close in {formatTime(postResultSecondsLeft)}
          </p>
          <Button variant="primary" onClick={() => void signOut()} className="mt-3 w-full">
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (phase.kind === 'already-attempted') {
    const percent =
      phase.totalMarks > 0 ? Math.round((phase.score / phase.totalMarks) * 100) : 0;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 pb-[env(safe-area-inset-bottom)]">
        <div className="card w-full max-w-md text-center">
          <span
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-status-green/10 text-3xl text-status-green"
            aria-hidden="true"
          >
            ✓
          </span>
          <h1 className="mt-4 text-xl font-semibold text-text">Attempt already submitted</h1>
          <p role="alert" className="mt-1 text-sm text-soft">
            {messages.auth.alreadyAttempted}
          </p>
          <div className="mt-5 rounded-card border border-border bg-surface-muted px-4 py-4">
            <p className="text-4xl font-bold tabular-nums text-accent">
              {phase.score}
              <span className="text-lg font-normal text-muted"> / {phase.totalMarks}</span>
            </p>
            <p className="mt-1 text-sm font-medium text-soft">{percent}%</p>
          </div>
          <p className="mt-5 text-xs text-muted">
            This session will close in {formatTime(postResultSecondsLeft)}
          </p>
          <Button variant="primary" onClick={() => void signOut()} className="mt-3 w-full">
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (phase.kind === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10 pb-[env(safe-area-inset-bottom)]">
        <div className="card w-full max-w-md text-center">
          <span
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-status-red/10 text-3xl text-status-red"
            aria-hidden="true"
          >
            ✕
          </span>
          <h1 className="mt-4 text-xl font-semibold text-text">Submission failed</h1>
          <p role="alert" className="mt-2 text-sm text-status-red">
            {phase.message}
          </p>
          {phase.retryable && (
            <Button variant="primary" onClick={retrySubmit} className="mt-5 w-full">
              Retry submit
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ============ IN-PROGRESS / SUBMITTING ===================================
  const isSubmitting = phase.kind === 'submitting';

  return (
    <div className="min-h-screen bg-background pb-[env(safe-area-inset-bottom)]">
      {/* --- Sticky top: title, progress, PROMINENT timer --------------- */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-text sm:text-lg">
              {quiz.title ?? 'Quiz'}
            </h1>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300 ease-standard"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-muted tabular-nums">
                {answeredCount}/{displayQuestions.length}
              </p>
            </div>
          </div>

          {/* Prominent timer pill */}
          <div
            className={`flex items-center gap-2 self-end rounded-full border-2 px-4 py-1.5 sm:self-auto ${
              remainingSeconds <= 60
                ? 'border-status-red bg-status-red/10'
                : remainingSeconds <= 120
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-accent bg-accent-tint'
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              Time
            </span>
            <span className={`font-bold tabular-nums ${timerUrgency} ${timerPulse} text-2xl sm:text-3xl`}>
              {formatTime(remainingSeconds)}
            </span>
          </div>
        </div>

        {/* --- Question palette strip (horizontal, scrollable) --------- */}
        <div className="mx-auto max-w-4xl px-4 pb-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Questions">
            {displayQuestions.map((q, i) => {
              const isAnswered = answers[q.id] !== undefined;
              const isMarked = markedForReview.has(q.id);
              let cls =
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ';
              if (isAnswered && isMarked) {
                cls += 'border-amber-500 bg-accent text-surface ring-2 ring-amber-400';
              } else if (isAnswered) {
                cls += 'border-accent bg-accent text-surface';
              } else if (isMarked) {
                cls += 'border-amber-500 bg-amber-500/10 text-amber-600';
              } else {
                cls += 'border-border bg-surface text-muted hover:bg-surface-muted';
              }
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => scrollToQuestion(q.id)}
                  className={cls}
                  aria-label={`Question ${i + 1}${isAnswered ? ', answered' : ', unanswered'}${
                    isMarked ? ', marked for review' : ''
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* --- Warning toast --------------------------------------------- */}
      {warning && (
        <div
          role="alert"
          className={`sticky top-[7.5rem] z-30 mx-auto mt-3 max-w-sm rounded-card border-2 px-4 py-3 text-center text-sm font-semibold shadow-elevated motion-safe:animate-in motion-safe:slide-in-from-top-2 ${
            warning.level === 'danger'
              ? 'border-status-red bg-status-red text-surface'
              : warning.level === 'warning'
                ? 'border-amber-500 bg-amber-500 text-surface'
                : 'border-accent bg-accent-tint text-accent'
          }`}
        >
          ⏰ {warning.message}
        </div>
      )}

      {/* --- Questions body ------------------------------------------- */}
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="flex flex-col gap-4">
          {displayQuestions.map((question, qIndex) => {
            const isAnswered = answers[question.id] !== undefined;
            const isMarked = markedForReview.has(question.id);
            return (
              <fieldset
                key={question.id}
                id={`question-${question.id}`}
                className={`motion-border scroll-mt-[10rem] rounded-card border bg-surface p-5 shadow-soft transition-[border-color,box-shadow] duration-200 ease-standard ${
                  isMarked ? 'border-amber-500/60' : 'border-border'
                }`}
                disabled={isSubmitting}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={
                      isAnswered
                        ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-surface'
                        : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold text-muted'
                    }
                  >
                    {qIndex + 1}
                  </span>
                  <legend className="flex-1 text-sm font-medium leading-relaxed text-text sm:text-base break-words">
                    {question.text}
                  </legend>
                  <button
                    type="button"
                    onClick={() => toggleMarkForReview(question.id)}
                    className={`shrink-0 rounded-control border px-2 py-1 text-[11px] font-semibold transition-colors ${
                      isMarked
                        ? 'border-amber-500 bg-amber-500 text-surface'
                        : 'border-border bg-surface text-muted hover:border-amber-500 hover:text-amber-600'
                    }`}
                    aria-pressed={isMarked}
                    aria-label={isMarked ? 'Unmark question' : 'Mark for review'}
                    title={isMarked ? 'Unmark' : 'Mark for review'}
                  >
                    {isMarked ? '★ Marked' : '☆ Mark'}
                  </button>
                </div>

                <div className="mt-4 flex flex-col gap-2 pl-10">
                  {question.options.map((option, oIndex) => {
                    const selected = answers[question.id] === oIndex;
                    return (
                      <label
                        key={oIndex}
                        className={`motion-interactive flex min-h-[44px] cursor-pointer items-center gap-3 rounded-control border px-3 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-accent/40 ${
                          selected
                            ? 'border-accent bg-accent-tint text-text'
                            : 'border-border bg-surface text-text hover:bg-surface-muted'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          value={oIndex}
                          checked={selected}
                          onChange={() => selectOption(question.id, oIndex)}
                          disabled={isSubmitting}
                          className="h-4 w-4 shrink-0 accent-accent"
                        />
                        <span className="flex-1 leading-tight break-words">{option}</span>
                      </label>
                    );
                  })}
                </div>

                {isAnswered && (
                  <div className="mt-3 pl-10">
                    <button
                      type="button"
                      onClick={() => clearAnswer(question.id)}
                      className="text-xs font-medium text-muted underline-offset-2 hover:text-status-red hover:underline"
                    >
                      Clear answer
                    </button>
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>

        {/* --- Bottom submit bar --------------------------------------- */}
        <div className="motion-border mt-6 flex flex-col items-start gap-3 rounded-card border border-border bg-surface p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-soft">
            <span className="font-semibold text-text">{answeredCount}</span> answered
            {unansweredCount > 0 && (
              <>
                {' · '}
                <span className="font-semibold text-status-red">{unansweredCount}</span> left
              </>
            )}
            {markedCount > 0 && (
              <>
                {' · '}
                <span className="font-semibold text-amber-600">{markedCount}</span> marked
              </>
            )}
          </div>
          <Button
            variant="primary"
            onClick={handleOpenReview}
            loading={isSubmitting && !(phase as { auto?: boolean }).auto}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            {isSubmitting && (phase as { auto?: boolean }).auto ? 'Auto-submitting…' : 'Review & Submit'}
          </Button>
        </div>
      </div>

      {/* --- Review-before-submit modal ------------------------------- */}
      {reviewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-title"
          className="fixed inset-0 z-40 flex items-center justify-center bg-text/40 px-4 py-6 motion-safe:animate-in motion-safe:fade-in"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-card border border-border bg-surface shadow-elevated motion-safe:animate-in motion-safe:zoom-in-95">
            <div className="border-b border-border px-5 py-4">
              <h2 id="review-title" className="text-lg font-semibold text-text">
                Review before submit
              </h2>
              <p className="mt-1 text-sm text-soft">
                Time remaining: <span className="font-semibold tabular-nums text-text">{formatTime(remainingSeconds)}</span>
              </p>
            </div>

            <div className="grid grid-cols-3 divide-x divide-border border-b border-border text-center">
              <div className="p-3">
                <p className="text-2xl font-bold text-accent">{answeredCount}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Answered</p>
              </div>
              <div className="p-3">
                <p className={`text-2xl font-bold ${unansweredCount > 0 ? 'text-status-red' : 'text-muted'}`}>
                  {unansweredCount}
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Unanswered</p>
              </div>
              <div className="p-3">
                <p className={`text-2xl font-bold ${markedCount > 0 ? 'text-amber-600' : 'text-muted'}`}>
                  {markedCount}
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Marked</p>
              </div>
            </div>

            {(unansweredCount > 0 || markedCount > 0) && (
              <div className="max-h-64 overflow-y-auto px-5 py-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Questions needing attention
                </p>
                <ul className="flex flex-col gap-1.5">
                  {displayQuestions.map((q, i) => {
                    const isAnswered = answers[q.id] !== undefined;
                    const isMarked = markedForReview.has(q.id);
                    if (isAnswered && !isMarked) return null;
                    return (
                      <li key={q.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setReviewOpen(false);
                            window.setTimeout(() => scrollToQuestion(q.id), 100);
                          }}
                          className="flex w-full items-center gap-3 rounded-control border border-border bg-surface px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-muted"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-muted">
                            {i + 1}
                          </span>
                          <span className="flex-1 truncate">{q.text}</span>
                          {!isAnswered && (
                            <span className="shrink-0 rounded-sm bg-status-red/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-status-red">
                              Unanswered
                            </span>
                          )}
                          {isMarked && (
                            <span className="shrink-0 rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-600">
                              Marked
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {unansweredCount === 0 && markedCount === 0 && (
              <div className="px-5 py-6 text-center text-sm text-soft">
                All questions answered. You're ready to submit.
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-border bg-surface-muted/30 px-5 py-4 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setReviewOpen(false)}>
                Go back to quiz
              </Button>
              <Button variant="primary" onClick={handleConfirmSubmit}>
                {unansweredCount > 0 ? `Submit anyway (${unansweredCount} left)` : 'Submit quiz'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
