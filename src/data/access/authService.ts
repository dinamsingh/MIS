/**
 * Authentication & session service (`authService`) — task 17.1.
 *
 * Thin wrapper over Supabase Auth that establishes and restores sessions for
 * the two actor classes the system serves:
 *
 *  - **Teacher** — the single pre-provisioned administrator, who signs in with
 *    email/password (Req 1.2) or Google (Req 1.3). There is **no teacher
 *    self-registration flow** (Req 1.1, 1.7): this service exposes only sign-in
 *    methods, never a sign-up method.
 *  - **Student** — an unregistered learner who reaches the system through a
 *    shareable link and signs in with Google on demand. There is **no student
 *    signup or password-creation flow** (Req 2.9): students only ever sign in
 *    with Google.
 *
 * The service also restores an existing session on load (Req 1.5: a teacher
 * session grants full access while active) and terminates it on sign-out
 * (Req 1.6), using Supabase's secure, auto-refreshing session handling
 * configured on the shared client.
 *
 * It exposes the current {@link Actor} for **navigation gating only**. The
 * authoritative authorization boundary is Postgres RLS — the actor kind
 * resolved here decides what UI/navigation to render, never what data a user
 * may read or write.
 */

import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import { type Result, ok, err } from '../../domain/shared/result';
import type { Actor, AuthError } from '../../domain/shared/types';
import { messages } from '../../domain/shared/messages';

/** Which sign-in flow the user initiated. Controls the OAuth return target. */
export type LoginIntent = 'teacher' | 'student';

/** Environment variable naming the pre-provisioned teacher identity. */
export const TEACHER_EMAIL_ENV = 'VITE_TEACHER_EMAIL';

/**
 * Configuration for resolving an actor's kind from a session. The teacher is
 * identified by a `role: 'teacher'` claim in `app_metadata` or, as a fallback,
 * by matching the configured teacher email. This mirrors the server-side
 * `is_teacher()` check but is used for navigation gating only.
 */
export interface ActorResolutionConfig {
  /** Configured teacher email used to gate navigation (RLS is authoritative). */
  readonly teacherEmail?: string;
}

/** Options accepted when starting a Google OAuth sign-in. */
export interface GoogleSignInOptions {
  /** Explicit post-consent return URL; defaults from the intent + current URL. */
  readonly redirectTo?: string;
}

/**
 * Read the configured teacher email from a build-time environment record.
 * Pure over the injected record so it can be tested without `import.meta.env`.
 */
export function readTeacherEmail(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const raw = env[TEACHER_EMAIL_ENV];
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Decide whether an authenticated user is the Teacher (navigation gating only).
 * True when the user carries a `role: 'teacher'` claim in `app_metadata`, or
 * when the user's email equals the configured teacher email (case-insensitive).
 */
export function isTeacherUser(user: User, config: ActorResolutionConfig): boolean {
  const role = (user.app_metadata as Record<string, unknown> | undefined)?.['role'];
  if (role === 'teacher') {
    return true;
  }
  const configured = config.teacherEmail?.trim().toLowerCase();
  const email = user.email?.trim().toLowerCase();
  return configured !== undefined && configured.length > 0 && email === configured;
}

/** Extract a display name for a student from the Google profile metadata. */
function studentName(user: User): string {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = metadata['full_name'];
  if (typeof fullName === 'string' && fullName.trim().length > 0) {
    return fullName;
  }
  const name = metadata['name'];
  if (typeof name === 'string' && name.trim().length > 0) {
    return name;
  }
  return user.email ?? '';
}

/**
 * Map a Supabase session to a domain {@link Actor}. A missing session resolves
 * to `anonymous`; a teacher user resolves to a `teacher` actor; any other
 * authenticated user resolves to a `student` actor. The student's enrollment
 * number is not known from the session alone and is left `null` here — the
 * roster/enrollment flow (task 17.2) resolves and stores it.
 *
 * Pure and deterministic so the actor-resolution logic can be tested in
 * isolation from Supabase.
 */
export function actorFromSession(
  session: Session | null,
  config: ActorResolutionConfig,
): Actor {
  const user = session?.user;
  if (!user) {
    return { kind: 'anonymous' };
  }
  if (isTeacherUser(user, config)) {
    return { kind: 'teacher', userId: user.id, email: user.email ?? '' };
  }
  return {
    kind: 'student',
    userId: user.id,
    email: user.email ?? '',
    name: studentName(user),
    enrollmentNumber: null,
  };
}

/**
 * The authentication service surface consumed by the presentation layer.
 *
 * Note the deliberate absence of any `signUp*` method: the teacher account is
 * pre-provisioned (Req 1.1, 1.7) and students never create accounts (Req 2.9).
 */
export interface AuthService {
  /** Sign in the pre-provisioned teacher with email/password (Req 1.2, 1.4). */
  signInTeacherPassword(email: string, password: string): Promise<Result<Actor, AuthError>>;
  /**
   * Send a one-time login code to a REGISTERED teacher email. Uses
   * `shouldCreateUser: false`, so an email that is not a provisioned Supabase
   * Auth user is rejected — this enforces "only registered emails may log in".
   */
  sendEmailOtp(email: string): Promise<Result<void, AuthError>>;
  /** Verify the emailed OTP code and, on success, establish the session. */
  verifyEmailOtp(email: string, token: string): Promise<Result<Actor, AuthError>>;
  /**
   * Start Google OAuth for a teacher or student (Req 1.3, 2.3, 2.4). This
   * redirects the browser to Google; the session is established on return and
   * surfaced via {@link AuthService.getCurrentActor} / {@link AuthService.subscribe}.
   */
  signInWithGoogle(intent: LoginIntent, options?: GoogleSignInOptions): Promise<Result<void, AuthError>>;
  /** Terminate the active session (Req 1.6). */
  signOut(): Promise<void>;
  /** Resolve the current actor from the restored session (Req 1.5). */
  getCurrentActor(): Promise<Actor>;
  /**
   * Subscribe to session changes (sign-in, sign-out, token refresh, restore).
   * Invokes the listener with the resolved actor and returns an unsubscribe fn.
   */
  subscribe(listener: (actor: Actor) => void): () => void;
}

/** Resolve the default OAuth return URL for an intent, when in a browser. */
function defaultRedirect(intent: LoginIntent): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  // Teachers return to the application root; students return to the shareable
  // link they arrived on so the quiz/enrollment flow can resume in place.
  return intent === 'teacher' ? window.location.origin : window.location.href;
}

