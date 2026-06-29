/**
 * CSV roster import (`rosterImportService`).
 *
 * The college ERP exports the class roster as a CSV with a single header row,
 * `enrollment,name`, and one student per line. This module owns the pure,
 * synchronous parsing of that text into typed rows: it trims cells, skips blank
 * lines, tolerates the optional header, validates every enrollment number with
 * the shared {@link isValidEnrollmentNumber} check, de-duplicates by enrollment
 * number, and separates the accepted rows from the rejected ones (each with a
 * reason).
 *
 * Keeping the parser pure and free of I/O means the data-access layer can feed
 * it raw file text and the UI can preview the outcome before anything is
 * written, while the logic stays exhaustively unit-testable.
 *
 * Requirements:
 * - 2.1  Roster entries are keyed by a validated enrollment number.
 * - 2.2  Reject non-conforming enrollment numbers with an English reason.
 */
import { isValidEnrollmentNumber } from './rosterService';
import { messages } from '../shared/messages';

/** A roster row that passed every validation and will be imported. */
export interface ParsedRosterRow {
  /** The validated, uppercase enrollment number (identity key). */
  readonly enrollmentNumber: string;
  /** The student's display name. */
  readonly name: string;
}

/** Why a single source line was rejected during parsing. */
export type RosterImportRejectionReason =
  | 'invalid-enrollment'
  | 'missing-name'
  | 'duplicate'
  | 'malformed';

/** A source line that could not be accepted, with its reason and context. */
export interface RejectedRosterRow {
  /** 1-based line number in the original CSV text (for the teacher to locate). */
  readonly line: number;
  /** The original, untrimmed line content. */
  readonly raw: string;
  /** The machine-readable rejection reason. */
  readonly reason: RosterImportRejectionReason;
  /** A professional-English explanation sourced from the message catalog. */
  readonly message: string;
}

/**
 * The outcome of parsing roster CSV text: the accepted rows and the rejected
 * rows coexist (this is not an all-or-nothing `Result`), so the UI can preview
 * counts and surface the rejected lines before the teacher commits the import.
 */
export interface RosterImportResult {
  /** Rows that passed validation and de-duplication, in source order. */
  readonly valid: readonly ParsedRosterRow[];
  /** Rows that were rejected, in source order, each with a reason. */
  readonly rejected: readonly RejectedRosterRow[];
}

/** Map a rejection reason to its professional-English message (Requirement 2.2). */
const REJECTION_MESSAGE: Record<RosterImportRejectionReason, string> = {
  'invalid-enrollment': messages.rosterImport.invalidEnrollment,
  'missing-name': messages.rosterImport.missingName,
  duplicate: messages.rosterImport.duplicate,
  malformed: messages.rosterImport.malformed,
};

/**
 * True when a parsed line is the `enrollment,name` header rather than data.
 * Detection is tolerant: the first cell (case-insensitive, trimmed) being
 * `enrollment` or `enrollment_number` marks the line as a header.
 */
function isHeaderLine(firstCell: string): boolean {
  const normalized = firstCell.trim().toLowerCase();
  return normalized === 'enrollment' || normalized === 'enrollment_number';
}

/**
 * Parse roster CSV text into validated rows and rejected rows.
 *
 * Behaviour:
 *  - Lines are split on `\n` (a trailing `\r` from CRLF files is stripped).
 *  - Blank lines (empty after trimming) are skipped silently.
 *  - The first non-blank line is treated as a header and skipped when its first
 *    cell is `enrollment`/`enrollment_number`; otherwise it is parsed as data.
 *  - Each data line is split on the first comma only, so names containing
 *    commas are preserved. Both cells are trimmed.
 *  - A line with no comma, or a blank enrollment cell, is rejected as
 *    `malformed`; a blank name cell is rejected as `missing-name`; an
 *    enrollment failing {@link isValidEnrollmentNumber} is rejected as
 *    `invalid-enrollment`.
 *  - Rows are de-duplicated by enrollment number: the first occurrence is
 *    accepted and any later line with the same enrollment is rejected as
 *    `duplicate`.
 *
 * Pure and synchronous — performs no I/O.
 */
export function parseRosterCsv(text: string): RosterImportResult {
  const valid: ParsedRosterRow[] = [];
  const rejected: RejectedRosterRow[] = [];
  const seen = new Set<string>();
  let headerConsumed = false;

  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const lineNumber = index + 1;
    // Strip a trailing CR (CRLF files) before trimming for emptiness checks.
    const trimmed = raw.replace(/\r$/, '').trim();

    // Skip blank lines silently.
    if (trimmed === '') {
      continue;
    }

    const commaAt = trimmed.indexOf(',');
    const firstCell = commaAt === -1 ? trimmed : trimmed.slice(0, commaAt);

    // Tolerate a single leading header row.
    if (!headerConsumed && isHeaderLine(firstCell)) {
      headerConsumed = true;
      continue;
    }
    // The first non-blank data line also satisfies "header consumed" so a
    // later data row that happens to read like a header is never skipped.
    headerConsumed = true;

    const reject = (reason: RosterImportRejectionReason) => {
      rejected.push({ line: lineNumber, raw, reason, message: REJECTION_MESSAGE[reason] });
    };

    // No comma → not the expected two-column shape.
    if (commaAt === -1) {
      reject('malformed');
      continue;
    }

    const enrollmentNumber = firstCell.trim();
    const name = trimmed.slice(commaAt + 1).trim();

    if (enrollmentNumber === '') {
      reject('malformed');
      continue;
    }
    if (!isValidEnrollmentNumber(enrollmentNumber)) {
      reject('invalid-enrollment');
      continue;
    }
    if (name === '') {
      reject('missing-name');
      continue;
    }
    if (seen.has(enrollmentNumber)) {
      reject('duplicate');
      continue;
    }

    seen.add(enrollmentNumber);
    valid.push({ enrollmentNumber, name });
  }

  return { valid, rejected };
}
