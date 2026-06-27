/**
 * Public entry point for the Supabase data layer.
 *
 * Re-exports the shared client and the secret-handling helpers. Only the
 * Anon_Key is ever exposed to the frontend; the Service_Role_Key is never
 * referenced (Requirements 18.1, 18.2, 18.3).
 */

export {
  supabase,
  createSupabaseClient,
  createSupabaseClientFromEnv,
} from './client';

export {
  readSupabaseConfig,
  SUPABASE_URL_ENV,
  SUPABASE_ANON_KEY_ENV,
  type SupabaseConfig,
  type SupabaseConfigError,
  type EnvRecord,
} from './config';
