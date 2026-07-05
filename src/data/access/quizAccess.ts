/**
 * Quiz data-access wrapper (task 16.2).
 *
 * Teacher-side quiz authoring (creating quizzes/questions, listing attempts)
 * uses parameterized writes/reads, while the correctness-critical student paths
 * delegate to the `SECURITY DEFINER` DB functions via `.rpc(...)`:
 * `request_quiz_access` gates access and `submit_attempt` grades server-side
 * and enforces exactly one attempt per student (so the answer key never reaches
 * the client and a buggy client cannot bypass grading).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import type { QuizAccess } from '../../domain/services/rosterService';
import { totalAvailableMarks } from '../../domain/services/quizService';
import { parseQuizAccess, parseSubmitOutcome, type SubmitAttemptOutcome } from './parsers';
import { unwrap, unwrapList } from './support';

export { totalAvailableMarks };

/** Fields accepted when creating a quiz. */
export interface QuizInput {
  readonly unitId: string;
  readonly title: string;
  readonly timeLimitMinutes?: number;
  readonly shareToken: string;
  /** ISO timestamp the quiz becomes available (null = immediately). */
  readonly activeFrom?: string | null;
  /** ISO timestamp the quiz closes (null = never). */
  readonly activeUntil?: string | null;
}

/** Fields accepted when adding a question to a quiz. */
export interface QuestionInput {
  readonly text: string;
  readonly options: string[];
  readonly correctIndex: number;
  readonly marks?: number;
}

/** A teacher-facing attempt summary row (Requirement 8.12). */
export interface AttemptSummary {
  readonly studentId: string;
  readonly score: number;
}

/** Supabase-backed quiz operations. */
export interface QuizAccessRepository {
  /** Create a quiz and return its id (Requirements 8.1, 8.2, 8.3). */
  createQuiz(input: QuizInput): Promise<string>;
  /** Add a question to a quiz and return its id (Requirement 8.1). */
  addQuestion(quizId: string, question: QuestionInput): Promise<string>;
  /** Resolve student quiz access server-side (Requirements 2.5, 8.5, 8.6). */
  resolveAccess(quizId: string, providedEnrollment: string | null): Promise<QuizAccess>;
  /** Submit and server-grade an attempt (Requirements 8.4, 8.8, 8.10, 8.11). */
  submitAttempt(quizId: string, answers: Record<string, number>): Promise<SubmitAttemptOutcome>;
  /** List the attempts for a quiz with their scores (Requirement 8.12). */
  listAttempts(quizId: string): Promise<AttemptSummary[]>;
}

interface InsertedId {
  readonly id: string;
}

interface QuizAttemptRow {
  readonly student_id: string;
  readonly score: number | null;
}

/** Create a {@link QuizAccessRepository} bound to the given Supabase client. */
export function createQuizAccess(
  client: SupabaseClient = defaultClient,
): QuizAccessRepository {
  return {
    async createQuiz(input: QuizInput): Promise<string> {
      const row = {
        unit_id: input.unitId,
        title: input.title,
        ...(input.timeLimitMinutes !== undefined
          ? { time_limit_minutes: input.timeLimitMinutes }
          : {}),
        share_token: input.shareToken,
        ...(input.activeFrom !== undefined ? { active_from: input.activeFrom } : {}),
        ...(input.activeUntil !== undefined ? { active_until: input.activeUntil } : {}),
      };
      const inserted = unwrap(
        await client.from('quizzes').insert(row).select('id').single(),
      ) as InsertedId | null;
      return inserted?.id ?? '';
    },

    async addQuestion(quizId: string, question: QuestionInput): Promise<string> {
      const row = {
        quiz_id: quizId,
        text: question.text,
        options: question.options,
        correct_index: question.correctIndex,
        ...(question.marks !== undefined ? { marks: question.marks } : {}),
      };
      const inserted = unwrap(
        await client.from('questions').insert(row).select('id').single(),
      ) as InsertedId | null;
      return inserted?.id ?? '';
    },

    async resolveAccess(
      quizId: string,
      providedEnrollment: string | null,
    ): Promise<QuizAccess> {
      const payload = unwrap(
        await client.rpc('request_quiz_access', {
          p_quiz_id: quizId,
          p_provided_enrollment: providedEnrollment,
        }),
      );
      return parseQuizAccess(payload);
    },

    async submitAttempt(
      quizId: string,
      answers: Record<string, number>,
    ): Promise<SubmitAttemptOutcome> {
      const payload = unwrap(
        await client.rpc('submit_attempt', {
          p_quiz_id: quizId,
          p_answers: answers,
        }),
      );
      return parseSubmitOutcome(payload);
    },

    async listAttempts(quizId: string): Promise<AttemptSummary[]> {
      const rows = unwrapList(
        await client
          .from('quiz_attempts')
          .select('student_id, score')
          .eq('quiz_id', quizId),
      ) as QuizAttemptRow[];
      return rows.map((row) => ({ studentId: row.student_id, score: row.score ?? 0 }));
    },
  };
}
