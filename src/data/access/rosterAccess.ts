/**
 * Roster & quiz-access data-access wrapper (task 16.2).
 *
 * Binds the pure `rosterService` to Supabase: enrollment validation stays a
 * pure check, roster maintenance is a parameterized upsert on `student_roster`
 * keyed by email, and quiz-access resolution delegates to the
 * `request_quiz_access` `SECURITY DEFINER` function via `.rpc(...)` so the
 * roster/answer-key gate is enforced server-side (Requirements 2.1, 2.5).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import {
  isValidEnrollmentNumber,
  ENROLLMENT_NUMBER_INVALID_CODE,
  type RosterEntry,
  type QuizAccess,
} from '../../domain/services/rosterService';
import { type Result, ok, err } from '../../domain/shared/result';
import type { ValidationError } from '../../domain/shared/types';
import { messages } from '../../domain/shared/messages';
import { parseQuizAccess } from './parsers';
import {
  fromRosterEntry,
  toRosterEntry,
  type StudentRosterRow,
} from './rows';
import { unwrap, unwrapList } from './support';

/** Supabase-backed roster operations. */
export interface RosterAccess {
  /** Validate and upsert a roster entry (keyed by email). */
  upsertEntry(entry: RosterEntry): Promise<Result<RosterEntry, ValidationError>>;
  /** List every roster entry. */
  listEntries(): Promise<RosterEntry[]>;
  /** Resolve whether the signed-in student may attempt a quiz (server-side). */
  resolveQuizAccess(quizId: string, providedEnrollment: string | null): Promise<QuizAccess>;
}

/** Create a {@link RosterAccess} bound to the given Supabase client. */
export function createRosterAccess(client: SupabaseClient = defaultClient): RosterAccess {
  return {
    async upsertEntry(entry: RosterEntry): Promise<Result<RosterEntry, ValidationError>> {
      // Reuse the pure validator before any I/O (Requirement 2.2).
      if (!isValidEnrollmentNumber(entry.enrollmentNumber)) {
        return err<ValidationError>({
          code: ENROLLMENT_NUMBER_INVALID_CODE,
          message: messages.validation.enrollmentNumberInvalid,
          field: 'enrollmentNumber',
        });
      }

      const row = unwrap(
        await client
          .from('student_roster')
          .upsert(fromRosterEntry(entry), { onConflict: 'email' })
          .select('id, enrollment_number, email, name')
          .single(),
      ) as StudentRosterRow | null;

      return ok(row !== null ? toRosterEntry(row) : entry);
    },

    async listEntries(): Promise<RosterEntry[]> {
      const rows = unwrapList(
        await client
          .from('student_roster')
          .select('id, enrollment_number, email, name')
          .order('enrollment_number', { ascending: true }),
      ) as StudentRosterRow[];
      return rows.map(toRosterEntry);
    },

    async resolveQuizAccess(
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
  };
}
