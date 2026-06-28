/**
 * CSV roster bulk-import data-access wrapper (task: CSV Roster Import).
 *
 * Binds the pure {@link parseRosterCsv} output to Supabase by replacing a
 * section's roster in one operation. "Replace" mode means the existing students
 * for the section — and their matching `student_roster` allowlist entries — are
 * deleted first, then the parsed rows are inserted. Identity is keyed by
 * enrollment number (the auto-detected unique key from migration 0007), so the
 * import is idempotent: importing the same file twice leaves the database in the
 * same final state.
 *
 * All statements go through the parameterized Supabase query builder
 * (`.from().select()/.delete()/.insert()/.upsert()`), never ad-hoc SQL
 * (Requirement 17.4).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import type { ParsedRosterRow } from '../../domain/services/rosterImportService';
import { expectOk, unwrapList } from './support';

/** The unique key Supabase uses to upsert allowlist rows idempotently. */
const ROSTER_CONFLICT_TARGET = 'enrollment_number';

/** A summary of what the replace operation changed, for UI feedback. */
export interface RosterImportSummary {
  /** Number of students that existed for the section before the import. */
  readonly deleted: number;
  /** Number of students inserted for the section. */
  readonly imported: number;
}

/** Supabase-backed bulk roster import. */
export interface RosterImportAccess {
  /**
   * Replace the entire roster for `sectionId` with `rows` in a single,
   * idempotent operation. Returns a {@link RosterImportSummary}.
   */
  replaceSection(
    sectionId: string,
    rows: readonly ParsedRosterRow[],
  ): Promise<RosterImportSummary>;
}

/** A minimal projection of the `students` table for enrollment lookups. */
interface StudentEnrollmentRow {
  readonly enrollment_number: string | null;
}

/** Create a {@link RosterImportAccess} bound to the given Supabase client. */
export function createRosterImportAccess(
  client: SupabaseClient = defaultClient,
): RosterImportAccess {
  return {
    async replaceSection(
      sectionId: string,
      rows: readonly ParsedRosterRow[],
    ): Promise<RosterImportSummary> {
      // 1. Read the enrollment numbers currently attached to this section so we
      //    can remove the matching allowlist rows (keyed by enrollment number).
      const existing = unwrapList(
        await client
          .from('students')
          .select('enrollment_number')
          .eq('section_id', sectionId),
      ) as StudentEnrollmentRow[];

      const existingEnrollments = existing
        .map((row) => row.enrollment_number)
        .filter((value): value is string => value !== null);

      // 2. Delete the matching allowlist (student_roster) entries.
      if (existingEnrollments.length > 0) {
        expectOk(
          await client
            .from('student_roster')
            .delete()
            .in('enrollment_number', existingEnrollments),
        );
      }

      // 3. Delete the section's existing students.
      expectOk(
        await client.from('students').delete().eq('section_id', sectionId),
      );

      // 4. Insert the new students (email is unknown until Google sign-in).
      if (rows.length > 0) {
        const studentRows = rows.map((row) => ({
          section_id: sectionId,
          enrollment_number: row.enrollmentNumber,
          name: row.name,
          email: null,
        }));
        expectOk(await client.from('students').insert(studentRows));

        // 5. Upsert the allowlist entries keyed by enrollment number so the
        //    import stays idempotent even if an entry already exists.
        const rosterRows = rows.map((row) => ({
          enrollment_number: row.enrollmentNumber,
          name: row.name,
          email: null,
        }));
        expectOk(
          await client
            .from('student_roster')
            .upsert(rosterRows, { onConflict: ROSTER_CONFLICT_TARGET }),
        );
      }

      return { deleted: existingEnrollments.length, imported: rows.length };
    },
  };
}
