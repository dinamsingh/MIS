/**
 * Quiz grading domain service (`quizService`).
 *
 * Holds the testable, correctness-critical logic for the Quiz_Module:
 *
 *  - `gradeAttempt` auto-grades a submitted attempt against the stored correct
 *    options, summing the marks of correctly-answered questions with no
 *    negative marking (Requirements 8.4, 8.8). The same pure function is reused
 *    by the server-side `submit_attempt` database function so the client and
 *    the database grade identically.
 *  - `submitAttempt` / `createInMemoryQuizAttemptStore` enforce exactly one
 *    stored attempt per student per quiz, preserving the first submitted result
 *    and rejecting later submissions as already-attempted (Requirements 8.10,
 *    8.11).
 *
 * These functions hold no I/O. The in-memory attempt store models the
 * persistence contract (a UNIQUE `(quiz_id, student_id)` constraint plus an
 * upsert) that the Supabase-backed data-access wrapper and DB function must
 * honour, and lets the single-attempt and grading correctness properties be
 * verified in isolation.
 *
 * _Requirements: 8.4, 8.8, 8.10, 8.11_
 */

/**
 * A single multiple-choice question. `correctIndex` points at the correct
 * entry in `options`; `marks` is the value awarded for a correct answer
 * (defaulting to 1 at creation time, handled by the creation flow).
 */
export interface Question {
  readonly id: string;
  readonly text: string;
  readonly options: string[];
  readonly correctIndex: number;
  readonly marks: number;
}

/**
 * A quiz linked to a syllabus unit, with its questions, configurable time
 * limit (default 15 minutes, handled at creation), and unique share token.
 */
export interface Quiz {
  readonly id: string;
  readonly unitId: string;
  readonly timeLimitMinutes: number;
  readonly questions: Question[];
  readonly shareToken: string;
}

/**
 * The graded outcome of an attempt: the score awarded and the total marks that
 * were available. `totalMarks` lets the UI present the score as `score / total`
 * and lets callers verify the score never exceeds what was available.
 */
export interface AttemptResult {
  readonly score: number;
  readonly totalMarks: number;
  readonly canReview?: boolean;
}

/**
 * Normalize a question's marks to a non-negative, finite value. A question
 * configured with a non-finite or negative marks value contributes nothing,
 * which keeps both the score and the total well-defined and non-negative.
 */
function safeMarks(marks: number): number {
  return Number.isFinite(marks) && marks > 0 ? marks : 0;
}

/**
 * The total marks available across a quiz's questions — the sum of each
 * question's (normalized) marks. This is the upper bound a graded score can
 * reach.
 */
export function totalAvailableMarks(questions: Question[]): number {
  let total = 0;
  for (const question of questions) {
    total += safeMarks(question.marks);
  }
  return total;
}

/**
 * Auto-grade a submitted attempt (Requirements 8.4, 8.8).
 *
 * `answers` maps a question id to the index of the option the student selected.
 * The score is the sum of the marks of the questions whose submitted answer
 * equals the stored `correctIndex`. There is no negative marking: a wrong,
 * missing, or out-of-range answer simply contributes zero rather than deducting
 * marks. Consequently the returned score is always within
 * `[0, totalAvailableMarks(questions)]`.
 *
 * Pure and deterministic, so the server-side grading function and tests share
 * one implementation.
 */
export function gradeAttempt(
  questions: Question[],
  answers: Record<string, number>,
): number {
  let score = 0;
  for (const question of questions) {
    const submitted = answers[question.id];
    if (submitted === question.correctIndex) {
      score += safeMarks(question.marks);
    }
  }
  return score;
}

/**
 * Grade an attempt and package it as an `AttemptResult` carrying both the score
 * and the total marks that were available.
 */
export function gradeAttemptResult(
  questions: Question[],
  answers: Record<string, number>,
): AttemptResult {
  return {
    score: gradeAttempt(questions, answers),
    totalMarks: totalAvailableMarks(questions),
  };
}

/**
 * The outcome of submitting an attempt to the single-attempt store.
 *
 *  - `recorded`: this submission was the first for the `(quiz, student)` pair
 *    and is now the stored result.
 *  - `already-attempted`: a prior attempt already exists; the submission is
 *    rejected and the preserved first result is returned (Requirements 8.10,
 *    8.11).
 */
export type SubmitOutcome =
  | { readonly status: 'recorded'; readonly result: AttemptResult }
  | { readonly status: 'already-attempted'; readonly result: AttemptResult };

/**
 * Build the composite store key for a `(quiz, student)` pair. Components are
 * length-prefixed so no combination of ids can collide.
 */
function attemptKey(quizId: string, studentId: string): string {
  return `${quizId.length}:${quizId}|${studentId}`;
}

/**
 * Submit an attempt into the provided store, enforcing exactly one stored
 * attempt per student per quiz (Requirement 8.11) and preserving the first
 * submitted result (Requirement 8.10).
 *
 * If no attempt exists for the pair, `result` is stored and returned as
 * `recorded`. If an attempt already exists, the store is left unchanged and the
 * existing (first) result is returned as `already-attempted`.
 *
 * This is the pure core of the single-attempt upsert; the database mirrors it
 * with a UNIQUE `(quiz_id, student_id)` constraint and an insert-if-absent.
 */
export function submitAttempt(
  store: Map<string, AttemptResult>,
  quizId: string,
  studentId: string,
  result: AttemptResult,
): SubmitOutcome {
  const key = attemptKey(quizId, studentId);
  const existing = store.get(key);
  if (existing !== undefined) {
    return { status: 'already-attempted', result: existing };
  }
  store.set(key, result);
  return { status: 'recorded', result };
}

/**
 * The single-attempt persistence contract. `submitAttempt` records the first
 * attempt and rejects later ones; `getAttempt` returns the stored result for a
 * pair, or `null` when none exists.
 */
export interface QuizAttemptStore {
  submitAttempt(
    quizId: string,
    studentId: string,
    result: AttemptResult,
  ): Promise<SubmitOutcome>;
  getAttempt(quizId: string, studentId: string): Promise<AttemptResult | null>;
}

/**
 * Create an in-memory `QuizAttemptStore`.
 *
 * Attempts are keyed by `(quiz, student)`; the first submission for a pair is
 * stored and every subsequent submission is rejected as `already-attempted`
 * while the first result is preserved unchanged (Requirements 8.10, 8.11).
 */
export function createInMemoryQuizAttemptStore(): QuizAttemptStore {
  const store = new Map<string, AttemptResult>();

  return {
    async submitAttempt(
      quizId: string,
      studentId: string,
      result: AttemptResult,
    ): Promise<SubmitOutcome> {
      return submitAttempt(store, quizId, studentId, result);
    },

    async getAttempt(
      quizId: string,
      studentId: string,
    ): Promise<AttemptResult | null> {
      return store.get(attemptKey(quizId, studentId)) ?? null;
    },
  };
}
