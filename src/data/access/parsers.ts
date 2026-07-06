/**
 * Pure parsers for the JSON tagged unions returned by the `SECURITY DEFINER`
 * quiz functions (task 16.2).
 *
 * `request_quiz_access` and `submit_attempt` return `jsonb` payloads shaped to
 * mirror the domain `QuizAccess` / submit-outcome unions (see
 * `0003_quiz_functions.sql`). These parsers validate the untrusted RPC payload
 * and narrow it to a typed value, so a malformed or unexpected response becomes
 * a defined outcome rather than an `undefined` field access at the call site.
 * They are pure, so the parsing logic is unit-tested without a live database.
 */

import type { QuizAccess, QuizPayloadNoAnswers } from '../../domain/services/rosterService';
import type { AttemptResult } from '../../domain/services/quizService';

/** Narrow an unknown value to a plain object record. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** Parse an `AttemptResult` (`{ score, totalMarks }`) from an RPC `result` field. */
function parseAttemptResult(value: unknown): AttemptResult {
  const record = asRecord(value);
  const score = record && typeof record.score === 'number' ? record.score : 0;
  const totalMarks = record && typeof record.totalMarks === 'number' ? record.totalMarks : 0;
  return { score, totalMarks };
}

/** Parse the answer-free quiz payload returned on a granted access decision. */
function parseQuizPayload(value: unknown): QuizPayloadNoAnswers {
  const record = asRecord(value) ?? {};
  const rawQuestions = Array.isArray(record.questions) ? record.questions : [];
  const questions = rawQuestions.map((q) => {
    const qr = asRecord(q) ?? {};
    return {
      id: String(qr.id ?? ''),
      text: String(qr.text ?? ''),
      options: Array.isArray(qr.options) ? qr.options.map((o) => String(o)) : [],
    };
  });
  return {
    id: String(record.id ?? ''),
    unitId: String(record.unitId ?? ''),
    timeLimitMinutes:
      typeof record.timeLimitMinutes === 'number' ? record.timeLimitMinutes : 0,
    shareToken: String(record.shareToken ?? ''),
    questions,
  };
}

/**
 * Parse the `request_quiz_access` payload into the domain {@link QuizAccess}
 * union. Any unrecognized shape is treated as a `denied: not-registered`
 * decision, the safe default (never accidentally grant access).
 */
export function parseQuizAccess(value: unknown): QuizAccess {
  const record = asRecord(value);
  const status = record?.status;

  switch (status) {
    case 'granted':
      return {
        status: 'granted',
        quiz: parseQuizPayload(record?.quiz),
        // Only include `preview` when the server explicitly set it, so a normal
        // student grant still deep-equals `{ status, quiz }` (parser tests).
        ...(record?.preview === true ? { preview: true } : {}),
      };
    case 'enrollment-required':
      return { status: 'enrollment-required' };
    case 'already-attempted':
      return { status: 'already-attempted', result: parseAttemptResult(record?.result) };
    case 'denied':
      return {
        status: 'denied',
        reason: record?.reason === 'not-active' ? 'not-active' : 'not-registered',
      };
    default:
      return { status: 'denied', reason: 'not-registered' };
  }
}

/**
 * The outcome of a server-side quiz submission via `submit_attempt`. Mirrors
 * the domain submit-outcome plus the `denied` branch the DB function can return
 * when the roster/enrollment gate fails at submission time.
 */
export type SubmitAttemptOutcome =
  | { readonly status: 'recorded'; readonly result: AttemptResult }
  | { readonly status: 'already-attempted'; readonly result: AttemptResult }
  | { readonly status: 'denied'; readonly reason: 'not-registered' };

/**
 * Parse the `submit_attempt` payload into a {@link SubmitAttemptOutcome}. An
 * unrecognized shape is treated as `denied`, so a malformed response never
 * presents a fabricated score.
 */
export function parseSubmitOutcome(value: unknown): SubmitAttemptOutcome {
  const record = asRecord(value);
  const status = record?.status;

  switch (status) {
    case 'recorded':
      return { status: 'recorded', result: parseAttemptResult(record?.result) };
    case 'already-attempted':
      return { status: 'already-attempted', result: parseAttemptResult(record?.result) };
    case 'denied':
    default:
      return { status: 'denied', reason: 'not-registered' };
  }
}
