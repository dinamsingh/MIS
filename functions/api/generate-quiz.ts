/**
 * Cloudflare Pages Function — POST /api/generate-quiz
 *
 * Server-side AI quiz generation. The Gemini API key lives ONLY here (as the
 * `GEMINI_API_KEY` environment secret) and is never exposed to the browser.
 *
 * Auth-gated (bugfix: unauthenticated-quiz-generation-api): the caller must
 * send their Supabase access token (`Authorization: Bearer <token>`) and be a
 * teacher, verified server-side via the `is_teacher()` RPC on a JWT-scoped
 * client — never trusted from a client-supplied claim. Without this, anyone
 * on the internet could call this endpoint directly and consume the Gemini
 * quota / run up cost, since the endpoint had no authorization check at all.
 *
 * Request  (JSON): { subjectName, unitName, topics: string[], numQuestions, difficulty }
 * Header:          Authorization: Bearer <caller's Supabase access token>
 * Response (JSON): { questions: [{ text, options[4], correctIndex, marks }], rejected }
 *
 * The prompt + response validation are shared with the app via the pure
 * `quizGenerationService` so there is one source of truth for the rules.
 *
 * Local dev: run `npx wrangler pages dev dist` (after `npm run build`) OR set up
 * a vite proxy; the plain `npm run dev` server does not execute Pages Functions.
 */

import { createClient } from '@supabase/supabase-js';
import {
  buildQuizPrompt,
  clampQuestionCount,
  normalizeDifficulty,
  parseGeneratedQuestions,
  extractJson,
  type GenerateQuizRequest,
} from '../../src/domain/services/quizGenerationService';

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

// Gemini model. 1.5-* retired; this key has free-tier quota on 2.5-flash
// (2.0-flash returned quota=0 for this project).
const GEMINI_MODEL = 'gemini-2.5-flash';

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
 * This endpoint remains auth-gated (Bearer token + is_teacher RPC) regardless.
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
      // Restricted to the app's own origins (see allowedOrigin above).
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

  // --- Authenticate + authorize the caller (never trust a client claim) ---
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ error: 'This server is not configured for quiz generation (missing Supabase env vars).' }, 503, origin);
  }
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

  let isTeacher = false;
  try {
    const { data, error } = await callerClient.rpc('is_teacher');
    isTeacher = !error && data === true;
  } catch {
    isTeacher = false;
  }

  if (!isTeacher) {
    return json({ error: 'Not authorized.' }, 403, origin);
  }

  let body: Partial<GenerateQuizRequest>;
  try {
    body = (await request.json()) as Partial<GenerateQuizRequest>;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, origin);
  }

  const subjectName = String(body.subjectName ?? '').trim();
  const unitName = String(body.unitName ?? '').trim();
  const topics = Array.isArray(body.topics) ? body.topics.map((t) => String(t)) : [];
  const numQuestions = clampQuestionCount(Number(body.numQuestions ?? 5));
  const difficulty = normalizeDifficulty(body.difficulty as string | undefined);

  if (unitName.length === 0 || topics.length === 0) {
    return json({ error: 'A unit with at least one topic is required to generate a quiz.' }, 400, origin);
  }

  const prompt = buildQuizPrompt({ subjectName, unitName, topics, numQuestions, difficulty });

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
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
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

  // Gemini shape: candidates[0].content.parts[0].text (a JSON string).
  const text =
    (payload as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    })?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  const parsedJson = extractJson(text);
  const { questions, rejected } = parseGeneratedQuestions(parsedJson);

  if (questions.length === 0) {
    return json({ error: 'The AI did not return usable questions. Please try again.' }, 502, origin);
  }

  return json({ questions, rejected }, 200, origin);
};
