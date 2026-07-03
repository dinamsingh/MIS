/**
 * Teacher sign-in view — passwordless email OTP flow.
 *
 * Step 1 (email): the teacher enters their registered college email and we send
 * a one-time login code. `sendEmailOtp` uses `shouldCreateUser: false`, so only
 * pre-provisioned (registered) emails can receive a code — an unregistered
 * email is rejected with an English message.
 *
 * Step 2 (code): the teacher enters the 6-digit code; on success the session is
 * established and the onboarding gate / dashboard routing takes over (a new
 * teacher lands on /onboarding, a returning one on /dashboard).
 */

import { useState, type FormEvent } from 'react';
import { useAuth } from '@presentation/auth/AuthContext';
import type { Actor } from '@domain/shared/types';

export interface TeacherSignInViewProps {
  /** Invoked after a successful OTP verification resolves a teacher/session. */
  onSignedIn?: (actor: Actor) => void;
}

type Step = 'email' | 'code';

/** Passwordless (email + OTP) sign-in for the pre-provisioned teacher. */
export default function TeacherSignInView({ onSignedIn }: TeacherSignInViewProps) {
  const { sendEmailOtp, verifyEmailOtp } = useAuth();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputClass =
    'w-full rounded-button border border-border bg-surface px-3 py-2 text-sm text-text ' +
    'placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setIsSubmitting(true);
    try {
      const result = await sendEmailOtp(email);
      if (result.ok) {
        setStep('code');
        setInfo(`We sent a 6-digit code to ${email.trim()}. Enter it below.`);
      } else {
        setError(result.error.message);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await verifyEmailOtp(email, code);
      if (result.ok) {
        onSignedIn?.(result.value);
      } else {
        setError(result.error.message);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-text">Teacher sign in</h1>
          <p className="mt-1 text-sm text-soft">
            {step === 'email'
              ? 'Sign in with your registered college email.'
              : 'Enter the code we emailed you.'}
          </p>
        </div>

        {step === 'email' ? (
          <form className="flex flex-col gap-4" onSubmit={handleSendCode} noValidate>
            <div className="flex flex-col gap-1">
              <label htmlFor="teacher-email" className="text-sm font-medium text-text">
                College email
              </label>
              <input
                id="teacher-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@college.edu"
              />
              <p className="text-xs text-muted">Login code, attendance &amp; notifications go here.</p>
            </div>

            {error !== null && (
              <p role="alert" className="text-sm font-medium text-red">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Sending code…' : 'Send login code'}
            </button>
          </form>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleVerify} noValidate>
            {info !== null && (
              <p className="rounded-button bg-accent-tint px-3 py-2 text-xs font-medium text-accent">
                {info}
              </p>
            )}

            <div className="flex flex-col gap-1">
              <label htmlFor="teacher-otp" className="text-sm font-medium text-text">
                6-digit code
              </label>
              <input
                id="teacher-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={`${inputClass} tracking-[0.4em]`}
                placeholder="••••••"
              />
            </div>

            {error !== null && (
              <p role="alert" className="text-sm font-medium text-red">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Verifying…' : 'Verify & sign in'}
            </button>

            <button
              type="button"
              className="w-full text-center text-sm font-medium text-accent hover:underline"
              onClick={() => {
                setStep('email');
                setCode('');
                setError(null);
                setInfo(null);
              }}
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
