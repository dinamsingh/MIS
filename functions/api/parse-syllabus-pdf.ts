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
}

const GEMINI_MODEL = 'gemini-2.5-flash';

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

  if (!env.GEMINI_API_KEY) {
    return json({ error: 'AI is not configured on the server (missing GEMINI_API_KEY).' }, 503);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ error: 'This server is not configured for syllabus extraction (missing Supabase env vars).' }, 503);
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

  let body: { semester?: unknown; pdfText?: unknown };
  try {
    body = (await request.json()) as { semester?: unknown; pdfText?: unknown };
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const semester = Number(body.semester);
  const pdfText = typeof body.pdfText === 'string' ? body.pdfText : '';

  if (!Number.isInteger(semester) || semester < 1 || semester > 8) {
    return json({ error: 'A valid semester number (1-8) is required.' }, 400);
  }
  if (pdfText.trim().length === 0) {
    return json({ error: 'No syllabus text was extracted from the PDF.' }, 400);
  }

  const prompt = buildSyllabusExtractionPrompt(semester, pdfText);

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
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
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

  const text =
    (payload as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    })?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  const parsedJson = extractJson(text);
  const { subjects, rejected } = parseExtractedSyllabus(parsedJson);

  if (subjects.length === 0) {
    return json({ error: 'The AI could not identify any subjects in this document. Try a clearer PDF or check the semester number.' }, 502);
  }

  return json({ subjects, rejected });
};
