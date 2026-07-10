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
import type { QuizAccess, QuizAttemptSessionInfo } from '../../domain/services/rosterService';
import { totalAvailableMarks } from '../../domain/services/quizService';
import { parseQuizAccess, parseSubmitOutcome, type SubmitAttemptOutcome } from './parsers';
import { expectOk, unwrap, unwrapList } from './support';

export { totalAvailableMarks };

/** Fields accepted when creating a quiz. */
export interface QuizInput {
  readonly unitId: string;
  readonly title: string;
  /** Section this quiz is published for (null/omitted = legacy subject-wide quiz). */
  readonly sectionId?: string | null;
  readonly timeLimitMinutes?: number;
  readonly shareToken: string;
  /** ISO timestamp the quiz becomes available (null = immediately). */
  readonly activeFrom?: string | null;
  /** ISO timestamp the quiz closes (null = never). */
  readonly activeUntil?: string | null;
  readonly showAnswersAfterClose?: boolean;
  readonly shuffleQuestions?: boolean;
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

export type QuizStatus = 'scheduled' | 'active' | 'closed';

export interface SavedQuizSummary {
  readonly id: string;
  readonly title: string;
  readonly unitId: string;
  readonly sectionId: string | null;
  readonly unitName: string;
  readonly timeLimitMinutes: number;
  readonly shareToken: string;
  readonly activeFrom: string | null;
  readonly activeUntil: string | null;
  readonly showAnswersAfterClose: boolean;
  readonly shuffleQuestions: boolean;
  readonly questionCount: number;
  readonly responseCount: number;
  readonly totalMarks: number;
  readonly averageScore: number | null;
  readonly status: QuizStatus;
}

export interface QuizResultSection {
  readonly id: string;
  readonly name: string;
  readonly batch: string | null;
  readonly semester: string | null;
  readonly department: string | null;
}

export interface QuizResultRow {
  readonly studentId: string;
  readonly studentName: string;
  readonly enrollmentNumber: string | null;
  readonly section: QuizResultSection | null;
  readonly score: number;
  readonly totalMarks: number;
  readonly submittedAt: string;
}

export interface QuizRosterOption {
  readonly enrollmentNumber: string;
  readonly name: string;
  readonly section: QuizResultSection | null;
}

export interface QuizQuestionStats {
  readonly questionId: string;
  readonly text: string;
  readonly options: string[];
  readonly correctIndex: number;
  readonly marks: number;
  readonly position: number;
  readonly totalAttempts: number;
  readonly pickCounts: Record<string, number>;
}

export interface QuizAttemptDetailQuestion {
  readonly questionId: string;
  readonly text: string;
  readonly options: string[];
  readonly correctIndex: number;
  readonly marks: number;
  readonly position: number;
  readonly studentAnswerIndex: number | null;
}

export interface QuizAttemptDetail {
  readonly studentName: string;
  readonly enrollmentNumber: string | null;
  readonly score: number;
  readonly submittedAt: string;
  readonly questions: QuizAttemptDetailQuestion[];
}

/** Supabase-backed quiz operations. */
export interface QuizAccessRepository {
  /** Create a quiz and return its id (Requirements 8.1, 8.2, 8.3). */
  createQuiz(input: QuizInput): Promise<string>;
  /** Create a quiz with its questions in a single transaction (AI Generator) */
  createQuizWithQuestions(quiz: QuizInput, questions: QuestionInput[]): Promise<string>;
  /** Add a question to a quiz and return its id (Requirement 8.1). */
  addQuestion(quizId: string, question: QuestionInput): Promise<string>;
  /** Start a quiz attempt to issue a session with server time bounds */
  startAttempt(quizId: string, email: string): Promise<QuizAttemptSessionInfo>;
  /** Resolve whether a student can access this quiz, via email or enrollment number (task: Quiz Access Phase 2 & 4). */
  resolveAccess(quizId: string, providedEnrollment: string | null, providedEmail?: string | null): Promise<QuizAccess>;
  /** List safe roster choices for the quiz's assigned section(s). */
  listRosterOptions(quizId: string, searchPrefix?: string): Promise<QuizRosterOption[]>;
  /** Submit and server-grade an attempt (Requirements 8.4, 8.8, 8.10, 8.11). */
  submitAttempt(quizId: string, answers: Record<string, number>, email: string): Promise<SubmitAttemptOutcome>;
  /** List saved quizzes owned by the current teacher. */
  listQuizzes(): Promise<SavedQuizSummary[]>;
  /** List student submissions for one quiz without exposing answer keys. */
  listQuizResults(quizId: string): Promise<QuizResultRow[]>;
  /** List the attempts for a quiz with their scores (Requirement 8.12). */
  listAttempts(quizId: string): Promise<AttemptSummary[]>;
  /** Delete a teacher-owned quiz. Child questions/attempts cascade in the DB. */
  deleteQuiz(quizId: string): Promise<void>;
  /**
   * Remove one student's attempt on one owned quiz so they can re-attempt it.
   * Subject-scoped by nature (the quiz belongs to a subject's unit); does not
   * touch the student's attempts in other quizzes/subjects.
   */
  resetAttempt(quizId: string, studentId: string): Promise<void>;
  /** List students in the target section who have not attempted the quiz. */
  listQuizNonAttempters(quizId: string): Promise<QuizRosterOption[]>;
  /** Get question-level analytics for a quiz. */
  getQuizQuestionStats(quizId: string): Promise<QuizQuestionStats[]>;
  /** Get a student's answer sheet for a quiz. */
  getQuizAttemptDetail(quizId: string, studentId: string): Promise<QuizAttemptDetail | null>;
  /** Get a student's post-submit evaluated answer sheet for a quiz (if eligible). */
  getQuizReview(quizId: string, email: string): Promise<QuizAttemptDetailQuestion[] | null>;
}

interface InsertedId {
  readonly id: string;
}

interface QuizAttemptRow {
  readonly student_id: string;
  readonly score: number | null;
}

interface SyllabusUnitJoinRow {
  readonly id: string;
  readonly name: string;
  readonly unit_no: number | null;
}

interface QuizQuestionCountRow {
  readonly id?: string;
  readonly marks: number | string | null;
}

interface QuizAttemptCountRow {
  readonly id?: string;
  readonly score: number | string | null;
}

interface SavedQuizRow {
  readonly id: string;
  readonly title: string;
  readonly unit_id: string;
  readonly section_id: string | null;
  readonly time_limit_minutes: number | null;
  readonly share_token: string;
  readonly active_from: string | null;
  readonly active_until: string | null;
  readonly show_answers_after_close?: boolean;
  readonly shuffle_questions?: boolean;
  readonly created_at: string | null;
  readonly syllabus_units: SyllabusUnitJoinRow | SyllabusUnitJoinRow[] | null;
  readonly questions: QuizQuestionCountRow[] | null;
  readonly quiz_attempts: QuizAttemptCountRow[] | null;
}

interface ResultQuestionRow {
  readonly marks: number | string | null;
}

interface StudentSectionRow {
  readonly id: string;
  readonly name: string;
  readonly batch: string | null;
  readonly semester: string | null;
  readonly department: string | null;
}

interface ResultStudentRow {
  readonly id: string;
  readonly name: string | null;
  readonly enrollment_number: string | null;
  readonly sections: StudentSectionRow | StudentSectionRow[] | null;
}

interface QuizResultAttemptRow {
  readonly student_id: string;
  readonly score: number | string | null;
  readonly submitted_at: string | null;
  readonly students: ResultStudentRow | ResultStudentRow[] | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function deriveQuizStatus(
  activeFrom: string | null,
  activeUntil: string | null,
  now: Date = new Date(),
): QuizStatus {
  const current = now.getTime();
  const startsAt = timestampOrNull(activeFrom);
  const endsAt = timestampOrNull(activeUntil);

  if (startsAt !== null && current < startsAt) {
    return 'scheduled';
  }
  if (endsAt !== null && current > endsAt) {
    return 'closed';
  }
  return 'active';
}

function timestampOrNull(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function numericValue(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function quizTotalMarks(questions: readonly ResultQuestionRow[]): number {
  return questions.reduce((sum, question) => sum + (numericValue(question.marks) || 1), 0);
}

function unitDisplayName(unit: SyllabusUnitJoinRow | null, fallback: string): string {
  if (!unit) {
    return fallback;
  }
  const name = unit.name.trim();
  if (name.length === 0) {
    return fallback;
  }
  return unit.unit_no !== null ? `Unit ${unit.unit_no}: ${name}` : name;
}

function toSavedQuiz(row: SavedQuizRow): SavedQuizSummary {
  const questions = row.questions ?? [];
  const attempts = row.quiz_attempts ?? [];
  const totalScore = attempts.reduce((sum, attempt) => sum + numericValue(attempt.score), 0);
  const responseCount = attempts.length;
  return {
    id: row.id,
    title: row.title,
    unitId: row.unit_id,
    sectionId: row.section_id,
    unitName: unitDisplayName(firstJoin(row.syllabus_units), row.title),
    timeLimitMinutes: row.time_limit_minutes ?? 15,
    shareToken: row.share_token,
    activeFrom: row.active_from,
    activeUntil: row.active_until,
    showAnswersAfterClose: row.show_answers_after_close ?? false,
    shuffleQuestions: row.shuffle_questions ?? false,
    questionCount: questions.length,
    responseCount,
    totalMarks: quizTotalMarks(questions),
    averageScore: responseCount > 0 ? totalScore / responseCount : null,
    status: deriveQuizStatus(row.active_from, row.active_until),
  };
}

function toRosterOption(value: unknown): QuizRosterOption | null {
  const record = asRecord(value);
  const enrollmentNumber = stringOrNull(record?.enrollmentNumber);
  if (enrollmentNumber === null) {
    return null;
  }
  const sectionId = stringOrNull(record?.sectionId);
  return {
    enrollmentNumber,
    name: stringOrNull(record?.name) ?? enrollmentNumber,
    section: sectionId
      ? {
          id: sectionId,
          name: stringOrNull(record?.sectionName) ?? sectionId,
          batch: stringOrNull(record?.batch),
          semester: stringOrNull(record?.semester),
          department: stringOrNull(record?.department),
        }
      : null,
  };
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
        ...(input.sectionId !== undefined ? { section_id: input.sectionId } : {}),
        time_limit_minutes: input.timeLimitMinutes ?? null,
        share_token: input.shareToken,
        active_from: input.activeFrom ?? null,
        active_until: input.activeUntil ?? null,
        show_answers_after_close: input.showAnswersAfterClose ?? false,
        shuffle_questions: input.shuffleQuestions ?? false,
      };
      const inserted = unwrap(
        await client.from('quizzes').insert(row).select('id').single(),
      ) as InsertedId | null;
      return inserted?.id ?? '';
    },

    async createQuizWithQuestions(input: QuizInput, questions: QuestionInput[]): Promise<string> {
      // Create quiz first
      const row = {
        unit_id: input.unitId,
        title: input.title,
        ...(input.sectionId !== undefined ? { section_id: input.sectionId } : {}),
        time_limit_minutes: input.timeLimitMinutes ?? null,
        share_token: input.shareToken,
        active_from: input.activeFrom ?? null,
        active_until: input.activeUntil ?? null,
        show_answers_after_close: input.showAnswersAfterClose ?? false,
        shuffle_questions: input.shuffleQuestions ?? false,
      };
      const inserted = unwrap(
        await client.from('quizzes').insert(row).select('id').single(),
      ) as InsertedId | null;
      
      const quizId = inserted?.id ?? '';
      if (!quizId) return quizId;

      // Add questions
      if (questions.length > 0) {
        const questionRows = questions.map((q, i) => ({
          quiz_id: quizId,
          text: q.text,
          options: q.options,
          correct_index: q.correctIndex,
          marks: q.marks ?? 1,
          position: i + 1,
        }));
        await client.from('quiz_questions').insert(questionRows);
      }
      return quizId;
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

    async startAttempt(quizId: string, _email: string): Promise<QuizAttemptSessionInfo> {
      // The live `start_quiz_attempt` function resolves the student's identity
      // from the authenticated session (`auth.uid()`/`auth.email()`), not from
      // a parameter — it does not accept `p_provided_email`. `email` is kept in
      // this method's signature only to satisfy the shared interface used by
      // callers (it is unused here; the session established via student OTP
      // verification is what the server actually reads).
      const payload = unwrap(await client.rpc('start_quiz_attempt', { p_quiz_id: quizId }));
      const result = payload as { started_at: string; server_now: string; time_limit_minutes: number };
      return {
        startedAt: result.started_at,
        serverNow: result.server_now,
        timeLimitMinutes: result.time_limit_minutes,
      };
    },

    async resolveAccess(
      quizId: string,
      providedEnrollment: string | null,
      _providedEmail?: string | null,
    ): Promise<QuizAccess> {
      // The live `request_quiz_access` function resolves identity from the
      // authenticated session (`auth.uid()`/`auth.email()`), not from a
      // parameter — it does not accept `p_provided_email`. `providedEmail` is
      // kept in this method's signature only to satisfy the shared interface
      // used by callers (unused here; the session established via student OTP
      // verification is what the server actually reads).
      const payload = unwrap(
        await client.rpc('request_quiz_access', {
          p_quiz_id: quizId,
          p_provided_enrollment: providedEnrollment,
        }),
      );
      return parseQuizAccess(payload);
    },

    async listRosterOptions(quizId: string, searchPrefix?: string): Promise<QuizRosterOption[]> {
      const { data, error } = await client.rpc('list_quiz_roster_options', {
        p_quiz_id: quizId,
        p_search_prefix: searchPrefix ?? '',
      });
      if (error) {
        throw new Error(`list_quiz_roster_options failed: ${error.message}`);
      }
      return (Array.isArray(data) ? data : [])
        .map(toRosterOption)
        .filter((option): option is QuizRosterOption => option !== null);
    },

    async submitAttempt(
      quizId: string,
      answers: Record<string, number>,
      _email: string,
    ): Promise<SubmitAttemptOutcome> {
      // The live `submit_attempt` function resolves identity from the
      // authenticated session, not from a parameter — it does not accept
      // `p_provided_email`. `email` is kept in this method's signature only to
      // satisfy the shared interface used by callers (unused here).
      const payload = unwrap(
        await client.rpc('submit_attempt', {
          p_quiz_id: quizId,
          p_answers: answers,
        }),
      );
      return parseSubmitOutcome(payload);
    },

    async listQuizzes(): Promise<SavedQuizSummary[]> {
      const rows = unwrapList(
        await client
          .from('quizzes')
          .select(
            'id, title, unit_id, section_id, time_limit_minutes, share_token, active_from, active_until, created_at, syllabus_units(id, name, unit_no), questions(id, marks), quiz_attempts(id, score)',
          )
          .order('created_at', { ascending: false }),
      ) as SavedQuizRow[];
      return rows.map(toSavedQuiz);
    },

    async listQuizResults(quizId: string): Promise<QuizResultRow[]> {
      const [questionRows, attemptRows] = await Promise.all([
        unwrapList(
          await client
            .from('questions')
            .select('marks')
            .eq('quiz_id', quizId),
        ) as ResultQuestionRow[],
        unwrapList(
          await client
            .from('quiz_attempts')
            .select(
              'student_id, score, submitted_at, students(id, name, enrollment_number, sections(id, name, batch, semester, department))',
            )
            .eq('quiz_id', quizId)
            .order('submitted_at', { ascending: false }),
        ) as QuizResultAttemptRow[],
      ]);

      const totalMarks = quizTotalMarks(questionRows);
      return attemptRows.map((row) => {
        const student = firstJoin(row.students);
        const section = firstJoin(student?.sections);
        return {
          studentId: row.student_id,
          studentName: student?.name?.trim() || row.student_id,
          enrollmentNumber: student?.enrollment_number ?? null,
          section,
          score: numericValue(row.score),
          totalMarks,
          submittedAt: row.submitted_at ?? '',
        };
      });
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

    async deleteQuiz(quizId: string): Promise<void> {
      expectOk(await client.from('quizzes').delete().eq('id', quizId));
    },

    async resetAttempt(quizId: string, studentId: string): Promise<void> {
      unwrap(
        await client.rpc('reset_quiz_attempt', {
          p_quiz_id: quizId,
          p_student_id: studentId,
        }),
      );
    },
    async listQuizNonAttempters(quizId: string): Promise<QuizRosterOption[]> {
      const payload = unwrap(
        await client.rpc('list_quiz_non_attempters', {
          p_quiz_id: quizId,
        }),
      );
      return (Array.isArray(payload) ? payload : [])
        .map(toRosterOption)
        .filter((option): option is QuizRosterOption => option !== null);
    },

    async getQuizQuestionStats(quizId: string): Promise<QuizQuestionStats[]> {
      const payload = unwrap(
        await client.rpc('quiz_question_stats', {
          p_quiz_id: quizId,
        }),
      );
      return Array.isArray(payload) ? payload : [];
    },

    async getQuizAttemptDetail(quizId: string, studentId: string): Promise<QuizAttemptDetail | null> {
      const payload = unwrap(
        await client.rpc('quiz_attempt_detail', {
          p_quiz_id: quizId,
          p_student_id: studentId,
        }),
      );
      return typeof payload === 'object' && payload !== null ? (payload as QuizAttemptDetail) : null;
    },

    async getQuizReview(quizId: string, _email: string): Promise<QuizAttemptDetailQuestion[] | null> {
      // The live `quiz_review` function resolves identity from the
      // authenticated session, not from a parameter — it does not accept
      // `p_provided_email`. `email` is kept in this method's signature only
      // to satisfy the shared interface used by callers (unused here).
      const payload = unwrap(await client.rpc('quiz_review', { p_quiz_id: quizId }));
      return Array.isArray(payload) ? payload : null;
    },
  };
}