/**
 * Create an {@link AuthService} bound to the given Supabase client and actor
 * resolution config. Exposed for testing and for callers that resolve
 * configuration themselves.
 */
export function createAuthService(
  client: SupabaseClient = defaultClient,
  config: ActorResolutionConfig = {},
): AuthService {
  return {
    async signInTeacherPassword(
      email: string,
      password: string,
    ): Promise<Result<Actor, AuthError>> {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        // Invalid credentials are rejected with an English message (Req 1.4).
        return err<AuthError>({
          code: 'invalid_credentials',
          message: messages.auth.invalidCredentials,
        });
      }
      return ok(actorFromSession(data.session, config));
    },

    async sendEmailOtp(email: string): Promise<Result<void, AuthError>> {
      const trimmed = email.trim();
      if (trimmed.length === 0) {
        return err<AuthError>({ code: 'invalid_email', message: 'Enter your college email.' });
      }
      const { error } = await client.auth.signInWithOtp({
        email: trimmed,
        // Do NOT create new users — only pre-provisioned (registered) teacher
        // emails can request a code.
        options: { shouldCreateUser: false },
      });
      if (error) {
        const status = (error as unknown as { status?: number }).status;
        const msg = error.message?.toLowerCase() ?? '';
        if (status && status >= 500) {
          return err<AuthError>({
            code: 'server_unavailable',
            message: 'Server temporarily unavailable. Try again in a moment, or use password login below.',
          });
        }
        if (msg.includes('rate limit')) {
          return err<AuthError>({
            code: 'rate_limited',
            message: 'Too many attempts. Please wait a few minutes before trying again.',
          });
        }
        return err<AuthError>({
          code: 'otp_send_failed',
          message: 'This email is not registered, or the code could not be sent. Contact your admin.',
        });
      }
      return ok(undefined);
    },

    async verifyEmailOtp(email: string, token: string): Promise<Result<Actor, AuthError>> {
      const { data, error } = await client.auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type: 'email',
      });
      if (error || !data.session) {
        return err<AuthError>({
          code: 'otp_invalid',
          message: 'That code is invalid or expired. Please try again.',
        });
      }
      return ok(actorFromSession(data.session, config));
    },

    async signInWithGoogle(
      intent: LoginIntent,
      options?: GoogleSignInOptions,
    ): Promise<Result<void, AuthError>> {
      const redirectTo = options?.redirectTo ?? defaultRedirect(intent);
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        ...(redirectTo !== undefined ? { options: { redirectTo } } : {}),
      });
      if (error) {
        return err<AuthError>({
          code: 'oauth_failed',
          message: messages.error.generic,
        });
      }
      return ok(undefined);
    },

    async signOut(): Promise<void> {
      await client.auth.signOut();
    },

    async getCurrentActor(): Promise<Actor> {
      const { data } = await client.auth.getSession();
      return actorFromSession(data.session, config);
    },

    subscribe(listener: (actor: Actor) => void): () => void {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(actorFromSession(session, config));
      });
      return () => data.subscription.unsubscribe();
    },
  };
}

/**
 * The shared application auth service, configured from the build-time
 * environment. Reads the teacher identity from `VITE_TEACHER_EMAIL` for
 * navigation gating; the Service_Role_Key is never involved.
 */
export const authService: AuthService = createAuthService(defaultClient, {
  teacherEmail: readTeacherEmail(import.meta.env),
});
