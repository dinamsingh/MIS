/**
 * Teacher sign-in view — passwordless email OTP (primary) + password fallback.
 *
 * Flow:
 *   1. Email step  → teacher enters registered email → "Send login code"
 *   2. Code step   → 6-digit OTP → "Verify & sign in"
 *   3. Password mode (fallback) — if OTP fails or teacher prefers password
 *
 * `sendEmailOtp` uses `shouldCreateUser: false`, so only registered emails work.
 * Password login uses existing `signInTeacherPassword` (always available as backup).
 */

import { useState, type FormEvent } from 'react';
import { useAuth } from '@presentation/auth/AuthContext';
import type { Actor } from '@domain/shared/types';

export interface TeacherSignInViewProps {
  onSignedIn?: (actor: Actor) => void;
}

type Step = 'email' | 'code' | 'password';

export default function TeacherSignInView({ onSignedIn }: TeacherSignInViewProps) {
  const { sendEmailOtp, verifyEmailOtp, signInTeacherPassword } = useAuth();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
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

  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await signInTeacherPassword(email, password);
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

  function switchToPassword() {
    setStep('password');
    setError(null);
    setInfo(null);
    setCode('');
  }

  function switchToOtp() {
    setStep('email');
    setError(null);
    setInfo(null);
    setPassword('');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-text">Teacher sign in</h1>
          <p className="mt-1 text-sm text-soft">
            {step === 'email' && 'Sign in with your registered college email.'}
            {step === 'code' && 'Enter the code we emailed you.'}
            {step === 'password' && 'Sign in with email and password.'}
          </p>
        </div>

        {/* Step 1 — Email (send OTP) */}
        {step === 'email' && (
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

            {error && <p role="alert" className="text-sm font-medium text-red">{error}</p>}

            <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Sending code…' : 'Send login code'}
            </button>

            <button type="button" className="w-full text-center text-xs font-medium text-muted hover:text-accent hover:underline" onClick={switchToPassword}>
              Use password instead
            </button>
          </form>
        )}

        {/* Step 2 — OTP code verify */}
        {step === 'code' && (
          <form className="flex flex-col gap-4" onSubmit={handleVerify} noValidate>
            {info && (
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

            {error && <p role="alert" className="text-sm font-medium text-red">{error}</p>}

            <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Verifying…' : 'Verify & sign in'}
            </button>

            <div className="flex justify-between">
              <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => { setStep('email'); setCode(''); setError(null); setInfo(null); }}>
                Use different email
              </button>
              <button type="button" className="text-xs font-medium text-muted hover:text-accent hover:underline" onClick={switchToPassword}>
                Use password instead
              </button>
            </div>
          </form>
        )}

        {/* Password fallback */}
        {step === 'password' && (
          <form className="flex flex-col gap-4" onSubmit={handlePasswordLogin} noValidate>
            <div className="flex flex-col gap-1">
              <label htmlFor="pw-email" className="text-sm font-medium text-text">
                Email
              </label>
              <input
                id="pw-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@college.edu"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="pw-password" className="text-sm font-medium text-text">
                Password
              </label>
              <input
                id="pw-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>

            {error && <p role="alert" className="text-sm font-medium text-red">{error}</p>}

            <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in with password'}
            </button>

            <button type="button" className="w-full text-center text-xs font-medium text-accent hover:underline" onClick={switchToOtp}>
              ← Back to login code
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
