/**
 * Admin Session Creation data-access wrapper (task 12.1).
 *
 * Wraps the `create_session(p_batch_id, p_start_year, p_current_sem,
 * p_section_count)` `SECURITY DEFINER` RPC (migration
 * `0046_session_creation_and_duplicate_guard.sql`) behind a typed
 * interface, following the same shape as {@link createAdminTeacherAccess}.
 * All statements go through `.rpc(...)`, never ad-hoc SQL.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import { unwrap } from './support';

/** Input to {@link AdminSessionAccess.createSession}. */
export interface CreateSessionInput {
  readonly batchId: string;
  readonly startYear: number;
  readonly currentSem: number;
  readonly sectionCount: number;
}

/** The jsonb shape `create_session()` resolves to. */
export type CreateSessionResult =
  | { readonly status: 'created'; readonly batchId: string; readonly sectionIds: readonly string[] }
  | { readonly status: 'denied'; readonly reason: string };

/** Supabase-backed access for the `AdminSessionCreationPage`. */
export interface AdminSessionAccess {
  /**
   * Create a new Batch plus its shared Sections via the `create_session()`
   * RPC. `is_admin()`-gated server-side; a duplicate `batchId` resolves
   * `{status: 'denied', reason: 'duplicate-batch-code'}`, never throws.
   */
  createSession(input: CreateSessionInput): Promise<CreateSessionResult>;
}

/** Create an {@link AdminSessionAccess} bound to the given Supabase client. */
export function createAdminSessionAccess(
  client: SupabaseClient = defaultClient,
): AdminSessionAccess {
  return {
    async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
      const payload = unwrap(
        await client.rpc('create_session', {
          p_batch_id: input.batchId,
          p_start_year: input.startYear,
          p_current_sem: input.currentSem,
          p_section_count: input.sectionCount,
        }),
      );
      return payload as CreateSessionResult;
    },
  };
}
