/**
 * Admin teacher-approval data-access wrapper (task 6.1;
 * admin-console-and-scheduling-upgrade).
 *
 * Wraps two plain table reads (`allowed_teacher_emails`, `public.teachers`)
 * and two `SECURITY DEFINER` RPCs (`add_allowed_teacher` from migration
 * 0027, `remove_allowed_teacher` from migration 0044) behind a typed
 * interface, following the same shape as {@link createRosterImportAccess}.
 * All statements go through the parameterized Supabase query builder or
 * `.rpc(...)`, never ad-hoc SQL (Requirement 17.4).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import { unwrap, unwrapList } from './support';

/** A row from `public.allowed_teacher_emails`. */
export interface AllowedTeacherEmailRow {
  readonly email: string;
  readonly addedBy: string | null;
  readonly createdAt: string;
}

/** A row from `public.teachers`, annotated with onboarded status. */
export interface AdminTeacherRow {
  readonly id: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly onboarded: boolean;
}

/** The jsonb shape every add/remove-allowlist RPC resolves to. */
export interface AllowlistRpcResult {
  readonly status: string;
  readonly reason?: string;
  readonly email?: string;
}

/**
 * Discriminated result of calling `POST /api/admin-create-teacher`. `created`
 * carries the one-time temporary password — it is never persisted or logged
 * client-side and must be shown to the admin exactly once.
 */
export type CreateTeacherAccountResult =
  | { readonly status: 'created'; readonly email: string; readonly temporaryPassword: string; readonly warning?: string }
  | { readonly status: 'denied'; readonly reason: string }
  | { readonly status: 'already-exists' }
  | { readonly status: 'failed'; readonly message: string };

/** Supabase-backed access for the `AdminTeacherApprovalPage`. */
export interface AdminTeacherAccess {
  /** List every `allowed_teacher_emails` row, most recently added first. */
  listAllowedTeacherEmails(): Promise<AllowedTeacherEmailRow[]>;
  /** List every `public.teachers` row (id, name, email, onboarded). */
  listTeachers(): Promise<AdminTeacherRow[]>;
  /** Add an email to the allowlist via the existing `add_allowed_teacher()` RPC. */
  addAllowedTeacherEmail(email: string): Promise<AllowlistRpcResult>;
  /** Remove an email from the allowlist via the `remove_allowed_teacher()` RPC. */
  removeAllowedTeacherEmail(email: string): Promise<AllowlistRpcResult>;
  /**
   * Create a Supabase Auth account + allowlist entry for a new teacher via
   * the `admin-create-teacher` Cloudflare Pages Function. Server-side
   * verifies the caller is an admin (via the bearer token + `is_admin()`) —
   * never trusts a client-supplied claim.
   */
  createTeacherAccount(email: string): Promise<CreateTeacherAccountResult>;
}

interface AllowedTeacherEmailDbRow {
  readonly email: string;
  readonly added_by: string | null;
  readonly created_at: string;
}

interface TeacherDbRow {
  readonly id: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly onboarded: boolean | null;
}

/** Create an {@link AdminTeacherAccess} bound to the given Supabase client. */
export function createAdminTeacherAccess(
  client: SupabaseClient = defaultClient,
): AdminTeacherAccess {
  return {
    async listAllowedTeacherEmails(): Promise<AllowedTeacherEmailRow[]> {
      const rows = unwrapList(
        await client
          .from('allowed_teacher_emails')
          .select('email, added_by, created_at')
          .order('created_at', { ascending: false }),
      ) as AllowedTeacherEmailDbRow[];

      return rows.map((row) => ({
        email: row.email,
        addedBy: row.added_by,
        createdAt: row.created_at,
      }));
    },

    async listTeachers(): Promise<AdminTeacherRow[]> {
      const rows = unwrapList(
        await client
          .from('teachers')
          .select('id, name, email, onboarded')
          .order('name', { ascending: true }),
      ) as TeacherDbRow[];

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        onboarded: row.onboarded === true,
      }));
    },

    async addAllowedTeacherEmail(email: string): Promise<AllowlistRpcResult> {
      const payload = unwrap(
        await client.rpc('add_allowed_teacher', { p_email: email }),
      );
      return payload as AllowlistRpcResult;
    },

    async removeAllowedTeacherEmail(email: string): Promise<AllowlistRpcResult> {
      const payload = unwrap(
        await client.rpc('remove_allowed_teacher', { p_email: email }),
      );
      return payload as AllowlistRpcResult;
    },

    async createTeacherAccount(email: string): Promise<CreateTeacherAccountResult> {
      const { data: sessionData } = await client.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        return { status: 'denied', reason: 'not-authenticated' };
      }

      let response: Response;
      try {
        response = await fetch('/api/admin-create-teacher', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ email }),
        });
      } catch {
        return { status: 'failed', message: 'Could not reach the server. Check your connection and try again.' };
      }

      let body: { status?: string; email?: string; temporaryPassword?: string; warning?: string; error?: string } = {};
      try {
        body = await response.json();
      } catch {
        // fall through to status-based handling below
      }

      if (response.status === 403) {
        return { status: 'denied', reason: body.error ?? 'Not authorized.' };
      }
      if (response.status === 409) {
        return { status: 'already-exists' };
      }
      if (!response.ok || !body.temporaryPassword || !body.email) {
        return { status: 'failed', message: body.error ?? 'Could not create the teacher account. Please try again.' };
      }

      return {
        status: 'created',
        email: body.email,
        temporaryPassword: body.temporaryPassword,
        ...(body.warning ? { warning: body.warning } : {}),
      };
    },
  };
}
