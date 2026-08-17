/**
 * Cloudflare Pages Function — POST /api/parse-syllabus-pdf
 *
 * Server-side AI syllabus extraction. The Gemini API key lives ONLY here (as
 * the `GEMINI_API_KEY` environment secret) and is never exposed to the
 * browser.
 *
 * Auth-gated: the caller must send their Supabase access token
 * (`Authorization: Bearer <token>`) and be an admin, verified server-side via
 * the `is_admin()` RPC on a JWT-scoped client — never trusted from a
 * client-supplied claim (same pattern as `admin-create-teacher.ts` and the
 * auth gate added to `generate-quiz.ts`).
 *
 * The PDF itself is parsed to plain text IN THE BROWSER (pdfjs-dist) before
 * this endpoint is called — this Function only receives already-extracted
 * text, never a binary upload, keeping it small and dependency-free.
 *
 * Request  (JSON): { semester: number, pdfText: string }
 * Header:          Authorization: Bearer <caller's Supabase access token>
 * Response (JSON): { subjects: ExtractedSubject[], rejected: number }
 */

import { createClient } from '@supabase/supabase-js';
import {
  buildSyllabusExtractionPrompt,
  parseExtractedSyllabus,
  extractJson,
} from '../../src/domain/services/syllabusParsingService';

interface Env {
  GEMINI_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  /**
   * Optional comma-separated extra origins allowed for CORS (e.g. a custom
   * domain once the production domain is finalised). Set it in the
   * Cloudflare Pages dashboard → Settings → Environment variables.
   */
  ALLOWED_ORIGINS?: string;
}

const GEMINI_MODEL = 'gemini-2.5-flash';

/** Hard cap on extracted PDF text to stop resource-exhaustion abuse. */
const MAX_PDF_TEXT_CHARS = 500_000; // ~100 pages of text

/**
 * Resolve the CORS allow-origin for a request. Security fix (audit finding:
 * CORS wildcard): the previous `*` let ANY website call this endpoint from a
 * victim's browser. Now only trusted origins are allowed; everything else
 * gets no CORS header, so the browser blocks it.
 *
 * Trusted origins:
 *  - local dev servers (localhost / 127.0.0.1)
 *  - any https://*.pages.dev host — the production/custom domain is not
 *    finalised yet, so all Cloudflare Pages deployments (incl. preview
 *    subdomains) are allowed for now. NOTE: tighten this to the final
 *    domain once decided (via the ALLOWED_ORIGINS env var below).
 *  - anything listed in ALLOWED_ORIGINS (comma-separated) — add the final
 *    custom domain there in the Cloudflare Pages dashboard, no code change.
 * This endpoint remains auth-gated (Bearer token + is_admin RPC) regardless.
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

  if (!env.GEMINI_API_KEY) {
    return json({ error: 'AI is not configured on the server (missing GEMINI_API_KEY).' }, 503, origin);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ error: 'This server is not configured for syllabus extraction (missing Supabase env vars).' }, 503, origin);
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

  let body: { semester?: unknown; pdfText?: unknown };
  try {
    body = (await request.json()) as { semester?: unknown; pdfText?: unknown };
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, origin);
  }

  const semester = Number(body.semester);
  const pdfText = typeof body.pdfText === 'string' ? body.pdfText : '';

  if (!Number.isInteger(semester) || semester < 1 || semester > 8) {
    return json({ error: 'A valid semester number (1-8) is required.' }, 400, origin);
  }
  if (pdfText.trim().length === 0) {
    return json({ error: 'No syllabus text was extracted from the PDF.' }, 400, origin);
  }
  // Security fix (audit finding): cap input size so a huge payload cannot
  // exhaust the Function's CPU/memory or run up Gemini cost.
  if (pdfText.length > MAX_PDF_TEXT_CHARS) {
    return json({ error: 'The PDF is too large to process. Please use a smaller document.' }, 413, origin);
  }

  const prompt = buildSyllabusExtractionPrompt(semester, pdfText);

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  let aiResponse: Response;
  try {
    aiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Security fix (audit finding): send the API key as a header instead
        // of a URL query param, so it never lands in request/access logs.
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
      }),
    });
  } catch {
    return json({ error: 'Could not reach the AI service. Please try again.' }, 502, origin);
  }

  if (!aiResponse.ok) {
    const status = aiResponse.status === 429 ? 429 : 502;
    const message =
      aiResponse.status === 429
        ? 'AI rate limit reached. Please wait a moment and try again.'
        : 'The AI service returned an error. Please try again.';
    return json({ error: message }, status, origin);
  }

  let payload: unknown;
  try {
    payload = await aiResponse.json();
  } catch {
    return json({ error: 'The AI service returned an unreadable response.' }, 502, origin);
  }

  const text =
    (payload as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    })?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  const parsedJson = extractJson(text);
  const { subjects, rejected } = parseExtractedSyllabus(parsedJson);

  if (subjects.length === 0) {
    return json({ error: 'The AI could not identify any subjects in this document. Try a clearer PDF or check the semester number.' }, 502, origin);
  }

  return json({ subjects, rejected }, 200, origin);
};
