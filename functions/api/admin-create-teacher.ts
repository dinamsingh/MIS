/**
 * Cloudflare Pages Function — POST /api/admin-create-teacher
 *
 * Admin-only: creates a Supabase Auth user for a new teacher (with a random
 * one-time temporary password returned in the response), adds the email to
 * `public.allowed_teacher_emails`, and pre-creates a `public.teachers` row
 * with `must_reset_password = true`. This combines what previously required
 * the admin to separately create the Auth user by hand in the Supabase
 * Dashboard.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` lives ONLY here (as a server-only environment
 * secret, never a `VITE_*` var) and is never sent to the browser. Every
 * privileged call (`auth.admin.createUser`, allowlist insert, teachers
 * upsert) happens on a service-role client, created only AFTER the caller is
 * verified to be an admin via their own session JWT + the `is_admin()` RPC —
 * a client-supplied "I am an admin" claim is never trusted.
 *
 * Request  (JSON): { email: string }
 * Header:          Authorization: Bearer <caller's Supabase access token>
 * Response (JSON): { status: 'created', email, temporaryPassword, warning? }
 *               or { error: '<message>' } with an appropriate 4xx/5xx status.
 *
 * Local dev: run `npx wrangler pages dev dist` (after `npm run build`); the
 * plain `npm run dev` server does not execute Pages Functions (see
 * `vite.config.ts`'s `mockApiPlugin` for the dev-only stub).
 */

import { createClient } from '@supabase/supabase-js';
import { isValidEmail, generateTemporaryPassword } from '../../src/domain/services/adminAccountService';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
    },
  });
}

export const onRequestOptions = (): Response => json({}, 204);

export const onRequestPost = async (context: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const { request, env } = context;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_ANON_KEY) {
    return json(
      { error: 'This server is not configured for admin account creation (missing Supabase env vars).' },
      503,
    );
  }

  // --- Authenticate + authorize the caller (never trust a client claim) ---
  const authHeader = request.headers.get('authorization') ?? request.headers.get('Authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const accessToken = bearerMatch?.[1]?.trim();
  if (!accessToken) {
    return json({ error: 'Not authorized.' }, 403);
  }

  const callerClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let isAdmin = false;
  try {
    const { data, error } = await callerClient.rpc('is_admin');
    isAdmin = !error && data === true;
  } catch {
    isAdmin = false;
  }

  if (!isAdmin) {
    return json({ error: 'Not authorized.' }, 403);
  }

  // --- Parse + validate the request body ---
  let body: { email?: unknown };
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    return json({ error: 'Enter a valid email address.' }, 400);
  }

  // --- Privileged operations: only via the service-role client, only now ---
  const adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const temporaryPassword = generateTemporaryPassword();

  const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
  });

  if (createError || !createdUser?.user) {
    const message = createError?.message?.toLowerCase() ?? '';
    if (message.includes('already') || message.includes('exists') || message.includes('registered')) {
      return json({ error: 'A user with this email already exists.' }, 409);
    }
    return json({ error: 'Could not create the teacher account. Please try again.' }, 502);
  }

  const userId = createdUser.user.id;
  let warning: string | undefined;

  // Allowlist insert (mirrors add_allowed_teacher()'s RPC body).
  const { error: allowlistError } = await adminClient
    .from('allowed_teacher_emails')
    .upsert({ email, added_by: null }, { onConflict: 'email', ignoreDuplicates: true });
  if (allowlistError) {
    warning = 'The Auth account was created, but adding the email to the allowlist failed. Add it manually.';
  }

  // Pre-create the teachers row so must_reset_password is readable immediately.
  // Deliberately does NOT set `name` — saveOnboarding()'s later upsert owns
  // name/email/onboarded and does not touch must_reset_password, so this
  // partial upsert only sets the columns relevant to this flow.
  const { error: teacherUpsertError } = await adminClient
    .from('teachers')
    .upsert(
      { id: userId, email, must_reset_password: true, onboarded: false },
      { onConflict: 'id' },
    );
  if (teacherUpsertError) {
    warning = warning
      ? `${warning} Also, pre-creating the teacher profile failed.`
      : 'The Auth account was created, but pre-creating the teacher profile failed.';
  }

  return json({ status: 'created', email, temporaryPassword, ...(warning ? { warning } : {}) });
};
