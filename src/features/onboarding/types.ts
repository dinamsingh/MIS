/**
 * Shared types for the First-Time Teacher Onboarding feature.
 *
 * These mirror the columns of the onboarding schema (migration 0010) but use
 * camelCase in the app layer. Row ↔ model mapping happens in `api/onboarding.ts`.
 */

/** Subject classification used to render the colored kind tag. */
export type SubjectKind = 'theory' | 'lab' | 'project' | 'elective' | 'special';

/** Lifecycle status of a batch; `graduated` batches are excluded from the UI. */
export type BatchStatus = 'classes' | 'exams' | 'graduated';

/** The three fixed sections every batch is split into. */
export type Section = 'A' | 'B' | 'C';

/** All sections, in display order. */
export const SECTIONS: readonly Section[] = ['A', 'B', 'C'] as const;

/** A student batch (cohort), e.g. `2024-28`. */
export interface Batch {
  readonly id: string;
  readonly startYear: number;
  /** The semester (1..8) the batch is currently studying. */
  readonly currentSem: number;
  readonly status: BatchStatus;
}

/** Academic term selected by the teacher during onboarding. */
export type AcademicSession = 'odd' | 'even';

/** A master-syllabus subject for a given semester. */
export interface SyllabusSubject {
  readonly id: string;
  readonly sem: number;
  readonly code: string;
  readonly name: string;
  readonly kind: SubjectKind;
  /** When set on a `theory` subject, selecting it auto-attaches a lab. */
  readonly labName: string | null;
  /**
   * When set, this subject is one variant of an elective choice (e.g. all three
   * Departmental Electives share the group "Departmental Elective"). Onboarding
   * groups variants and lets the teacher pick exactly one per group.
   */
  readonly electiveGroup: string | null;
}

/** The teacher's editable profile captured in step 1. */
export interface OnboardingProfile {
  readonly name: string;
  readonly email: string;
}

/**
 * The wizard's working selection state: for every batch, a map of
 * subjectId → the sections the teacher teaches for that subject.
 */
export interface SubjectSelection {
  readonly sections: Section[];
  readonly labSections: Section[];
}

export type SelectionState = Record<string, Record<string, SubjectSelection>>;

/** A single row destined for `teacher_assignments`. */
export interface AssignmentInput {
  readonly subjectId: string;
  readonly batchId: string;
  readonly section: Section;
  readonly isLab: boolean;
  readonly semester?: number;
}

/** Live batches paired with the subjects that apply to their current semester. */
export interface BatchWithSubjects {
  readonly batch: Batch;
  readonly subjects: readonly SyllabusSubject[];
}

/** Shape persisted to localStorage in demo mode (key `mis_onboarding_v1`). */
export interface OnboardingRecord {
  readonly onboarded: boolean;
  readonly profile: OnboardingProfile;
  readonly assignments: readonly AssignmentInput[];
}
