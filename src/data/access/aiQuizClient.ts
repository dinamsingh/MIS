/**
 * Client for the server-side AI quiz generator (Cloudflare Pages Function at
 * POST /api/generate-quiz). The AI key lives on the server; this client only
 * sends the unit context and receives validated questions back.
 *
 * Sends the caller's Supabase access token as a bearer header (bugfix:
 * unauthenticated-quiz-generation-api) — the server verifies it and checks
 * `is_teacher()` before doing any AI work.
 */

import { supabase } from '../supabase';
import type {
  GenerateQuizRequest,
  GeneratedQuestion,
} from '../../domain/services/quizGenerationService';

export interface GenerateQuizResult {
  readonly questions: GeneratedQuestion[];
  readonly rejected: number;
}

/**
 * Ask the server to generate quiz questions for a unit. Throws an Error with a
 * user-friendly message on failure (server not configured, rate limited, etc.).
 */
export async function generateQuizQuestions(
  req: GenerateQuizRequest,
): Promise<GenerateQuizResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('You must be signed in to generate a quiz.');
  }

  let response: Response;
  try {
    response = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(req),
    });
  } catch {
    throw new Error('Could not reach the quiz generator. Check your connection and try again.');
  }

  let body: { questions?: GeneratedQuestion[]; rejected?: number; error?: string } = {};
  try {
    body = await response.json();
  } catch {
    // fall through to status-based error below
  }

  if (!response.ok) {
    throw new Error(body.error ?? 'The quiz generator failed. Please try again.');
  }

  return { questions: body.questions ?? [], rejected: body.rejected ?? 0 };
}
