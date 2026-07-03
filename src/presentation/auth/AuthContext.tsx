/**
 * Authentication context and provider (task 17.1).
 *
 * Holds the current {@link Actor} for the React tree and keeps it in sync with
 * Supabase's session via {@link AuthService.subscribe}, which also restores an
 * existing session on load (Req 1.5) and clears it on sign-out (Req 1.6).
 *
 * The actor exposed here is used for **navigation gating only** — route guards
 * and the sidebar decide what to render based on it, while Postgres RLS remains
 * the authoritative authorization boundary. The provider deliberately exposes
 * only sign-in and sign-out actions: there is no teacher signup (Req 1.1, 1.7)
 * and no student signup (Req 2.9).
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Actor, AuthError } from '@domain/shared/types';
import type { Result } from '@domain/shared/result';
import {
  authService as defaultAuthService,
  type AuthService,
  type GoogleSignInOptions,
  type LoginIntent,
} from '@data/access/authService';

/** The value provided to consumers of the auth context. */
export interface AuthContextValue {
  /** The current actor, resolved from the active session (gating only). */
  readonly actor: Actor;
  /** True until the initial session restoration completes. */
  readonly isLoading: boolean;
  /** Convenience flag: the current actor is the pre-provisioned teacher. */
  readonly isTeacher: boolean;
  /** Sign in the teacher with email/password (Req 1.2, 1.4). */
  signInTeacherPassword(email: string, password: string): Promise<Result<Actor, AuthError>>;
  /** Send a one-time login code to a registered teacher email. */
  sendEmailOtp(email: string): Promise<Result<void, AuthError>>;
  /** Verify the emailed OTP and establish the session. */
  verifyEmailOtp(email: string, token: string): Promise<Result<Actor, AuthError>>;
  /** Start Google OAuth for a teacher or student (Req 1.3, 2.3). */
  signInWithGoogle(intent: LoginIntent, options?: GoogleSignInOptions): Promise<Result<void, AuthError>>;
  /** Terminate the active session (Req 1.6). */
  signOut(): Promise<void>;
}

const ANONYMOUS: Actor = { kind: 'anonymous' };

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  /** Auth service to use; defaults to the shared Supabase-backed instance. */
  service?: AuthService;
  children: ReactNode;
}

/**
 * Provides authentication state to the React tree. On mount it restores any
 * existing session and subscribes to subsequent session changes so the actor
 * stays current across token refreshes, sign-in, and sign-out.
 */
export function AuthProvider({ service = defaultAuthService, children }: AuthProviderProps) {
  const [actor, setActor] = useState<Actor>(ANONYMOUS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Restore the existing session on load (Req 1.5).
    void service
      .getCurrentActor()
      .then((restored) => {
        if (active) {
          setActor(restored);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setActor(ANONYMOUS);
          setIsLoading(false);
        }
      });

    // Track sign-in / sign-out / token-refresh thereafter.
    const unsubscribe = service.subscribe((next) => {
      if (active) {
        setActor(next);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [service]);

  const value = useMemo<AuthContextValue>(
    () => ({
      actor,
      isLoading,
      isTeacher: actor.kind === 'teacher',
      signInTeacherPassword: (email, password) => service.signInTeacherPassword(email, password),
      sendEmailOtp: (email) => service.sendEmailOtp(email),
      verifyEmailOtp: (email, token) => service.verifyEmailOtp(email, token),
      signInWithGoogle: (intent, options) => service.signInWithGoogle(intent, options),
      signOut: () => service.signOut(),
    }),
    [actor, isLoading, service],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access the auth context; throws when used outside an {@link AuthProvider}. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
