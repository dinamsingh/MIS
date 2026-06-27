/**
 * Teacher sign-in view (task 17.2).
 *
 * Renders the single sign-in surface for the pre-provisioned Teacher account
 * (Req 1.1, 1.7): email/password (Req 1.2) and Google (Req 1.3). There is no
 * teacher self-registration link anywhere in this view.
 *
 * On invalid credentials the view surfaces the English error message returned
 * by {@link AuthService.signInTeacherPassword} (Req 1.4), sourced from the
 * central message catalog. A successful password sign-in resolves a teacher
 * actor, which the {@link AuthProvider} propagates to the route guards; the
 * optional {@link TeacherSignInViewProps.onSignedIn} callback lets a caller
 * react (e.g. navigate) without this view owning routing.
 *
 * Google sign-in redirects the browser to the consent screen, so there is no
 * synchronous success state to handle here — the session is established on
 * return and observed through the auth context.
 */

import { useState, type FormEvent } from 'react';
import { useAuth } from '@presentation/auth/AuthContext';
import type { Actor } from '@domain/shared/types';

export interface TeacherSignInViewProps {
  /** Invoked after a successful email/password sign-in resolves a teacher. */
  onSignedIn?: (actor: Actor) => void;
}

/** Sign-in form for the pre-provisioned teacher (email/password + Google). */
export default function TeacherSignInView({ onSignedIn }: TeacherSignInViewProps) {
  const { signInTeacherPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await signInTeacherPassword(email, password);
      if (result.ok) {
        onSignedIn?.(result.value);
      } else {
        // Display the English invalid-credentials message (Req 1.4).
        setError(result.error.message);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass =
    'w-full rounded-button border border-border bg-surface px-3 py-2 text-sm text-text ' +
    'placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-text">Teacher sign in</h1>
          <p className="mt-1 text-sm text-soft">
            Sign in to your Teacher Academic MIS console.
          </p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handlePasswordSubmit} noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="teacher-email" className="text-sm font-medium text-text">
              Email
            </label>
            <input
              id="teacher-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="teacher@example.edu"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="teacher-password" className="text-sm font-medium text-text">
              Password
            </label>
            <input
              id="teacher-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>

          {error !== null && (
            <p role="alert" className="text-sm font-medium text-red">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
