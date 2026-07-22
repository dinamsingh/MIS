/**
 * Step 4 (conditional) — Set your password.
 *
 * Shown only when `profile.mustResetPassword` is true: the teacher's
 * Supabase Auth account was auto-created by an admin with a random temporary
 * password, and they must choose their own before onboarding can finish.
 * Calls `setTeacherPassword(newPassword)` (which also clears
 * `must_reset_password` server-side) and only then proceeds to the actual
 * save (`onFinish`, i.e. `saveOnboarding(...)`).
 */

import { useState } from 'react';
import Stepper from '../components/Stepper';
import { messages } from '@domain/shared/messages';

const MIN_PASSWORD_LENGTH = 8;

interface PasswordStepProps {
  readonly saving: boolean;
  readonly onBack: () => void;
  /** Set the new password, then proceed to `saveOnboarding(...)`. */
  readonly onSubmit: (newPassword: string) => Promise<void>;
}

export default function PasswordStep({ saving, onBack, onSubmit }: PasswordStepProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(messages.onboardingPassword.passwordTooShort);
      return;
    }
    if (password !== confirmPassword) {
      setError(messages.onboardingPassword.passwordsDoNotMatch);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.onboardingPassword.passwordUpdateFailed);
      setSubmitting(false);
    }
  };

  const busy = submitting || saving;

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-6">
      <Stepper current="password" includePassword />

      <div>
        <h1 className="text-2xl font-bold text-text">Set your password</h1>
        <p className="mt-1 text-sm text-soft">
          Your account was created with a temporary password. Choose a new password to continue.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="onb-new-password" className="text-sm font-medium text-text">
            New password
          </label>
          <input
            id="onb-new-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
            className="rounded-control border border-input bg-surface px-4 py-2.5 text-sm font-semibold text-text focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25"
            autoComplete="new-password"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="onb-confirm-password" className="text-sm font-medium text-text">
            Confirm password
          </label>
          <input
            id="onb-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={busy}
            className="rounded-control border border-input bg-surface px-4 py-2.5 text-sm font-semibold text-text focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25"
            autoComplete="new-password"
            required
          />
        </div>
      </div>

      {error && (
        <p className="rounded-control bg-status-red/10 px-4 py-2 text-sm font-medium text-status-red">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} disabled={busy} className="btn-secondary disabled:opacity-50">
          Back
        </button>
        <button type="submit" disabled={busy} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? 'Saving…' : 'Finish setup ✓'}
        </button>
      </div>
    </form>
  );
}
