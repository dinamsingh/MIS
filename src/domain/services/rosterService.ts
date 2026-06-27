/**
 * Student Roster & Access (`rosterService`).
 *
 * This module owns the student roster. Enrollment-number validation is a pure,
 * synchronous function (`isValidEnrollmentNumber`) and roster maintenance is a
 * thin upsert (`upsertEntry`) that validates before storing.
 *
 * Quiz-access resolution (`resolveQuizAccess`) decides whether a Google-signed
 * student may attempt a quiz, gating access on the authoritative roster and the
 * student's enrollment number, and surfacing the already-attempted path.
 *
 * Requirements:
 * - 2.1  Maintain a roster where each entry stores an enrollment number + email.
 * - 2.2  Validate the enrollment number on add/edit; reject non-conforming
 *        values with an English validation message.
 * - 2.5  Grant quiz access only when the student email matches a roster entry
 *        and the provided enrollment number matches that entry.
 * - 2.6  Deny access with a not-registered message when the email is not on the
 *        roster (also Req 8.6).
 * - 2.7  On first sign-in, the enrollment number is prompted once and stored.
 * - 2.8  A returning student whose enrollment is already stored skips the prompt.
 * - 8.5  Quiz module grants access under the same roster + enrollment rule.
 * - 8.6  Quiz module denies a non-rostered email with a not-registered message.
 * - 21.3 Seed roster entries use the same pattern (reuses this validator).
 */
import { type Result, ok, err } from '../shared/result';
import { messages } from '../shared/messages';
import type { ValidationError } from '../shared/types';
import type { AttemptResult } from './quizService';

/**
 * Enrollment-number pattern: exactly four digits, two uppercase letters, then
 * six digits (for example, `0131CS241000`). Anchored so the entire string must
 * match — no leading/trailing characters are permitted.
 */
const ENROLLMENT_NUMBER_PATTERN = /^[0-9]{4}[A-Z]{2}[0-9]{6}$/;

/**
 * Returns true if and only if `value` matches the enrollment-number pattern of
 * four digits, two uppercase letters, then six digits.
 *
 * Pure and synchronous so it can be reused anywhere a pattern check is needed
 * (UI inline validation, seed-data generation, access resolution).
 */
export function isValidEnrollmentNumber(value: string): boolean {
  return ENROLLMENT_NUMBER_PATTERN.test(value);
}

/** A single roster entry: an enrollment number, an email, and an optional name. */
export interface RosterEntry {
  enrollmentNumber: string;
  email: string;
  name?: string;
}

/** The validation error code surfaced when an enrollment number is malformed. */
export const ENROLLMENT_NUMBER_INVALID_CODE = 'enrollment_number_invalid';

/**
 * Validates and upserts a roster entry into the provided in-memory store.
 *
 * Upsert semantics are keyed by email (case-insensitive): re-submitting an
 * entry for the same email replaces the existing one rather than duplicating
 * it. A non-conforming enrollment number is rejected with an English
 * `ValidationError` and the store is left unchanged.
 *
 * This is the pure core of `RosterService.upsertEntry`; the data-access layer
 * binds it to Supabase in a later task.
 */
export function upsertEntry(
  store: Map<string, RosterEntry>,
  entry: RosterEntry,
): Result<RosterEntry, ValidationError> {
  if (!isValidEnrollmentNumber(entry.enrollmentNumber)) {
    return err<ValidationError>({
      code: ENROLLMENT_NUMBER_INVALID_CODE,
      message: messages.validation.enrollmentNumberInvalid,
      field: 'enrollmentNumber',
    });
  }

  const stored: RosterEntry = {
    enrollmentNumber: entry.enrollmentNumber,
    email: entry.email,
    ...(entry.name !== undefined ? { name: entry.name } : {}),
  };
  store.set(entry.email.toLowerCase(), stored);
  return ok(stored);
}

/**
 * A roster service backed by an in-memory store. Mirrors the
 * `RosterService.upsertEntry` shape from the design (async Result) so the UI
 * and data-access layers can depend on a stable interface; the Supabase-backed
 * implementation is wired in a later task.
 */
export interface RosterService {
  upsertEntry(entry: RosterEntry): Promise<Result<RosterEntry, ValidationError>>;
}

/** Create a roster service over a fresh in-memory store. */
export function createRosterService(): RosterService {
  const store = new Map<string, RosterEntry>();
  return {
    upsertEntry(entry: RosterEntry) {
      return Promise.resolve(upsertEntry(store, entry));
    },
  };
}

/**
 * The quiz payload handed to a student once access is granted. It intentionally
 * carries no correct-answer data — grading happens server-side so the answer
 * key never reaches the client (see `quizService` / the `submit_attempt` DB
 * function). This is the minimal shape the access decision needs to return; the
 * data-access layer populates it from the stored quiz.
 */
