/**
 * Shared, cross-cutting domain types used by multiple services.
 *
 * Service-specific entity interfaces (Quiz, Attendance, MarkComponent, etc.)
 * are defined alongside their owning service in later tasks. This module holds
 * only the foundational types that the whole domain layer depends on:
 * actor identity, structured error shapes, and storage primitives.
 */

/** The kind of actor making a request, used for navigation gating only. */
export type ActorKind = 'teacher' | 'student' | 'anonymous';

/**
 * The authenticated actor. Authorization is always enforced server-side by
 * RLS; the client uses this only to decide what UI/navigation to render.
 */
export type Actor =
  | { kind: 'teacher'; userId: string; email: string }
  | {
      kind: 'student';
      userId: string;
      email: string;
      name: string;
      enrollmentNumber: string | null;
    }
  | { kind: 'anonymous' };

/**
 * A user-correctable validation failure. `field` optionally identifies the
 * input the message should be surfaced next to. `message` is always English
 * text sourced from the message catalog.
 */
export interface ValidationError {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
}

/** An authentication/authorization failure surfaced to the UI. */
export interface AuthError {
  readonly code: string;
  readonly message: string;
}

/** The two stores a file may be routed to (mirrors files.storage_type). */
export type StorageType = 'supabase' | 'cloudinary';

/** Submission status used by the assignment and lab-manual trackers. */
export type SubmissionStatus = 'submitted' | 'not-submitted';
