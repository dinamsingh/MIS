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
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { OtpInput } from '../components/ui/OtpInput';
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
    <div className="min-h-screen flex flex-col font-['Inter'] antialiased bg-transparent text-[#0d1c2e] dark:text-[#ffffff] transition-colors duration-500">
      <style dangerouslySetInnerHTML={{__html: `
        . { box-shadow: 0px 4px 20px rgba(46, 49, 146, 0.05); }
        .focus-glow:focus-within { box-shadow: 0px 0px 0px 4px rgba(99, 102, 241, 0.2); }
        input:-webkit-autofill,
        input:-webkit-autofill:hover, 
        input:-webkit-autofill:focus, 
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 30px #ffffff inset !important;
          -webkit-text-fill-color: #0d1c2e !important;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}} />
      <header className="bg-surface/80 backdrop-blur-xl border-b border-border w-full top-0 z-50 sticky transition-all duration-300">
        <div className="flex justify-between items-center px-6 h-16 w-full max-w-[1280px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#2e3192] flex items-center justify-center text-[#9da1ff] shadow-[2px_2px_5px_#BABECC,-2px_-2px_5px_#ffffff73] dark:shadow-[2px_2px_5px_#020617,-2px_-2px_5px_#1e293b73]">
              <span className="material-symbols-outlined text-[18px]">school</span>
            </div>
            <h1 className="text-xl font-semibold text-[#15157d] dark:text-[#818cf8] tracking-tight">Quiz Verification</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center p-4 w-full max-w-[1280px] mx-auto">
        <div className="w-full max-w-md flex flex-col gap-8">
          <div className="text-center space-y-2 mt-4">
            <div className="inline-flex items-center justify-center p-6 bg-[#d5e3fc] dark:bg-[#1e1b4b] rounded-full mb-2 ">
              <span className="material-symbols-outlined text-[32px] text-[#15157d] dark:text-[#818cf8]" style={{ fontVariationSettings: "'FILL' 1" }}>assignment</span>
            </div>
            <h2 className="text-[32px] leading-10 font-bold text-[#0d1c2e] dark:text-[#ffffff]">
               {quizMeta?.title || 'Quiz Assessment'}
            </h2>
            <p className="text-[15px] text-[#464652] dark:text-[#cbd5e1]">
               {quizMeta?.sectionNames && quizMeta.sectionNames.length > 0 
                  ? `For sections: ${quizMeta.sectionNames.join(', ')}`
                  : 'Please complete your verification to proceed.'}
            </p>
          </div>

          <div className="bg-surface p-8 rounded-[32px] shadow-card border border-border flex flex-col gap-6 relative overflow-hidden">
             {/* Soft inner glow top edge */}
             
             <div className="relative z-10 flex flex-col gap-6">
               {children}
             </div>
          </div>

          <div className="flex flex-col items-center gap-6 text-center mt-2 mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#eff4ff] dark:bg-[#0f172a] dark:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73] rounded-full border border-[#d5e3fc]">
              <span className="material-symbols-outlined text-[#15157d] dark:text-[#818cf8] text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
              <span className="text-sm font-semibold text-[#464652] dark:text-[#cbd5e1]">Verified Access Only</span>
            </div>
            <div className="flex gap-8 justify-center text-[#464652] dark:text-[#cbd5e1] text-sm">
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[18px]">timer</span>
                <span>Timed Assessment</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[18px]">format_list_numbered</span>
                <span>Proctored</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StepTracker({ step }: { step: 1 | 2 | 3 }) {
  return (
    <>
      <div className="flex items-center justify-center px-4 mb-8 mt-2 relative">
        {/* Connecting lines */}
        <div className={`absolute left-[15%] right-[50%] top-4 h-[2px] -z-10 transition-colors duration-500 ${step > 1 ? 'bg-[#15157d] dark:bg-[#818cf8] shadow-[0_0_8px_rgba(21,21,125,0.5)] dark:shadow-[0_0_8px_rgba(129,140,248,0.5)]' : 'bg-[#e2e8f0] dark:bg-white/10'}`}></div>
        <div className={`absolute left-[50%] right-[15%] top-4 h-[2px] -z-10 transition-colors duration-500 ${step > 2 ? 'bg-[#15157d] dark:bg-[#818cf8] shadow-[0_0_8px_rgba(21,21,125,0.5)] dark:shadow-[0_0_8px_rgba(129,140,248,0.5)]' : 'bg-[#e2e8f0] dark:bg-white/10'}`}></div>
        
        <div className="flex flex-col items-center relative z-10 flex-1">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${step > 1 ? 'bg-[#0c0092] dark:bg-[#6366f1] text-white shadow-[4px_4px_8px_#BABECC,-4px_-4px_8px_#ffffff73] dark:shadow-[4px_4px_8px_#020617,-4px_-4px_8px_#1e293b73]' : 'bg-[#15157d] dark:bg-[#818cf8] text-white shadow-[inset_2px_2px_5px_rgba(0,0,0,0.2)]'}`}>
            <span className="material-symbols-outlined text-[16px]">{step > 1 ? 'check' : 'mail'}</span>
          </div>
          <span className={`absolute -bottom-6 whitespace-nowrap text-[13px] font-semibold transition-colors duration-300 ${step >= 1 ? 'text-[#15157d] dark:text-[#818cf8]' : 'text-[#777683] dark:text-[#94a3b8]'}`}>Email</span>
        </div>
        
        <div className="flex flex-col items-center relative z-10 flex-1">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${step > 2 ? 'bg-[#0c0092] dark:bg-[#6366f1] text-white shadow-[4px_4px_8px_#BABECC,-4px_-4px_8px_#ffffff73] dark:shadow-[4px_4px_8px_#020617,-4px_-4px_8px_#1e293b73]' : step === 2 ? 'bg-[#15157d] dark:bg-[#818cf8] text-white shadow-[0_0_10px_rgba(21,21,125,0.4)] dark:shadow-[0_0_10px_rgba(129,140,248,0.4)]' : 'bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl border border-white/20 dark:border-white/10 text-[#777683] dark:text-[#94a3b8] shadow-[inset_2px_2px_5px_#BABECC,inset_-2px_-2px_5px_#ffffff73] dark:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73]'}`}>
            <span className="material-symbols-outlined text-[16px]">{step > 2 ? 'check' : 'lock'}</span>
          </div>
          <span className={`absolute -bottom-6 whitespace-nowrap text-[13px] font-semibold transition-colors duration-300 ${step >= 2 ? 'text-[#15157d] dark:text-[#818cf8]' : 'text-[#777683] dark:text-[#94a3b8]'}`}>OTP</span>
        </div>
        
        <div className="flex flex-col items-center relative z-10 flex-1">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${step >= 3 ? 'bg-[#15157d] dark:bg-[#818cf8] text-white shadow-[4px_4px_8px_#BABECC,-4px_-4px_8px_#ffffff73] dark:shadow-[4px_4px_8px_#020617,-4px_-4px_8px_#1e293b73]' : 'bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl border border-white/20 dark:border-white/10 text-[#777683] dark:text-[#94a3b8] shadow-[inset_2px_2px_5px_#BABECC,inset_-2px_-2px_5px_#ffffff73] dark:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73]'}`}>
            <span className="material-symbols-outlined text-[16px]">how_to_reg</span>
          </div>
          <span className={`absolute -bottom-6 whitespace-nowrap text-[13px] font-semibold transition-colors duration-300 ${step >= 3 ? 'text-[#15157d] dark:text-[#818cf8]' : 'text-[#777683] dark:text-[#94a3b8]'}`}>Access</span>
        </div>
      </div>
      <div className="h-px w-full bg-white/20 dark:bg-white/10 shadow-[0_1px_2px_rgba(0,0,0,0.05)] mb-6 mt-4"></div>
    </>
  );
}