export interface QuizPayloadNoAnswers {
  readonly id: string;
  readonly unitId: string;
  readonly timeLimitMinutes: number;
  readonly shareToken: string;
  readonly questions: ReadonlyArray<{
    readonly id: string;
    readonly text: string;
    readonly options: ReadonlyArray<string>;
  }>;
}

/**
 * The outcome of resolving a student's request to attempt a quiz.
 *
 *  - `granted`: the email is on the roster, the enrollment number matches, and
 *    no prior attempt exists — the answer-free quiz payload is returned
 *    (Requirements 2.5, 8.5).
 *  - `enrollment-required`: the email is on the roster but no enrollment number
 *    is yet known for this student (first sign-in) — the UI must prompt for it
 *    once and resubmit (Requirement 2.7). A returning student whose enrollment
 *    is already stored never reaches this state (Requirement 2.8).
 *  - `denied` (`not-registered`): the email is not on the roster, or the
 *    enrollment number does not match the roster entry (Requirements 2.6, 8.6).
 *  - `already-attempted`: a prior attempt exists for this student and quiz; the
 *    existing result is returned instead of a new attempt (Requirement 8.10).
 */
export type QuizAccess =
  | { status: 'granted'; quiz: QuizPayloadNoAnswers }
  | { status: 'enrollment-required' }
  | { status: 'denied'; reason: 'not-registered' }
  | { status: 'already-attempted'; result: AttemptResult };

/**
 * Everything the pure access decision needs. All values are supplied by the
 * caller (the data-access layer reads them from Supabase); the decision itself
 * performs no I/O so it can be exhaustively tested in isolation.
 */
export interface QuizAccessContext {
  /** The authoritative roster, keyed by lower-cased email (as `upsertEntry` stores it). */
  readonly roster: ReadonlyMap<string, RosterEntry>;
  /** The Google-captured email of the signed-in student. */
  readonly email: string;
  /**
   * The enrollment number entered at the first-sign-in prompt this session, or
   * `null` when nothing was entered.
   */
  readonly providedEnrollment: string | null;
  /**
   * The enrollment number already persisted on the student record from a prior
   * sign-in, or `null` for a first-time student. When present it is used
   * directly and the prompt is skipped (Requirement 2.8).
   */
  readonly storedEnrollment: string | null;
  /** The student's existing attempt for this quiz, or `null` when none exists. */
  readonly existingAttempt: AttemptResult | null;
  /** The answer-free payload returned when access is granted. */
  readonly quiz: QuizPayloadNoAnswers;
}

/** Look up a roster entry by email using the same case-insensitive key as `upsertEntry`. */
function findRosterEntry(
  roster: ReadonlyMap<string, RosterEntry>,
  email: string,
): RosterEntry | undefined {
  return roster.get(email.toLowerCase());
}

/**
 * Resolve whether a signed-in student may attempt a quiz (Requirements 2.5,
 * 2.6, 2.7, 2.8, 8.5, 8.6, 8.10).
 *
 * The decision proceeds in a fixed order:
 *
 *  1. If the email is not on the roster, deny with `not-registered`
 *     (Requirements 2.6, 8.6).
 *  2. Otherwise determine the effective enrollment number: a returning
 *     student's stored enrollment takes precedence (Requirement 2.8), falling
 *     back to the value entered at the first-sign-in prompt (Requirement 2.7).
 *  3. If no enrollment number is known yet, return `enrollment-required` so the
 *     UI prompts for it once (Requirement 2.7).
 *  4. If the effective enrollment number does not equal the roster entry's
 *     enrollment number, deny with `not-registered` (Requirements 2.5, 8.5).
 *  5. If a prior attempt exists, return it as `already-attempted`
 *     (Requirement 8.10).
 *  6. Otherwise grant access and return the answer-free quiz payload
 *     (Requirements 2.5, 8.5).
 *
 * Pure and deterministic: access is `granted` if and only if the email matches
 * a roster entry and the effective enrollment equals that entry's stored
 * enrollment (and no prior attempt exists); every other input resolves to a
 * single, well-defined non-granted outcome.
 */
export function resolveQuizAccess(context: QuizAccessContext): QuizAccess {
  const entry = findRosterEntry(context.roster, context.email);
  if (entry === undefined) {
    return { status: 'denied', reason: 'not-registered' };
  }

  const effectiveEnrollment = context.storedEnrollment ?? context.providedEnrollment;
  if (effectiveEnrollment === null) {
    return { status: 'enrollment-required' };
  }

  if (effectiveEnrollment !== entry.enrollmentNumber) {
    return { status: 'denied', reason: 'not-registered' };
  }

  if (context.existingAttempt !== null) {
    return { status: 'already-attempted', result: context.existingAttempt };
  }

  return { status: 'granted', quiz: context.quiz };
}
