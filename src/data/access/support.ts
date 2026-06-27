/**
 * Shared support utilities for the Supabase data-access wrappers (task 16.2).
 *
 * Every wrapper goes through the parameterized Supabase query builder
 * (`.from().select()/.insert()/.upsert()`) and the `SECURITY DEFINER` DB
 * functions (`.rpc(...)`), never ad-hoc string-built SQL (Requirement 17.4).
 * This module centralizes the infrastructure-error handling the design calls
 * for: a Supabase failure is surfaced as a typed {@link DataAccessError} so the
 * caller (UI layer) can show a retry-able error rather than crashing the view.
 */

import type { PostgrestError } from '@supabase/supabase-js';

/**
 * The shape every Supabase query/RPC resolves to: either `data` or a
 * non-null `error`. Modeled structurally so the wrappers do not depend on the
 * exact generic instantiation of the untyped client.
 */
export interface SupabaseResponse<T> {
  readonly data: T | null;
  readonly error: PostgrestError | null;
}

/**
 * An infrastructure-level failure from the data layer (network, RLS denial,
 * constraint violation, etc.). Distinct from a domain `ValidationError`, which
 * represents user-correctable input problems caught before persistence.
 */
export class DataAccessError extends Error {
  /** The underlying Postgrest error code, when one was provided. */
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'DataAccessError';
    this.code = code;
  }
}

/**
 * Unwrap a Supabase response, returning its `data` on success and throwing a
 * {@link DataAccessError} when the query reported an error. A successful query
 * that legitimately returns no rows yields `null`, which callers handle as an
 * empty result.
 */
export function unwrap<T>(response: SupabaseResponse<T>): T | null {
  if (response.error !== null) {
    throw new DataAccessError(response.error.message, response.error.code);
  }
  return response.data;
}

/**
 * Unwrap a response whose `data` is a list, normalizing a missing/`null`
 * payload to an empty array so list reads never produce `null`.
 */
export function unwrapList<T>(response: SupabaseResponse<T[]>): T[] {
  return unwrap(response) ?? [];
}

/**
 * Assert a write (insert/update/upsert/delete) succeeded, throwing a
 * {@link DataAccessError} on failure. Used for operations whose `data` is not
 * needed by the caller.
 */
export function expectOk(response: { error: PostgrestError | null }): void {
  if (response.error !== null) {
    throw new DataAccessError(response.error.message, response.error.code);
  }
}
