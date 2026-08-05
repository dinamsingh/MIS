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
import { ThemeToggle } from '../components/ui/ThemeToggle';
import type { QuizAttemptSessionInfo, QuizPayloadNoAnswers } from '@domain/services/rosterService';
import type { SubmitAttemptOutcome } from '@data/access/parsers';
import type { QuizAttemptDetailQuestion } from '@data/access/quizAccess';
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
  getQuizReview?: (quizId: string, email: string) => Promise<QuizAttemptDetailQuestion[] | null>;
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
  getQuizReview,
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

  const [reviewQuestions, setReviewQuestions] = useState<QuizAttemptDetailQuestion[] | null>(null);
  const [showAnswerSheet, setShowAnswerSheet] = useState(false);
  const [loadingReview, setLoadingReview] = useState(false);

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

  const handleOpenAnswerSheet = async () => {
    if (reviewQuestions) {
      setShowAnswerSheet(true);
      return;
    }
    setLoadingReview(true);
    try {
      if (getQuizReview) {
        const rev = await getQuizReview(quiz.id, email);
        if (rev && rev.length > 0) {
          setReviewQuestions(rev);
          setShowAnswerSheet(true);
          setLoadingReview(false);
          return;
        }
      }
    } catch (e) {
      console.error('[QuizAttemptView] Failed to fetch review:', e);
    }
    setLoadingReview(false);
    setShowAnswerSheet(true);
  };

  function handleConfirmSubmit() {
    setReviewOpen(false);
    void doSubmit(answers);
  }

  function retrySubmit() {
    if (phase.kind !== 'error' || !phase.retryable) return;
    submittedRef.current = false;
    void doSubmit(answersRef.current);
  }

  // ============ RESULT PHASES ==============================================
  if (phase.kind === 'scored' || phase.kind === 'already-attempted') {
    const percent =
      phase.totalMarks > 0 ? Math.round((phase.score / phase.totalMarks) * 100) : 0;
    
    // Stroke dash array for the SVG circle (2 * Math.PI * 45) ≈ 282.7
    const strokeDashoffset = 282.7 - (282.7 * percent) / 100;

    const displayReviewItems = reviewQuestions || displayQuestions.map((q) => {
      const selected = answers[q.id] ?? null;
      return {
        questionId: q.id,
        text: q.text,
        options: [...q.options],
        correctIndex: (q as any).correctIndex ?? -1,
        marks: 1,
        position: 0,
        studentAnswerIndex: selected,
      };
    });

    const correctCount = displayReviewItems.filter(
      (q: any) => q.correctIndex !== -1 && q.studentAnswerIndex === q.correctIndex
    ).length;
    const incorrectCount = displayReviewItems.filter(
      (q: any) => q.studentAnswerIndex !== null && q.correctIndex !== -1 && q.studentAnswerIndex !== q.correctIndex
    ).length;
    const unansCount = displayReviewItems.filter((q: any) => q.studentAnswerIndex === null).length;

    if (showAnswerSheet) {
      return (
        <div className="bg-transparent min-h-screen font-['Inter'] text-[#0d1c2e] dark:text-[#ffffff] pb-[100px]">
          <header className="sticky top-0 z-20 bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl border-b border-white/20 px-4 py-4 shadow-[2px_2px_5px_#BABECC,-2px_-2px_5px_#ffffff73] dark:shadow-[2px_2px_5px_#020617,-2px_-2px_5px_#1e293b73] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowAnswerSheet(false)}
                className="w-9 h-9 rounded-full bg-[#dde1e7] shadow-[inset_2px_2px_5px_#BABECC,inset_-2px_-2px_5px_#ffffff73] dark:bg-[#0f172a] dark:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73] hover:bg-[#e6eeff] dark:bg-[#3730a3] text-[#15157d] dark:text-[#818cf8] flex items-center justify-center transition-colors"
                title="Back to Summary"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </button>
              <div>
                <h1 className="font-bold text-[18px] text-[#0d1c2e] dark:text-[#ffffff] leading-tight">Answer Sheet & Review</h1>
                <p className="text-[12px] text-[#464652] dark:text-[#cbd5e1]">Detailed breakdown of your answers</p>
              </div>
            </div>
            <div className="text-right">
              <span className="font-bold text-[18px] text-[#15157d] dark:text-[#818cf8]">{phase.score}/{phase.totalMarks}</span>
              <span className="text-[11px] text-[#464652] dark:text-[#cbd5e1] block font-semibold uppercase">Score</span>
            </div>
          </header>

          <main className="max-w-2xl mx-auto px-4 py-6">
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-[#e6f4ea] border border-[#ceead6] rounded-xl p-3 text-center">
                <span className="material-symbols-outlined text-[#137333] text-[22px] block mb-1">check_circle</span>
                <span className="font-bold text-[20px] text-[#137333] block leading-none">{correctCount}</span>
                <span className="text-[12px] font-semibold text-[#137333]">Correct</span>
              </div>
              <div className="bg-[#fce8e6] border border-[#fad2cf] rounded-xl p-3 text-center">
                <span className="material-symbols-outlined text-[#c5221f] text-[22px] block mb-1">cancel</span>
                <span className="font-bold text-[20px] text-[#c5221f] block leading-none">{incorrectCount}</span>
                <span className="text-[12px] font-semibold text-[#c5221f]">Incorrect</span>
              </div>
              <div className="bg-[#f1f3f4] border border-[#e3e5e8] rounded-xl p-3 text-center">
                <span className="material-symbols-outlined text-[#5f6368] text-[22px] block mb-1">help</span>
                <span className="font-bold text-[20px] text-[#5f6368] block leading-none">{unansCount}</span>
                <span className="text-[12px] font-semibold text-[#5f6368]">Unanswered</span>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {displayReviewItems.map((q: any, idx: number) => {
                const isCorrect = q.correctIndex !== -1 && q.studentAnswerIndex === q.correctIndex;
                const isIncorrect = q.studentAnswerIndex !== null && q.correctIndex !== -1 && q.studentAnswerIndex !== q.correctIndex;
                const isUnanswered = q.studentAnswerIndex === null;

                return (
                  <div key={q.questionId || idx} className="bg-white/40 dark:bg-[#1e293b]/40 backdrop-blur-xl rounded-2xl shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] border border-white/20 dark:border-white/10 p-5 shadow-[0px_2px_12px_rgba(46,49,146,0.04)] border border-white/20">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-bold text-[13px] text-[#15157d] dark:text-[#818cf8] uppercase tracking-wider">Question {idx + 1}</span>
                      {isCorrect && <span className="inline-flex items-center gap-1 bg-[#e6f4ea] text-[#137333] font-semibold text-[12px] px-3 py-1 rounded-full border border-[#ceead6]"><span className="material-symbols-outlined text-[14px]">check</span> Correct</span>}
                      {isIncorrect && <span className="inline-flex items-center gap-1 bg-[#fce8e6] text-[#c5221f] font-semibold text-[12px] px-3 py-1 rounded-full border border-[#fad2cf]"><span className="material-symbols-outlined text-[14px]">close</span> Incorrect</span>}
                      {isUnanswered && <span className="inline-flex items-center gap-1 bg-[#f1f3f4] text-[#5f6368] font-semibold text-[12px] px-3 py-1 rounded-full border border-[#e3e5e8]"><span className="material-symbols-outlined text-[14px]">remove</span> Unanswered</span>}
                    </div>
                    <p className="font-semibold text-[15px] text-[#0d1c2e] dark:text-[#ffffff] mb-4 leading-relaxed">{q.text}</p>
                    <div className="flex flex-col gap-2">
                      {q.options.map((optText: string, optIdx: number) => {
                        const isCorrectOption = q.correctIndex !== -1 && optIdx === q.correctIndex;
                        const isStudentChoice = optIdx === q.studentAnswerIndex;
                        let optionStyle = "border-white/20 bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl text-[#464652] dark:text-[#cbd5e1]";
                        let badge = null;
                        if (isCorrectOption) {
                          optionStyle = "border-[#34a853] bg-[#f6fbf7] text-[#137333] font-semibold shadow-[2px_2px_5px_#BABECC,-2px_-2px_5px_#ffffff73] dark:shadow-[2px_2px_5px_#020617,-2px_-2px_5px_#1e293b73]";
                          badge = <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-bold text-[#137333] bg-[#e6f4ea] px-2.5 py-0.5 rounded-full border border-[#ceead6]"><span className="material-symbols-outlined text-[14px]">check_circle</span> Correct Answer</span>;
                        } else if (isStudentChoice) {
                          optionStyle = "border-[#ea4335] bg-[#fef7f6] text-[#c5221f] font-semibold shadow-[2px_2px_5px_#BABECC,-2px_-2px_5px_#ffffff73] dark:shadow-[2px_2px_5px_#020617,-2px_-2px_5px_#1e293b73]";
                          badge = <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-bold text-[#c5221f] bg-[#fce8e6] px-2.5 py-0.5 rounded-full border border-[#fad2cf]"><span className="material-symbols-outlined text-[14px]">cancel</span> Your Answer</span>;
                        }
                        return (
                          <div key={optIdx} className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all text-[14px] ${optionStyle}`}>
                            <span className="w-6 h-6 rounded-full bg-white border border-current flex items-center justify-center shrink-0 font-bold text-[12px]">{String.fromCharCode(65 + optIdx)}</span>
                            <span className="flex-grow">{optText}</span>
                            {badge}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </main>
          <div className="fixed bottom-0 left-0 right-0 bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl border-t border-white/20 p-4 shadow-[0px_-4px_20px_rgba(0,0,0,0.05)] flex items-center gap-3 z-30">
            <button type="button" onClick={() => setShowAnswerSheet(false)} className="flex-1 bg-[#dde1e7] shadow-[inset_2px_2px_5px_#BABECC,inset_-2px_-2px_5px_#ffffff73] dark:bg-[#0f172a] dark:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73] hover:bg-[#e6eeff] dark:bg-[#3730a3] text-[#15157d] dark:text-[#818cf8] font-semibold py-3.5 px-4 rounded-xl text-[14px] transition-colors flex items-center justify-center gap-2"><span className="material-symbols-outlined text-[18px]">arrow_back</span>Back to Score</button>
            <button type="button" onClick={() => void signOut()} className="flex-1 bg-[#15157d] dark:bg-[#818cf8] hover:bg-[#ba1a1a] dark:hover:bg-[#ff5449] text-white font-semibold py-3.5 px-4 rounded-xl text-[14px] transition-colors flex items-center justify-center gap-2 shadow-[4px_4px_8px_#BABECC,-4px_-4px_8px_#ffffff73] dark:shadow-[4px_4px_8px_#020617,-4px_-4px_8px_#1e293b73]"><span className="material-symbols-outlined text-[18px]">logout</span>Logout</button>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-transparent min-h-screen font-['Inter'] text-[#0d1c2e] dark:text-[#ffffff] relative overflow-hidden flex flex-col items-center justify-center pb-[env(safe-area-inset-bottom)]">
        <main className="w-full h-full flex flex-col px-4 py-12 z-10 max-w-md mx-auto">
          <header className="text-center mb-10">
            <h1 className="font-semibold text-[32px] text-[#15157d] dark:text-[#818cf8] mb-2 tracking-tight">
              {phase.kind === 'scored' ? (phase.auto ? 'Auto-submitted' : 'Quiz Completed!') : 'Already Attempted'}
            </h1>
            <p className="text-[18px] text-[#464652] dark:text-[#cbd5e1]">
              {phase.kind === 'scored' 
                ? "Your score has been successfully recorded." 
                : messages.auth.alreadyAttempted}
            </p>
          </header>

          <div className="flex justify-center items-center mb-10 relative">
            <div className="relative w-64 h-64 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" fill="none" r="45" stroke="#e6eeff" strokeWidth="8"></circle>
                <circle 
                  className="transition-all duration-1000 ease-out" 
                  cx="50" cy="50" fill="none" r="45" 
                  stroke="url(#gradient)" 
                  strokeDasharray="282.7" 
                  strokeDashoffset={strokeDashoffset} 
                  strokeLinecap="round" strokeWidth="8"
                ></circle>
                <defs>
                  <linearGradient id="gradient" x1="0%" x2="100%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#15157d"></stop>
                    <stop offset="100%" stopColor="#d4af37"></stop>
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-bold text-[32px] text-[#15157d] dark:text-[#818cf8]">{percent}%</span>
                <span className="font-semibold text-[13px] text-[#464652] dark:text-[#cbd5e1] uppercase tracking-wider mt-1">Score</span>
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-tr from-[#15157d]/5 to-[#d4af37]/5 rounded-full pointer-events-none blur-xl"></div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-10">
            <div className="bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl rounded-xl p-4 flex flex-col items-center justify-center  border border-white/20">
              <span className="material-symbols-outlined text-[#15157d] dark:text-[#818cf8] mb-2 text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>fact_check</span>
              <span className="font-semibold text-[24px] text-[#0d1c2e] dark:text-[#ffffff]">{phase.score}/{phase.totalMarks}</span>
              <span className="font-semibold text-[13px] text-[#464652] dark:text-[#cbd5e1] text-center mt-1">Total Marks</span>
            </div>
            <div className="bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl rounded-xl p-4 flex flex-col items-center justify-center  border border-white/20">
              <span className="material-symbols-outlined text-[#d4af37] mb-2 text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>timer</span>
              <span className="font-semibold text-[24px] text-[#0d1c2e] dark:text-[#ffffff]">{formatTime(postResultSecondsLeft)}</span>
              <span className="font-semibold text-[13px] text-[#464652] dark:text-[#cbd5e1] text-center mt-1">Auto-close in</span>
            </div>
          </div>

          <div className="mt-auto pb-6 w-full flex flex-col gap-3">
            <button 
              onClick={handleOpenAnswerSheet}
              disabled={loadingReview}
              className="w-full bg-[#15157d] dark:bg-[#818cf8] text-white rounded-full py-4 font-semibold text-[14px] flex items-center justify-center gap-2  hover:bg-[#0c0092] dark:bg-[#6366f1] transition-colors focus:outline-none focus:ring-4 focus:ring-[#15157d]/20 active:scale-95 disabled:opacity-50"
            >
              {loadingReview ? (
                <><span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> Loading answer sheet...</>
              ) : (
                <><span className="material-symbols-outlined text-[18px]">assignment_turned_in</span> View Answer Sheet</>
              )}
            </button>
            <button 
              onClick={() => void signOut()}
              className="w-full bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl text-[#ba1a1a] dark:text-[#ff5449] border border-white/20 rounded-full py-3.5 font-semibold text-[14px] flex items-center justify-center gap-2 shadow-[2px_2px_5px_#BABECC,-2px_-2px_5px_#ffffff73] dark:shadow-[2px_2px_5px_#020617,-2px_-2px_5px_#1e293b73] hover:bg-[#fce8e6] dark:hover:bg-[#410002] transition-colors active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
              Logout
            </button>
          </div>
        </main>
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
    <div className="min-h-screen bg-transparent text-[#0d1c2e] dark:text-[#ffffff] flex flex-col pb-[env(safe-area-inset-bottom)] font-['Inter'] transition-colors duration-500">
      {/* --- Sticky top: title, progress, PROMINENT timer --------------- */}
      <header className="sticky top-0 z-20 bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl shadow-[2px_2px_5px_#BABECC,-2px_-2px_5px_#ffffff73] dark:shadow-[2px_2px_5px_#020617,-2px_-2px_5px_#1e293b73] w-full mx-auto transition-colors duration-500">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 h-16 w-full relative gap-2">
          <button type="button" onClick={handleOpenReview} className="flex items-center justify-center p-2 text-[#464652] dark:text-[#cbd5e1] hover:bg-[#dce9ff] rounded-full transition-colors active:scale-95 duration-200">
            <span className="material-symbols-outlined">menu</span>
          </button>
          
          <h1 className="font-semibold text-[24px] text-[#15157d] dark:text-[#818cf8] tracking-tight truncate px-4 flex-1">
            {quiz.title ?? 'Quiz'}
          </h1>
          
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className={`flex items-center gap-2 font-bold px-3 py-1.5 rounded-full text-white shadow-[4px_4px_8px_#BABECC,-4px_-4px_8px_#ffffff73] dark:shadow-[4px_4px_8px_#020617,-4px_-4px_8px_#1e293b73] transition-colors duration-300 ${remainingSeconds !== null && remainingSeconds < 60 ? 'bg-[#ba1a1a] animate-pulse' : 'bg-[#15157d] dark:bg-[#818cf8]'}`}>
              <span className="material-symbols-outlined text-[18px]">timer</span>
              <span className="text-[14px] tracking-widest tabular-nums">{formatTime(remainingSeconds)}</span>
            </div>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full max-w-4xl mx-auto h-1 bg-[#d5e3fc] dark:bg-[#1e1b4b]">
          <div 
            className="h-full bg-[#15157d] dark:bg-[#818cf8] transition-[width] duration-1000 ease-linear" 
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>

        {/* --- Question palette strip (horizontal, scrollable) --------- */}
        <div className="mx-auto max-w-4xl px-4 py-2 bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" role="tablist" aria-label="Questions">
            {displayQuestions.map((q, i) => {
              const isAnswered = answers[q.id] !== undefined;
              const isMarked = markedForReview.has(q.id);
              let cls =
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors ';
              if (isAnswered && isMarked) {
                cls += 'border-[#0c0092] bg-[#0c0092] dark:bg-[#6366f1] text-white ring-2 ring-yellow-400';
              } else if (isAnswered) {
                cls += 'border-[#15157d] dark:border-[#818cf8] bg-[#eff4ff] dark:bg-[#0f172a] dark:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73] text-[#15157d] dark:text-[#818cf8]';
              } else if (isMarked) {
                cls += 'border-yellow-500 bg-yellow-50 text-yellow-600';
              } else {
                cls += 'border-white/20 dark:border-[#334155] bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl text-[#464652] dark:text-[#cbd5e1] hover:bg-[#e6eeff] dark:bg-[#3730a3]';
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
      <main className="mx-auto max-w-4xl px-4 py-6 w-full flex-1">
        <div className="flex flex-col gap-6">
          {displayQuestions.map((question, qIndex) => {
            const isAnswered = answers[question.id] !== undefined;
            const isMarked = markedForReview.has(question.id);
            return (
              <article
                key={question.id}
                id={`question-${question.id}`}
                className={`scroll-mt-[10rem] rounded-xl  bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl p-6 relative transition-[border-color,box-shadow] duration-200 ease-standard border ${
                  isMarked ? 'border-yellow-400/80 ring-2 ring-yellow-400/20' : 'border-transparent'
                }`}
                aria-disabled={isSubmitting}
              >
                <button
                  type="button"
                  onClick={() => toggleMarkForReview(question.id)}
                  className={`absolute top-6 right-6 transition-colors ${
                    isMarked ? 'text-yellow-500 hover:text-yellow-600' : 'text-[#c7c5d4] hover:text-[#15157d] dark:hover:text-[#818cf8] dark:text-[#818cf8]'
                  }`}
                  aria-pressed={isMarked}
                  aria-label={isMarked ? 'Unmark question' : 'Mark for review'}
                  title={isMarked ? 'Unmark' : 'Mark for review'}
                >
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: isMarked ? "'FILL' 1" : "'FILL' 0" }}>star</span>
                </button>
                
                <div className="mb-4 flex items-center gap-2">
                  <span className="px-2 py-1 bg-[#e6eeff] dark:bg-[#3730a3] text-[#464652] dark:text-[#cbd5e1] font-semibold text-[10px] rounded uppercase tracking-wide">
                    Question {qIndex + 1}
                  </span>
                </div>
                
                <h2 className="text-[18px] leading-7 font-semibold text-[#0d1c2e] dark:text-[#ffffff] mb-6 pr-12 break-words">
                  {question.text}
                </h2>

                <div className="space-y-4">
                  {question.options.map((option, oIndex) => {
                    const selected = answers[question.id] === oIndex;
                    return (
                      <label
                        key={oIndex}
                        className="block relative group cursor-pointer"
                      >
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          value={oIndex}
                          checked={selected}
                          onChange={() => selectOption(question.id, oIndex)}
                          disabled={isSubmitting}
                          className="peer sr-only"
                        />
                        <div className={`flex items-center gap-4 p-4 rounded-xl  border transition-all min-h-[64px] ${
                          selected 
                            ? 'border-[#15157d] dark:border-[#818cf8] bg-[#e1e0ff] shadow-[0px_0px_0px_4px_rgba(99,102,241,0.2)]'
                            : 'border-transparent bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl hover:border-[#15157d] dark:border-[#818cf8] hover:bg-[#e6eeff] dark:bg-[#3730a3]'
                        }`}>
                          <div className={`flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center font-semibold text-[13px] transition-colors relative ${
                            selected
                              ? 'border-[#15157d] dark:border-[#818cf8] bg-[#15157d] dark:bg-[#818cf8] text-white'
                              : 'border-white/20 dark:border-[#334155] text-[#464652] dark:text-[#cbd5e1]'
                          }`}>
                            {selected ? (
                              <span className="material-symbols-outlined text-[16px] absolute" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                            ) : (
                              String.fromCharCode(65 + oIndex)
                            )}
                          </div>
                          <span className={`text-[16px] leading-6 flex-1 break-words ${
                            selected ? 'text-[#04006d] font-semibold' : 'text-[#0d1c2e] dark:text-[#ffffff] group-hover:text-[#15157d] dark:hover:text-[#818cf8] dark:text-[#818cf8]'
                          }`}>
                            {option}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {isAnswered && (
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => clearAnswer(question.id)}
                      disabled={isSubmitting}
                      className="text-sm font-medium text-[#777683] dark:text-[#94a3b8] hover:text-[#ba1a1a] transition-colors flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">backspace</span>
                      Clear selection
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {/* --- Sticky Bottom Action Bar --------------------------------------- */}
        <nav className="fixed bottom-0 left-0 w-full flex justify-center z-50">
          <div className="w-full max-w-4xl flex justify-between items-center px-4 py-3 bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl shadow-[0_-4px_20px_rgba(46,49,146,0.05)] border-t border-[#dce9ff]">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const currentIdx = displayQuestions.findIndex(q => !answers[q.id]);
                  const targetIdx = currentIdx > 0 ? currentIdx - 1 : 0;
                  if (displayQuestions[targetIdx]) scrollToQuestion(displayQuestions[targetIdx].id);
                }}
                className="flex flex-col items-center justify-center text-[#464652] dark:text-[#cbd5e1] px-4 py-2 hover:bg-[#e6eeff] dark:bg-[#3730a3] transition-colors rounded-lg active:scale-95"
              >
                <span className="material-symbols-outlined mb-1 text-[20px]">expand_circle_up</span>
                <span className="font-semibold text-[11px] uppercase tracking-wide">Prev Unanswered</span>
              </button>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-sm text-[#464652] dark:text-[#cbd5e1]">
                <span className="font-semibold text-[#0d1c2e] dark:text-[#ffffff]">{answeredCount}</span> answered
                {unansweredCount > 0 && (
                  <>
                    {' · '}
                    <span className="font-semibold text-[#ba1a1a]">{unansweredCount}</span> left
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={handleOpenReview}
                disabled={isSubmitting}
                className="flex items-center justify-center bg-[#15157d] dark:bg-[#818cf8] text-white rounded-full px-6 py-3 font-semibold text-[13px] shadow-[4px_4px_8px_#BABECC,-4px_-4px_8px_#ffffff73] dark:shadow-[4px_4px_8px_#020617,-4px_-4px_8px_#1e293b73] hover:bg-[#0c0092] dark:bg-[#6366f1] hover:shadow-[inset_2px_2px_5px_#BABECC,inset_-2px_-2px_5px_#ffffff73] dark:hover:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <span className="mr-2">
                  {isSubmitting && (phase as { auto?: boolean }).auto ? 'Auto-submitting…' : 'Review & Submit'}
                </span>
                {!isSubmitting && (
                  <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">chevron_right</span>
                )}
              </button>
            </div>
          </div>
        </nav>
      </main>

      {/* --- Review-before-submit modal ------------------------------- */}
      {reviewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-title"
          className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center motion-safe:animate-in motion-safe:fade-in backdrop-blur-sm"
        >
          <div className="w-full max-w-lg bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl rounded-t-3xl shadow-[0px_-4px_20px_rgba(46,49,146,0.15)] flex flex-col max-h-[85vh] motion-safe:animate-in motion-safe:slide-in-from-bottom-full">
            {/* Drag Handle / Header */}
            <div className="flex flex-col items-center pt-4 pb-2 border-b border-[#dce9ff] bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl rounded-t-3xl shrink-0 px-6 relative">
              <button 
                type="button" 
                onClick={() => setReviewOpen(false)}
                className="absolute right-6 top-4 text-[#464652] dark:text-[#cbd5e1] hover:bg-[#e6eeff] dark:bg-[#3730a3] p-2 rounded-full transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
              <div className="w-12 h-1.5 bg-[#c7c5d4] rounded-full mb-4"></div>
              <div className="flex justify-between items-center w-full">
                <h2 id="review-title" className="text-[24px] leading-8 font-semibold text-[#0d1c2e] dark:text-[#ffffff] tracking-tight">Review Exam</h2>
                <div className="flex items-center gap-2 bg-[#2e3192] text-white rounded-full px-4 py-1.5 shadow-[2px_2px_5px_#BABECC,-2px_-2px_5px_#ffffff73] dark:shadow-[2px_2px_5px_#020617,-2px_-2px_5px_#1e293b73]">
                  <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>timer</span>
                  <span className="font-semibold text-[13px] tabular-nums tracking-wide">{formatTime(remainingSeconds)}</span>
                </div>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {/* Metrics Row */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="flex flex-col items-center gap-2 bg-[#eff4ff] dark:bg-[#0f172a] dark:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73] border border-white/20 dark:border-[#334155] rounded-xl p-3 shadow-[2px_2px_5px_#BABECC,-2px_-2px_5px_#ffffff73] dark:shadow-[2px_2px_5px_#020617,-2px_-2px_5px_#1e293b73]">
                  <div className="w-8 h-8 rounded-full bg-[#e6f4ea] text-[#137333] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  </div>
                  <div className="text-center">
                    <span className="block font-semibold text-[16px] text-[#0d1c2e] dark:text-[#ffffff]">{answeredCount}</span>
                    <span className="block text-[10px] text-[#777683] dark:text-[#94a3b8] font-semibold uppercase tracking-wider">Answered</span>
                  </div>
                </div>
                
                <div className="flex flex-col items-center gap-2 bg-[#eff4ff] dark:bg-[#0f172a] dark:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73] border border-[#ffdad6] rounded-xl p-3 shadow-[2px_2px_5px_#BABECC,-2px_-2px_5px_#ffffff73] dark:shadow-[2px_2px_5px_#020617,-2px_-2px_5px_#1e293b73]">
                  <div className="w-8 h-8 rounded-full bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
                  </div>
                  <div className="text-center">
                    <span className="block font-semibold text-[16px] text-[#0d1c2e] dark:text-[#ffffff]">{unansweredCount}</span>
                    <span className="block text-[10px] text-[#ba1a1a] font-semibold uppercase tracking-wider">Unanswered</span>
                  </div>
                </div>
                
                <div className="flex flex-col items-center gap-2 bg-[#eff4ff] dark:bg-[#0f172a] dark:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73] border border-[#fce8b2] rounded-xl p-3 shadow-[2px_2px_5px_#BABECC,-2px_-2px_5px_#ffffff73] dark:shadow-[2px_2px_5px_#020617,-2px_-2px_5px_#1e293b73]">
                  <div className="w-8 h-8 rounded-full bg-[#fef7e0] text-[#b06000] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>flag</span>
                  </div>
                  <div className="text-center">
                    <span className="block font-semibold text-[16px] text-[#0d1c2e] dark:text-[#ffffff]">{markedCount}</span>
                    <span className="block text-[10px] text-[#b06000] font-semibold uppercase tracking-wider">Marked</span>
                  </div>
                </div>
              </div>

              {/* Attention List Header */}
              {(unansweredCount > 0 || markedCount > 0) ? (
                <>
                  <h3 className="text-[16px] leading-6 font-semibold text-[#464652] dark:text-[#cbd5e1] mb-3">Needs Attention</h3>
                  <div className="space-y-3 pb-4">
                    {displayQuestions.map((q, i) => {
                      const isAnswered = answers[q.id] !== undefined;
                      const isMarked = markedForReview.has(q.id);
                      if (isAnswered && !isMarked) return null;
                      return (
                        <div key={q.id} className="flex items-center justify-between p-3 bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl border border-white/20 dark:border-[#334155] rounded-lg shadow-[0px_4px_20px_rgba(46,49,146,0.02)] transition-all">
                          <div className="flex items-center gap-3">
                            {!isAnswered ? (
                              <span className="material-symbols-outlined text-[#ba1a1a]" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
                            ) : (
                              <span className="material-symbols-outlined text-[#b06000]" style={{ fontVariationSettings: "'FILL' 1" }}>flag</span>
                            )}
                            <div>
                              <p className="font-semibold text-[13px] text-[#0d1c2e] dark:text-[#ffffff]">Question {i + 1}</p>
                              <p className={`text-[12px] ${!isAnswered ? 'text-[#ba1a1a]' : 'text-[#b06000]'}`}>
                                {!isAnswered ? 'Unanswered' : 'Marked for Review'}
                              </p>
                            </div>
                          </div>
                          <button 
                            type="button"
                            onClick={() => {
                              setReviewOpen(false);
                              window.setTimeout(() => scrollToQuestion(q.id), 100);
                            }}
                            className="font-semibold text-[13px] text-[#15157d] dark:text-[#818cf8] bg-[#eff4ff] dark:bg-[#0f172a] dark:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73] px-4 py-2 rounded-lg hover:bg-[#dce9ff] transition-colors"
                          >
                            Jump
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-sm text-[#464652] dark:text-[#cbd5e1]">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#e6f4ea] text-[#137333] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                  </div>
                  <h3 className="text-lg font-semibold text-[#0d1c2e] dark:text-[#ffffff] mb-1">All questions answered!</h3>
                  <p>You're ready to submit your exam.</p>
                </div>
              )}
            </div>

            {/* Sticky Footer */}
            <div className="border-t border-[#dce9ff] bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl px-6 py-4 shrink-0 shadow-[0px_-2px_10px_rgba(0,0,0,0.02)] pb-safe">
              {unansweredCount > 0 && (
                <p className="text-[#ba1a1a] text-center font-semibold text-[13px] mb-3">
                  <span className="material-symbols-outlined text-[14px] align-middle mr-1">warning</span>
                  {unansweredCount} question{unansweredCount > 1 ? 's' : ''} remaining unanswered
                </p>
              )}
              <button 
                type="button" 
                onClick={handleConfirmSubmit}
                className="w-full bg-gradient-to-r from-[#15157d] to-[#4f54b4] hover:from-[#0c0092] hover:to-[#3e4399] text-white font-semibold text-[14px] py-4 rounded-xl shadow-[4px_4px_8px_#BABECC,-4px_-4px_8px_#ffffff73] dark:shadow-[4px_4px_8px_#020617,-4px_-4px_8px_#1e293b73] hover:shadow-[inset_2px_2px_5px_#BABECC,inset_-2px_-2px_5px_#ffffff73] dark:hover:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73] transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
