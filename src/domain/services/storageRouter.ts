/**
 * Storage router domain service (`storageRouter`).
 *
 * Pure functions backing the Storage_Router: deciding which store an uploaded
 * file belongs in based on its category, and validating an upload against a
 * configured type allowlist and maximum size before any I/O is attempted.
 *
 * These functions hold no state and perform no I/O. Actually persisting the
 * file (Supabase private bucket vs Cloudinary), generating signed/CDN URLs,
 * and recording `files.storage_type` are handled by the data-access layer.
 *
 * Covers:
 * - Requirement 16.2: sensitive files (internal marks exports, exam PDFs,
 *   answer keys, student documents) route to Supabase ('supabase').
 * - Requirement 16.3: public/heavy files (study material, notes, images,
 *   experiment PDFs, assignment files) route to Cloudinary ('cloudinary').
 * - Requirement 16.6 / 10.3: reject an upload whose type is not in the allowed
 *   list or which exceeds the configured maximum size, with an English message.
 * - Requirement 10.1: study material of an allowed type within the maximum
 *   size validates successfully (it is then stored in Cloudinary).
 */
import { type Result, ok, err } from '../shared/result';
import type { StorageType, ValidationError } from '../shared/types';
import { messages } from '../shared/messages';

/**
 * Sensitive file categories that must be kept private in the Supabase private
 * bucket (Requirement 16.2).
 */
export type SensitiveFileCategory =
  | 'marks-export'
  | 'exam-pdf'
  | 'answer-key'
  | 'student-document';

/**
 * Public or heavy file categories that are served from Cloudinary's CDN
 * (Requirement 16.3).
 */
export type PublicFileCategory =
  | 'study-material'
  | 'notes'
  | 'image'
  | 'experiment-pdf'
  | 'assignment';

/** The full set of file categories the storage router understands. */
export type FileCategory = SensitiveFileCategory | PublicFileCategory;

/**
 * The categories considered sensitive. Used by {@link routeStorage} to decide
 * routing; kept as a `Set` so membership is the single source of truth and the
 * routing rule stays exhaustive over {@link FileCategory}.
 */
const SENSITIVE_CATEGORIES: ReadonlySet<FileCategory> = new Set<FileCategory>([
  'marks-export',
  'exam-pdf',
  'answer-key',
  'student-document',
]);

/**
 * The configured upload constraints: the allowed file types (typically MIME
 * types or extensions) and the maximum permitted size in bytes.
 */
export interface UploadPolicy {
  /** The allowlist of permitted file types. An upload's type must be a member. */
  readonly allowedTypes: readonly string[];
  /** The inclusive maximum file size, in bytes. */
  readonly maxSizeBytes: number;
}

/** Number of bytes in one megabyte, used to render the size-limit message. */
const BYTES_PER_MB = 1024 * 1024;

/**
 * Route a file to its store based on its category (Requirements 16.2, 16.3,
 * 10.1).
 *
 * Returns `'supabase'` if and only if the category is sensitive (marks export,
 * exam PDF, answer key, student document); every public/heavy category returns
 * `'cloudinary'`. The result is always one of the two allowed
 * {@link StorageType} values.
 */
export function routeStorage(category: FileCategory): StorageType {
  return SENSITIVE_CATEGORIES.has(category) ? 'supabase' : 'cloudinary';
}

/**
 * Validate an upload against the configured policy (Requirements 16.6, 10.3).
 *
 * The upload is accepted if and only if its `fileType` is in the policy's
 * allowlist AND its `sizeBytes` is a finite, non-negative value not exceeding
 * the policy's maximum. The type allowlist is checked first; a disallowed type
 * is rejected before the size is considered. Each rejection carries an English
 * validation message sourced from the centralized catalog.
 *
 * @returns `ok(undefined)` when the upload satisfies the policy;
 *   `err(ValidationError)` describing the first failed constraint otherwise.
 */
export function validateUpload(
  fileType: string,
  sizeBytes: number,
  policy: UploadPolicy,
): Result<void, ValidationError> {
  if (!policy.allowedTypes.includes(fileType)) {
    return err({
      code: 'file-type-not-allowed',
      message: messages.validation.fileTypeNotAllowed,
      field: 'file',
    });
  }

  const validSize =
    Number.isFinite(sizeBytes) && sizeBytes >= 0 && sizeBytes <= policy.maxSizeBytes;

  if (!validSize) {
    return err({
      code: 'file-too-large',
      message: messages.validation.fileTooLarge(policy.maxSizeBytes / BYTES_PER_MB),
      field: 'file',
    });
  }

  return ok(undefined);
}