const fieldLabelClass = 'block text-xs font-semibold uppercase tracking-wide text-muted';
const inputClass =
  'block w-full px-4 py-4 mt-2 border border-white/20 dark:border-white/10 rounded-xl bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl text-[#0d1c2e] dark:text-[#ffffff] font-medium placeholder:text-[#777683]/80 dark:placeholder:text-[#94a3b8]/80 focus:border-[#15157d] dark:border-[#818cf8] focus:ring-0 transition-colors shadow-[inset_2px_2px_5px_#BABECC,inset_-2px_-2px_5px_#ffffff73] dark:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73] text-sm';

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

  // Reset to email phase if the student logs out.
  useEffect(() => {
    if (actor.kind === 'anonymous' && phase.kind === 'granted') {
      setPhase({ kind: 'email-required', submitting: false, error: null });
      setEmailInput('');
      setOtpInput('');
      setEnrollmentInput('');
    }
  }, [actor.kind, phase.kind]);

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
          <div className="flex flex-col gap-2">
            <h1 className="text-[24px] leading-8 font-semibold text-text tracking-tight">Access Your Quiz</h1>
            <p className="text-soft">Enter your official college email to securely access this quiz.</p>

            <form className="mt-4 flex flex-col gap-6" onSubmit={handleEmailSubmit} noValidate>
              <div className="flex flex-col gap-2">
                <div className="relative rounded transition-all duration-200">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#15157d] dark:text-[#818cf8]">
                    <span className="material-symbols-outlined">alternate_email</span>
                  </div>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="block w-full pl-12 pr-4 py-4 border border-white/20 dark:border-white/10 rounded-xl bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl text-[#0d1c2e] dark:text-[#ffffff] font-medium placeholder:text-[#777683]/80 dark:placeholder:text-[#94a3b8]/80 focus:border-[#15157d] dark:border-[#818cf8] focus:ring-0 transition-colors shadow-[inset_2px_2px_5px_#BABECC,inset_-2px_-2px_5px_#ffffff73] dark:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73]"
                    placeholder="e.g. student@college.edu"
                  />
                </div>
                {phase.error !== null && (
                  <p role="alert" className="mt-1 text-sm font-medium text-status-red">
                    {phase.error}
                  </p>
                )}
              </div>

              <button type="submit" disabled={emailInput.trim() === '' || phase.submitting} className="w-full bg-accent hover:bg-accent/90 text-white font-semibold py-4 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed">
                {phase.submitting ? (
                  <><span className="material-symbols-outlined animate-spin">progress_activity</span> Sending code…</>
                ) : (
                  <><span className="relative z-10 flex items-center gap-2">Continue <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span></span></>
                )}
              </button>
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
          <div className="flex flex-col gap-2">
            <h1 className="text-[24px] leading-8 font-semibold text-[#0d1c2e] dark:text-[#ffffff] tracking-tight">Check your email</h1>
            <p className="text-[#464652] dark:text-[#cbd5e1]">
              We sent a verification code to <span className="font-semibold text-[#15157d] dark:text-[#818cf8]">{phase.email}</span>.
            </p>

            <form className="mt-4 flex flex-col gap-6" onSubmit={handleOtpSubmit} noValidate>
              <div className="flex flex-col gap-4 items-center w-full">
                <OtpInput 
                  value={otpInput} 
                  onChange={setOtpInput} 
                  disabled={phase.submitting} 
                />
                {phase.error !== null && (
                  <p role="alert" className="mt-1 text-sm font-medium text-[#ba1a1a]">
                    {phase.error}
                  </p>
                )}
              </div>

              <button type="submit" disabled={otpInput.trim().length < 6 || phase.submitting} className="w-full bg-[#15157d] dark:bg-[#818cf8] hover:bg-[#04006d] text-white font-semibold py-4 rounded-lg  hover:shadow-[inset_2px_2px_5px_#BABECC,inset_-2px_-2px_5px_#ffffff73] dark:hover:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73] transition-all duration-300 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed">
                {phase.submitting ? (
                  <><span className="material-symbols-outlined animate-spin">progress_activity</span> Verifying…</>
                ) : (
                  <><span className="relative z-10 flex items-center gap-2">Confirm OTP <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">check_circle</span></span></>
                )}
              </button>
            </form>
          </div>

          <div className="mt-6 flex flex-col items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => resendOtp(phase.email)}
              disabled={resendSecondsLeft > 0}
              className="font-semibold text-[#15157d] dark:text-[#818cf8] hover:text-[#0c0092] dark:hover:text-[#6366f1] dark:text-[#6366f1] disabled:text-[#777683] dark:text-[#94a3b8]"
            >
              {resendSecondsLeft > 0 ? `Resend code in ${resendSecondsLeft}s` : 'Resend code'}
            </button>
            <button
              type="button"
              onClick={() => setPhase({ kind: 'email-required', submitting: false, error: null })}
              className="text-[#464652] dark:text-[#cbd5e1] hover:text-[#0d1c2e] dark:hover:text-[#ffffff] dark:text-[#ffffff]"
            >
              Change email
            </button>
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
          <div className="bg-surface p-8 rounded-2xl shadow-card border border-border flex flex-col items-center text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#ffebee] text-[32px] text-[#ba1a1a]" aria-hidden="true">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
            </span>
            <h1 className="mt-4 text-[24px] font-bold text-[#0d1c2e] dark:text-[#ffffff]">{DENIED_COPY[phase.reason].title}</h1>
            <p className="mt-2 text-[15px] text-[#464652] dark:text-[#cbd5e1]">{DENIED_COPY[phase.reason].body}</p>
          </div>
        </QuizShell>
      );

    case 'already-attempted':
      return (
        <QuizShell>
          <div className="bg-surface p-8 rounded-2xl shadow-card border border-border flex flex-col items-center text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#dce9ff] text-[32px] text-[#15157d] dark:text-[#818cf8]" aria-hidden="true">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            </span>
            <h1 className="mt-4 text-[24px] font-bold text-[#0d1c2e] dark:text-[#ffffff]">Attempt already submitted</h1>
            <p className="mt-2 text-[15px] text-[#464652] dark:text-[#cbd5e1]">{messages.auth.alreadyAttempted}</p>
            <div className="mt-6 rounded-xl border border-border bg-surface-muted px-6 py-4 w-full">
              <p className="text-[32px] font-bold text-[#15157d] dark:text-[#818cf8]">
                {phase.score} <span className="text-lg font-semibold text-[#777683] dark:text-[#94a3b8]">/ {phase.totalMarks}</span>
              </p>
              <p className="mt-1 text-sm font-medium text-[#464652] dark:text-[#cbd5e1] uppercase tracking-wider">Your recorded score</p>
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
              <div className="bg-surface p-8 rounded-2xl shadow-card border border-border">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#777683] dark:text-[#94a3b8]">
                  {phase.quiz.questions.length} questions · {phase.quiz.timeLimitMinutes} min
                </p>
                <ol className="mt-4 flex flex-col gap-4">
                  {phase.quiz.questions.map((q, i) => (
                    <li key={q.id} className="rounded-xl border border-border bg-surface-muted p-5 text-left">
                      <p className="text-sm font-medium text-[#0d1c2e] dark:text-[#ffffff]">
                        {i + 1}. {q.text}
                      </p>
                      <ul className="mt-3 flex flex-col gap-2">
                        {q.options.map((opt, oi) => (
                          <li key={oi} className="flex items-center gap-3 text-sm text-[#464652] dark:text-[#cbd5e1]">
                            <input type="radio" disabled className="h-4 w-4 accent-[#15157d]" />
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
            <div className="bg-surface p-8 rounded-2xl shadow-card border border-border flex flex-col items-center text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#dce9ff] text-[32px] text-[#15157d] dark:text-[#818cf8]" aria-hidden="true">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              </span>
              <h1 className="mt-4 text-[24px] font-bold text-[#0d1c2e] dark:text-[#ffffff] break-words">
                {phase.quiz.title ?? 'You have been granted access'}
              </h1>
              <p className="mt-2 text-[15px] text-[#464652] dark:text-[#cbd5e1] break-words">
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
                        let reason: QuizAccessDeniedReason = 'not-authenticated';
                        if (err instanceof Error) {
                          const match = err.message.match(/start_quiz_attempt not started: (.+)/);
                          if (match && match[1]) {
                            reason = match[1] as QuizAccessDeniedReason;
                          }
                        }
                        // Fallback to error text if it's an unexpected Postgres error
                        if (reason === 'not-authenticated' && err instanceof Error && !err.message.includes('not-authenticated')) {
                          alert(`Unexpected error: ${err.message}`);
                        }
                        setPhase({ kind: 'denied', reason });
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
              <div className="bg-surface p-8 rounded-2xl shadow-card border border-border flex flex-col items-center text-center">
                <h1 className="text-[24px] font-bold text-[#0d1c2e] dark:text-[#ffffff]">Access granted</h1>
                <p className="mt-2 text-[15px] text-[#464652] dark:text-[#cbd5e1]">You may now attempt the quiz.</p>
              </div>
            </QuizShell>
          )}
        </>
      );

    default:
      return null;
  }
}
