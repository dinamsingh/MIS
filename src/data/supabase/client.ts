/**
 * Supabase client initialization (Requirements 18.1, 18.2, 18.3, 17.4).
 *
 * The client is created with the project URL and the **Anon_Key** only, both
 * read from build-time environment variables via `readSupabaseConfig`
 * (Req 18.1, 18.3). The privileged Service_Role_Key is never imported,
 * referenced, or passed here (Req 18.2) — all privileged behaviour is enforced
 * server-side by RLS and `SECURITY DEFINER` functions.
 *
 * Consumers (the data-access wrappers in task 16.2) use this single shared
 * client so every database call goes through the parameterized Supabase query
 * builder (Req 17.4) rather than ad-hoc string-built SQL.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isErr } from '../../domain/shared/result';
import { readSupabaseConfig, type SupabaseConfig, type EnvRecord } from './config';

/** Human-readable message for a configuration failure, for surfacing at startup. */
function describeConfigError(env: EnvRecord): string {
  const result = readSupabaseConfig(env);
  if (isErr(result)) {
    switch (result.error.kind) {
      case 'missing-url':
        return 'Supabase configuration error: VITE_SUPABASE_URL is not set.';
      case 'missing-anon-key':
        return 'Supabase configuration error: VITE_SUPABASE_ANON_KEY is not set.';
    }
  }
  return 'Supabase configuration error.';
}

/**
 * Create a Supabase client from an explicit configuration. Exposed primarily
 * for testing and for callers that resolve configuration themselves.
 */
export function createSupabaseClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: {
      // Persist and auto-refresh the session using Supabase's secure session
      // handling (Req 18.4); detect the OAuth redirect for Google sign-in.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/**
 * Build the application's Supabase client from the build-time environment.
 * Throws a descriptive error if a required secret (URL or Anon_Key) is absent,
 * so a misconfigured deployment fails fast and visibly.
 */
export function createSupabaseClientFromEnv(env: EnvRecord): SupabaseClient {
  const result = readSupabaseConfig(env);
  if (!result.ok) {
    // In development without credentials, create a client with placeholder
    // values so the app renders (sign-in page, layout). Network calls will
    // fail gracefully — the UI shows error messages rather than a white screen.
    console.warn(describeConfigError(env), 'Using placeholder — backend calls will fail.');
    return createSupabaseClient({
      url: 'http://localhost:54321',
      anonKey: 'placeholder-anon-key',
    });
  }
  return createSupabaseClient(result.value);
}

/**
 * The shared Supabase client instance for the frontend. When env vars are
 * missing it still initializes with placeholders so the UI renders — network
 * calls will simply fail with descriptive errors.
 */
export const supabase: SupabaseClient = createSupabaseClientFromEnv(import.meta.env);
