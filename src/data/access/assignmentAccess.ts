/**
 * Assignment data-access wrapper (task 16.2).
 *
 * Binds the pure `assignmentService` to the `assignments`,
 * `assignment_submissions`, and `lab_manual_submissions` tables. Assignment
 * creation is a parameterized write (Requirement 9.1); the two physical-
 * submission trackers are persisted in their own tables on independent unique
 * keys so the Assignment_Tracker and Lab_Manual_Tracker never affect one
 * another (Requirements 9.4–9.7).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import type { SubmissionStatus } from '../../domain/shared/types';
import { toSubmissionStatus } from './rows';
import { expectOk, unwrap } from './support';

/** Fields accepted when creating an assignment. */
export interface AssignmentInput {
  readonly title: string;
  readonly subjectId: string;
  readonly unitId: string;
  readonly dueDate?: string | null;
  readonly fileId?: string | null;
  readonly shareToken: string;
}

/** Supabase-backed assignment operations. */
export interface AssignmentAccess {
  /** Create an assignment and return its id (Requirement 9.1). */
  createAssignment(input: AssignmentInput): Promise<string>;
  /** Persist an Assignment_Tracker cell (Requirements 9.4, 9.5). */
  setAssignmentSubmission(
    assignmentId: string,
    studentId: string,
    unitId: string,
    status: SubmissionStatus,
  ): Promise<void>;
  /** Read an Assignment_Tracker cell; defaults to `'not-submitted'`. */
  getAssignmentSubmission(
    assignmentId: string,
    studentId: string,
    unitId: string,
  ): Promise<SubmissionStatus>;
  /** Persist a Lab_Manual_Tracker cell, independent of the assignment grid. */
  setLabManualSubmission(
    studentId: string,
    unitId: string,
    status: SubmissionStatus,
  ): Promise<void>;
  /** Read a Lab_Manual_Tracker cell; defaults to `'not-submitted'`. */
  getLabManualSubmission(studentId: string, unitId: string): Promise<SubmissionStatus>;
}

interface InsertedId {
  readonly id: string;
}

interface StatusRow {
  readonly status: string | null;
}

/** Create an {@link AssignmentAccess} bound to the given Supabase client. */
export function createAssignmentAccess(
  client: SupabaseClient = defaultClient,
): AssignmentAccess {
  return {
    async createAssignment(input: AssignmentInput): Promise<string> {
      const row = {
        title: input.title,
        subject_id: input.subjectId,
        unit_id: input.unitId,
        due_date: input.dueDate ?? null,
        file_id: input.fileId ?? null,
        share_token: input.shareToken,
      };
      const inserted = unwrap(
        await client.from('assignments').insert(row).select('id').single(),
      ) as InsertedId | null;
      return inserted?.id ?? '';
    },

    async setAssignmentSubmission(
      assignmentId: string,
      studentId: string,
      unitId: string,
      status: SubmissionStatus,
    ): Promise<void> {
      expectOk(
        await client.from('assignment_submissions').upsert(
          {
            assignment_id: assignmentId,
            student_id: studentId,
            unit_id: unitId,
            status,
          },
          { onConflict: 'assignment_id,student_id,unit_id' },
        ),
      );
    },

    async getAssignmentSubmission(
      assignmentId: string,
      studentId: string,
      unitId: string,
    ): Promise<SubmissionStatus> {
      const row = unwrap(
        await client
          .from('assignment_submissions')
          .select('status')
          .eq('assignment_id', assignmentId)
          .eq('student_id', studentId)
          .eq('unit_id', unitId)
          .maybeSingle(),
      ) as StatusRow | null;
      return toSubmissionStatus(row?.status);
    },

    async setLabManualSubmission(
      studentId: string,
      unitId: string,
      status: SubmissionStatus,
    ): Promise<void> {
      expectOk(
        await client.from('lab_manual_submissions').upsert(
          {
            student_id: studentId,
            unit_id: unitId,
            status,
          },
          { onConflict: 'student_id,unit_id' },
        ),
      );
    },

    async getLabManualSubmission(
      studentId: string,
      unitId: string,
    ): Promise<SubmissionStatus> {
      const row = unwrap(
        await client
          .from('lab_manual_submissions')
          .select('status')
          .eq('student_id', studentId)
          .eq('unit_id', unitId)
          .maybeSingle(),
      ) as StatusRow | null;
      return toSubmissionStatus(row?.status);
    },
  };
}
