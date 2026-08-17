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
  /**
   * Optional comma-separated extra origins allowed for CORS (e.g. a custom
   * domain once the production domain is finalised). Set it in the
   * Cloudflare Pages dashboard → Settings → Environment variables.
   */
  ALLOWED_ORIGINS?: string;
}

/**
 * Resolve the CORS allow-origin for a request. Security fix (audit finding:
 * CORS wildcard): the previous `*` let ANY website call this endpoint with a
 * victim's browser-attached credentials. Now only trusted origins are
 * allowed; everything else gets no CORS header, so the browser blocks it.
 *
 * Trusted origins:
 *  - local dev servers (localhost / 127.0.0.1)
 *  - any https://*.pages.dev host — the production/custom domain is not
 *    finalised yet, so all Cloudflare Pages deployments (incl. preview
 *    subdomains) are allowed for now. NOTE: tighten this to the final
 *    domain once decided (via the ALLOWED_ORIGINS env var below).
 *  - anything listed in ALLOWED_ORIGINS (comma-separated) — add the final
 *    custom domain there in the Cloudflare Pages dashboard, no code change.
 * All endpoints remain auth-gated (Bearer token + is_admin RPC) regardless.
 */
function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('origin');
  if (!origin) {
    return null; // Non-browser / same-origin request — no CORS header needed.
  }
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
    return origin; // Local development.
  }
  const extras = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (extras.includes(origin)) {
    return origin; // Final custom domain (once configured).
  }
  try {
    const url = new URL(origin);
    if (
      url.protocol === 'https:' &&
      (url.hostname === 'pages.dev' || url.hostname.endsWith('.pages.dev'))
    ) {
      return origin; // Any Cloudflare Pages deployment (TODO: tighten once domain finalised).
    }
  } catch {
    // Malformed origin — fall through to deny.
  }
  return null;
}

function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(origin !== null ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
    },
  });
}

export const onRequestOptions = (context: { request: Request; env: Env }): Response => {
  const origin = allowedOrigin(context.request, context.env);
  if (origin === null) {
    return json({}, 204); // No CORS headers → browser blocks the cross-origin call.
  }
  return json({}, 204, origin);
};

export const onRequestPost = async (context: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const { request, env } = context;
  const origin = allowedOrigin(request, env);

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_ANON_KEY) {
    return json(
      { error: 'This server is not configured for admin account creation (missing Supabase env vars).' },
      503,
      origin,
    );
  }

  // --- Authenticate + authorize the caller (never trust a client claim) ---
  const authHeader = request.headers.get('authorization') ?? request.headers.get('Authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const accessToken = bearerMatch?.[1]?.trim();
  if (!accessToken) {
    return json({ error: 'Not authorized.' }, 403, origin);
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
    return json({ error: 'Not authorized.' }, 403, origin);
  }

  // --- Parse + validate the request body ---
  let body: { email?: unknown };
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, origin);
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    return json({ error: 'Enter a valid email address.' }, 400, origin);
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
      return json({ error: 'A user with this email already exists.' }, 409, origin);
    }
    return json({ error: 'Could not create the teacher account. Please try again.' }, 502, origin);
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

  return json({ status: 'created', email, temporaryPassword, ...(warning ? { warning } : {}) }, 200, origin);
};
