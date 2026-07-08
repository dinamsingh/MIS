/**
 * Assignment data-access wrapper.
 *
 * Supports two models:
 *
 * LEGACY (existing)  – named assignments with unit_id, file_id, share_token.
 *   Used by the old per-assignment tracker; kept for backward compat.
 *
 * SIMPLIFIED (new)  – numbered slots (1-5) per subject. No file upload, no
 *   share token required. Matches the teacher's Excel workflow where each
 *   subject has "Assignment 1 … Assignment 5" columns.  `unit_id` is null
 *   for these rows and submissions use a separate partial unique index.
 *
 * Lab-manual tracking is subject-level (one DONE per student per subject)
 * using the `subject_id` column added in migration 0030.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import type { SubmissionStatus } from '../../domain/shared/types';
import { toSubmissionStatus } from './rows';
import { expectOk, unwrap } from './support';

// ---------------------------------------------------------------------------
// Existing types (unchanged – used by legacy flow)
// ---------------------------------------------------------------------------

/** Fields accepted when creating an assignment (legacy named flow). */
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
  /** Create an assignment and return its id (legacy flow). */
  createAssignment(input: AssignmentInput): Promise<string>;
  /** Persist an Assignment_Tracker cell (legacy flow). */
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
  /** Persist a Lab_Manual_Tracker cell (legacy unit-level). */
  setLabManualSubmission(
    studentId: string,
    unitId: string,
    status: SubmissionStatus,
  ): Promise<void>;
  /** Read a Lab_Manual_Tracker cell (legacy unit-level). */
  getLabManualSubmission(studentId: string, unitId: string): Promise<SubmissionStatus>;

  // ── Simplified slot-based API (migration 0030) ──────────────────────────

  /**
   * Find or lazily create the numbered assignment slot (1-5) for a subject.
   * Returns the assignment row's id.
   */
  getOrCreateSlot(subjectId: string, slotNumber: 1 | 2 | 3 | 4 | 5): Promise<string>;

  /**
   * Fetch all slot ids for a subject (returns sparse array – only slots that
   * have been touched at least once).
   */
  listSlotsForSubject(subjectId: string): Promise<Array<{ id: string; slotNumber: number }>>;

  /**
   * Mark / unmark a submission for a numbered slot (unit_id = null path).
   * Timestamps `submitted_at` when status → 'submitted'.
   */
  setSlotSubmission(
    assignmentId: string,
    studentId: string,
    status: SubmissionStatus,
  ): Promise<void>;

  /** Read all slot submissions for a given assignment, keyed by student id. */
  getSlotSubmissions(
    assignmentId: string,
    studentIds: readonly string[],
  ): Promise<Record<string, SubmissionStatus>>;

  /**
   * Subject-level lab-file check (one DONE per student per subject).
   * Uses the `subject_id` column added in migration 0030.
   */
  setLabManualBySubject(
    studentId: string,
    subjectId: string,
    status: SubmissionStatus,
  ): Promise<void>;

  /** Read lab-file statuses for multiple students under one subject. */
  getLabManualsBySubject(
    studentIds: readonly string[],
    subjectId: string,
  ): Promise<Record<string, SubmissionStatus>>;
}

// ---------------------------------------------------------------------------
// Internal row shapes
// ---------------------------------------------------------------------------

interface InsertedId {
  readonly id: string;
}

interface StatusRow {
  readonly status: string | null;
}

interface SlotRow {
  readonly id: string;
  readonly assignment_number: number;
}

