/**
 * Assignment domain service.
 *
 * Backs the Assignment_Module's two physical-submission trackers. Students
 * never upload files; instead the Teacher records physical submissions per
 * student and per unit in two grids that are managed independently of each
 * other (Requirements 9.4, 9.6):
 *
 *  - The Assignment_Tracker stores a submitted/not-submitted status per
 *    `(assignment, student, unit)` (Requirements 9.4, 9.5).
 *  - The Lab_Manual_Tracker stores a submitted/not-submitted status per
 *    `(student, unit)`, managed independently from the Assignment_Tracker
 *    (Requirements 9.6, 9.7).
 *
 * `createInMemoryAssignmentService` provides an in-memory `AssignmentService`
 * whose setters round-trip through the matching getters and whose two grids
 * never affect one another. The in-memory store models the persistence
 * contract the Supabase-backed data-access wrapper (later task) must honour
 * — the assignment grid keyed by `(assignment_id, student_id, unit_id)` and
 * the lab-manual grid keyed by `(student_id, unit_id)`, mirroring the unique
 * constraints in the data model — and lets the round-trip/independence
 * correctness property be verified in isolation.
 */

import type { SubmissionStatus } from '../shared/types';

/**
 * The submission-tracker persistence contract.
 *
 * Setting a cell persists the per-`(student, unit)` status for the relevant
 * grid; reading it back returns the same status. The default status for a cell
 * that has never been set is `'not-submitted'`.
 */
export interface AssignmentService {
  /**
   * Set the Assignment_Tracker status for a `(assignment, student, unit)`
   * cell (Requirements 9.4, 9.5).
   */
  setAssignmentSubmission(
    assignmentId: string,
    studentId: string,
    unitId: string,
    status: SubmissionStatus,
  ): Promise<void>;

  /**
   * Read back the Assignment_Tracker status for a `(assignment, student, unit)`
   * cell. Returns `'not-submitted'` when the cell has never been set.
   */
  getAssignmentSubmission(
    assignmentId: string,
    studentId: string,
    unitId: string,
  ): Promise<SubmissionStatus>;

  /**
   * Set the Lab_Manual_Tracker status for a `(student, unit)` cell, managed
   * independently from the Assignment_Tracker (Requirements 9.6, 9.7).
   */
  setLabManualSubmission(
    studentId: string,
    unitId: string,
    status: SubmissionStatus,
  ): Promise<void>;

  /**
   * Read back the Lab_Manual_Tracker status for a `(student, unit)` cell.
   * Returns `'not-submitted'` when the cell has never been set.
   */
  getLabManualSubmission(studentId: string, unitId: string): Promise<SubmissionStatus>;
}

/**
 * Serialize cell-key parts into a stable composite store key. Parts are
 * length-prefixed so that no combination of values can collide across
 * differently-segmented keys (e.g. `("a", "bc")` cannot equal `("ab", "c")`).
 */
function compositeKey(parts: string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join('|');
}

/**
 * Create an in-memory `AssignmentService`.
 *
 * The Assignment_Tracker and Lab_Manual_Tracker are backed by two separate
 * maps, so writing to one grid can never change a cell in the other
 * (independence, Requirement 9.6/9.7). Within a grid, setting a cell upserts
 * the status for its `(student, unit)` (and assignment) key, so a repeated set
 * overwrites in place rather than creating a duplicate.
 */
export function createInMemoryAssignmentService(): AssignmentService {
  const assignmentGrid = new Map<string, SubmissionStatus>();
  const labManualGrid = new Map<string, SubmissionStatus>();

  return {
    async setAssignmentSubmission(
      assignmentId: string,
      studentId: string,
      unitId: string,
      status: SubmissionStatus,
    ): Promise<void> {
      assignmentGrid.set(compositeKey([assignmentId, studentId, unitId]), status);
    },

    async getAssignmentSubmission(
      assignmentId: string,
      studentId: string,
      unitId: string,
    ): Promise<SubmissionStatus> {
      return assignmentGrid.get(compositeKey([assignmentId, studentId, unitId])) ?? 'not-submitted';
    },

    async setLabManualSubmission(
      studentId: string,
      unitId: string,
      status: SubmissionStatus,
    ): Promise<void> {
      labManualGrid.set(compositeKey([studentId, unitId]), status);
    },

    async getLabManualSubmission(
      studentId: string,
      unitId: string,
    ): Promise<SubmissionStatus> {
      return labManualGrid.get(compositeKey([studentId, unitId])) ?? 'not-submitted';
    },
  };
}
