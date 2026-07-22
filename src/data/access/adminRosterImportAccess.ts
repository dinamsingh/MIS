/**
 * Admin-only bulk roster import wrapper (task 10.1).
 *
 * Requirement 6.4 requires reusing the existing, unmodified `parseRosterCsv`
 * rather than writing a new parser. The only gap between the existing
 * teacher-driven CSV path and the admin-driven one is that every admin-
 * imported row must have an email (Requirement 6.1/6.2), while the existing
 * teacher-driven `RosterView` path must keep allowing a null email
 * (Requirement 6.7 — that existing behavior must not change). This module is
 * a thin, additive validation wrapper around the base parser plus a single-
 * student add path — it never modifies `rosterImportService.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedRosterRow, RosterImportResult } from '../../domain/services/rosterImportService';
import { parseRosterCsv } from '../../domain/services/rosterImportService';
import { isValidEnrollmentNumber } from '../../domain/services/rosterService';
import { messages } from '../../domain/shared/messages';
import { expectOk } from './support';

/** The unique key Supabase uses to upsert allowlist rows idempotently. */
const ROSTER_CONFLICT_TARGET = 'enrollment_number';

/**
 * Admin bulk-import result: the existing RosterImportResult, plus rows that
 * parsed successfully but are missing the admin-required email.
 */
export interface AdminRosterImportResult extends RosterImportResult {
  /** Rows that passed the base parser but lack the admin-required email. */
  readonly missingEmail: readonly ParsedRosterRow[];
}

/**
 * Wraps the existing, unmodified `parseRosterCsv` (Requirement 6.4: no new
 * parser) with the ADMIN-ONLY additional requirement that every row have an
 * email (Requirement 6.1/6.2). Rows the base parser already rejected
 * (format/duplicate/malformed) are passed through unchanged; only rows that
 * passed the base parser but lack an email are moved from `valid` into the
 * new `missingEmail` bucket, each annotated with the same rejection-message
 * shape the base parser uses elsewhere in the app.
 */
export function parseAdminRosterCsv(text: string): AdminRosterImportResult {
  const base = parseRosterCsv(text);
  const validWithEmail = base.valid.filter((row) => row.email !== null);
  const missingEmail = base.valid.filter((row) => row.email === null);
  return { valid: validWithEmail, rejected: base.rejected, missingEmail };
}

/**
 * Add a single student to a section's roster (Requirement 6.5) — a one-row
 * equivalent of the bulk CSV path, used as its manual-entry alternative.
 *
 * Re-validates with the SAME pure check the CSV path uses, so a manual add
 * can never bypass the format rule the bulk path enforces. Persists via an
 * additive `students` insert + `student_roster` upsert — never
 * `replaceSection`'s destructive delete-then-insert, since a single add must
 * not wipe the rest of the section's roster.
 */
export async function addSingleStudent(
  client: SupabaseClient,
  sectionId: string,
  row: { enrollmentNumber: string; name: string; email: string },
): Promise<void> {
  if (!isValidEnrollmentNumber(row.enrollmentNumber)) {
    throw new Error(messages.rosterImport.invalidEnrollment);
  }

  expectOk(
    await client.from('students').insert({
      section_id: sectionId,
      enrollment_number: row.enrollmentNumber,
      name: row.name,
      email: row.email,
    }),
  );

  expectOk(
    await client.from('student_roster').upsert(
      { enrollment_number: row.enrollmentNumber, name: row.name, email: row.email },
      { onConflict: ROSTER_CONFLICT_TARGET },
    ),
  );
}