interface SlotSubmissionRow {
  readonly student_id: string;
  readonly status: string | null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create an {@link AssignmentAccess} bound to the given Supabase client. */
export function createAssignmentAccess(
  client: SupabaseClient = defaultClient,
): AssignmentAccess {
  return {
    // ── Legacy named assignment ───────────────────────────────────────────

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
            submitted_at: status === 'submitted' ? new Date().toISOString() : null,
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
            submitted_at: status === 'submitted' ? new Date().toISOString() : null,
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

    // ── Simplified slot-based API ─────────────────────────────────────────

    async getOrCreateSlot(
      subjectId: string,
      slotNumber: 1 | 2 | 3 | 4 | 5,
    ): Promise<string> {
      // Try to find existing slot first
      const existing = unwrap(
        await client
          .from('assignments')
          .select('id')
          .eq('subject_id', subjectId)
          .eq('assignment_number', slotNumber)
          .maybeSingle(),
      ) as InsertedId | null;

      if (existing?.id) return existing.id;

      // Create the slot lazily – no file, no share_token required for slots
      const created = unwrap(
        await client
          .from('assignments')
          .insert({
            title: `Assignment ${slotNumber}`,
            subject_id: subjectId,
            unit_id: null,
            assignment_number: slotNumber,
            share_token: `slot-${subjectId}-${slotNumber}-${Date.now()}`,
          })
          .select('id')
          .single(),
      ) as InsertedId | null;

      return created?.id ?? '';
    },

    async listSlotsForSubject(
      subjectId: string,
    ): Promise<Array<{ id: string; slotNumber: number }>> {
      const rows = unwrap(
        await client
          .from('assignments')
          .select('id, assignment_number')
          .eq('subject_id', subjectId)
          .not('assignment_number', 'is', null)
          .order('assignment_number'),
      ) as SlotRow[] | null;

      return (rows ?? []).map((row) => ({
        id: row.id,
        slotNumber: row.assignment_number,
      }));
    },

    async setSlotSubmission(
      assignmentId: string,
      studentId: string,
      status: SubmissionStatus,
    ): Promise<void> {
      // unit_id IS NULL path – uses partial unique index
      // assignment_submissions_slot_student_unique
      const submittedAt = status === 'submitted' ? new Date().toISOString() : null;
      const existing = unwrap(
        await client
          .from('assignment_submissions')
          .select('student_id')
          .eq('assignment_id', assignmentId)
          .eq('student_id', studentId)
          .is('unit_id', null)
          .maybeSingle(),
      ) as { readonly student_id: string } | null;

      if (existing) {
        expectOk(
          await client
            .from('assignment_submissions')
            .update({ status, submitted_at: submittedAt })
            .eq('assignment_id', assignmentId)
            .eq('student_id', studentId)
            .is('unit_id', null),
        );
        return;
      }

      expectOk(
        await client.from('assignment_submissions').insert({
          assignment_id: assignmentId,
          student_id: studentId,
          unit_id: null,
          status,
          submitted_at: submittedAt,
        }),
      );
    },

    async getSlotSubmissions(
      assignmentId: string,
      studentIds: readonly string[],
    ): Promise<Record<string, SubmissionStatus>> {
      if (studentIds.length === 0) return {};

      const rows = unwrap(
        await client
          .from('assignment_submissions')
          .select('student_id, status')
          .eq('assignment_id', assignmentId)
          .in('student_id', studentIds as string[])
          .is('unit_id', null),
      ) as SlotSubmissionRow[] | null;

      const map: Record<string, SubmissionStatus> = {};
      for (const row of rows ?? []) {
        map[row.student_id] = toSubmissionStatus(row.status);
      }
      return map;
    },

    async setLabManualBySubject(
      studentId: string,
      subjectId: string,
      status: SubmissionStatus,
    ): Promise<void> {
      const submittedAt = status === 'submitted' ? new Date().toISOString() : null;
      const existing = unwrap(
        await client
          .from('lab_manual_submissions')
          .select('student_id')
          .eq('student_id', studentId)
          .eq('subject_id', subjectId)
          .maybeSingle(),
      ) as { readonly student_id: string } | null;

      if (existing) {
        expectOk(
          await client
            .from('lab_manual_submissions')
            .update({ status, submitted_at: submittedAt })
            .eq('student_id', studentId)
            .eq('subject_id', subjectId),
        );
        return;
      }

      expectOk(
        await client.from('lab_manual_submissions').insert({
          student_id: studentId,
          subject_id: subjectId,
          unit_id: null,
          status,
          submitted_at: submittedAt,
        }),
      );
    },

    async getLabManualsBySubject(
      studentIds: readonly string[],
      subjectId: string,
    ): Promise<Record<string, SubmissionStatus>> {
      if (studentIds.length === 0) return {};

      const rows = unwrap(
        await client
          .from('lab_manual_submissions')
          .select('student_id, status')
          .eq('subject_id', subjectId)
          .in('student_id', studentIds as string[]),
      ) as SlotSubmissionRow[] | null;

      const map: Record<string, SubmissionStatus> = {};
      for (const row of rows ?? []) {
        map[row.student_id] = toSubmissionStatus(row.status);
      }
      return map;
    },
  };
}
