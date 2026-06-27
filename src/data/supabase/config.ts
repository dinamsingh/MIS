/**
 * Supabase configuration and secret handling (Requirements 18.1, 18.2, 18.3).
 *
 * Secret handling rules enforced here:
 *  - Only the Supabase URL and the **Anon_Key** are read for the frontend
 *    bundle. The Anon_Key is the anonymous public API key that is safe to ship
 *    to the browser (Req 18.1).
 *  - The privileged **Service_Role_Key** is NEVER referenced anywhere in this
 *    module or any other frontend code. Privileged operations are implemented
 *    server-side as `SECURITY DEFINER` Postgres functions, not via a
 *    client-side service role (Req 18.2).
 *  - All values are loaded from environment variables rather than hard-coded
 *    constants (Req 18.3). In the static Vite bundle that means the
 *    `VITE_`-prefixed `import.meta.env` entries.
 *
 * `readSupabaseConfig` is a pure function over an injected environment record
 * so it can be unit-tested without depending on `import.meta.env`.
 */

import { type Result, ok, err } from '../../domain/shared/result';

/** Resolved, validated configuration required to create the Supabase client. */
export interface SupabaseConfig {
  /** Supabase project URL (`VITE_SUPABASE_URL`). */
  readonly url: string;
  /** Supabase Anon_Key — the only key exposed to the frontend (`VITE_SUPABASE_ANON_KEY`). */
  readonly anonKey: string;
}

/** Reasons configuration resolution can fail. */
export type SupabaseConfigError =
  | { readonly kind: 'missing-url' }
  | { readonly kind: 'missing-anon-key' };

/** Environment variable names read for Supabase configuration. */
export const SUPABASE_URL_ENV = 'VITE_SUPABASE_URL';
export const SUPABASE_ANON_KEY_ENV = 'VITE_SUPABASE_ANON_KEY';

/**
 * A minimal view of the build-time environment: a record of string-keyed,
 * possibly-undefined string values. `import.meta.env` is structurally
 * compatible with this shape.
 */
export type EnvRecord = Readonly<Record<string, string | undefined>>;

/** Normalize an env value to a trimmed non-empty string, or undefined. */
function readNonEmpty(env: EnvRecord, key: string): string | undefined {
  const raw = env[key];
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolve the Supabase configuration from an environment record, reading only
 * the URL and Anon_Key. Returns a failed Result when a required secret is
 * missing rather than throwing, so callers can surface a clear error.
 *
 * This function never reads a Service_Role_Key — it has no knowledge of one.
 */
export function readSupabaseConfig(env: EnvRecord): Result<SupabaseConfig, SupabaseConfigError> {
  const url = readNonEmpty(env, SUPABASE_URL_ENV);
  if (url === undefined) {
    return err({ kind: 'missing-url' });
  }

  const anonKey = readNonEmpty(env, SUPABASE_ANON_KEY_ENV);
  if (anonKey === undefined) {
    return err({ kind: 'missing-anon-key' });
  }

  return ok({ url, anonKey });
}
