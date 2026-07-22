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
}

// Gemini model. 1.5-* retired; this key has free-tier quota on 2.5-flash
// (2.0-flash returned quota=0 for this project).
const GEMINI_MODEL = 'gemini-2.5-flash';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // Same-origin in production; permissive for local wrangler/vite testing.
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

export const onRequestOptions = (): Response => json({}, 204);

export const onRequestPost = async (context: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const { request, env } = context;

  if (!env.GEMINI_API_KEY) {
    return json({ error: 'AI is not configured on the server (missing GEMINI_API_KEY).' }, 503);
  }

  // --- Authenticate + authorize the caller (never trust a client claim) ---
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ error: 'This server is not configured for quiz generation (missing Supabase env vars).' }, 503);
  }
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

  let isTeacher = false;
  try {
    const { data, error } = await callerClient.rpc('is_teacher');
    isTeacher = !error && data === true;
  } catch {
    isTeacher = false;
  }

  if (!isTeacher) {
    return json({ error: 'Not authorized.' }, 403);
  }

  let body: Partial<GenerateQuizRequest>;
  try {
    body = (await request.json()) as Partial<GenerateQuizRequest>;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const subjectName = String(body.subjectName ?? '').trim();
  const unitName = String(body.unitName ?? '').trim();
  const topics = Array.isArray(body.topics) ? body.topics.map((t) => String(t)) : [];
  const numQuestions = clampQuestionCount(Number(body.numQuestions ?? 5));
  const difficulty = normalizeDifficulty(body.difficulty as string | undefined);

  if (unitName.length === 0 || topics.length === 0) {
    return json({ error: 'A unit with at least one topic is required to generate a quiz.' }, 400);
  }

  const prompt = buildQuizPrompt({ subjectName, unitName, topics, numQuestions, difficulty });

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent` +
    `?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  let aiResponse: Response;
  try {
    aiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
      }),
    });
  } catch {
    return json({ error: 'Could not reach the AI service. Please try again.' }, 502);
  }

  if (!aiResponse.ok) {
    const status = aiResponse.status === 429 ? 429 : 502;
    const message =
      aiResponse.status === 429
        ? 'AI rate limit reached. Please wait a moment and try again.'
        : 'The AI service returned an error. Please try again.';
    return json({ error: message }, status);
  }

  let payload: unknown;
  try {
    payload = await aiResponse.json();
  } catch {
    return json({ error: 'The AI service returned an unreadable response.' }, 502);
  }

  // Gemini shape: candidates[0].content.parts[0].text (a JSON string).
  const text =
    (payload as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    })?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  const parsedJson = extractJson(text);
  const { questions, rejected } = parseGeneratedQuestions(parsedJson);

  if (questions.length === 0) {
    return json({ error: 'The AI did not return usable questions. Please try again.' }, 502);
  }

  return json({ questions, rejected });
};
