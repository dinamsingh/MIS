/**
 * Unit tests for the bulk roster "replace" path (`rosterImportAccess.ts`),
 * driven by a recording mock of the Supabase query builder.
 *
 * `replaceSection` implements a delete-then-insert: it reads the section's
 * existing enrollment numbers, deletes the matching `student_roster` allowlist
 * rows, deletes the section's `students`, then inserts the new students and
 * upserts the new allowlist rows. These tests assert the operation ORDER and
 * the reported counts, and one test deliberately documents the data-integrity
 * risk of the non-atomic sequence (see the DATA-INTEGRITY RISK test below).
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRosterImportAccess } from './rosterImportAccess';
import { DataAccessError } from './support';
import type { ParsedRosterRow } from '../../domain/services/rosterImportService';

interface RecordedRow {
  readonly section_id?: string;
  readonly enrollment_number: string;
  readonly name: string;
  readonly email: string | null;
}

/**
 * A recording fake of the Supabase query builder. It logs each operation into
 * `ops` (in call order), captures inserted/upserted rows, and can be told to
 * fail one specific operation via `failOn` to simulate a mid-sequence error.
 */
function createRecordingClient(options: {
  existingEnrollments?: readonly string[];
  failOn?: string;
} = {}) {
  const existingEnrollments = options.existingEnrollments ?? [];
  const failOn = options.failOn ?? null;
  const ops: string[] = [];
  const studentsInserted: RecordedRow[] = [];
  const rosterUpserted: RecordedRow[] = [];

  const respond = (op: string) => {
    ops.push(op);
    if (failOn === op) {
      return Promise.resolve({ data: null, error: { message: `${op} failed`, code: 'PGRST999' } });
    }
    return Promise.resolve({ data: null, error: null });
  };

  const studentsTable = {
    select: (_cols: string) => ({
      eq: (_col: string, _val: string) => {
        ops.push('students.select');
        return Promise.resolve({
          data: existingEnrollments.map((enrollment_number) => ({ enrollment_number })),
          error: null,
        });
      },
    }),
    delete: () => ({
      eq: (_col: string, _val: string) => respond('students.delete'),
    }),
    insert: (rows: RecordedRow | RecordedRow[]) => {
      studentsInserted.push(...(Array.isArray(rows) ? rows : [rows]));
      return respond('students.insert');
    },
  };

  const rosterTable = {
    delete: () => ({
      in: (_col: string, _vals: readonly string[]) => respond('student_roster.delete'),
    }),
    upsert: (rows: RecordedRow | RecordedRow[], _opts: { onConflict: string }) => {
      rosterUpserted.push(...(Array.isArray(rows) ? rows : [rows]));
      return respond('student_roster.upsert');
    },
  };

  const client = {
    from: (table: string) => {
      if (table === 'students') return studentsTable;
      if (table === 'student_roster') return rosterTable;
      throw new Error(`createRecordingClient: unexpected table "${table}"`);
    },
  } as unknown as SupabaseClient;

  return { client, ops, studentsInserted, rosterUpserted };
}

const rows: ParsedRosterRow[] = [
  { enrollmentNumber: '0131CS241001', name: 'Aarav', email: 'aarav@example.com' },
  { enrollmentNumber: '0131CS241002', name: 'Diya', email: 'diya@example.com' },
];

describe('createRosterImportAccess.replaceSection', () => {
  it('deletes the section (roster + students) BEFORE inserting the new rows', async () => {
    const { client, ops } = createRecordingClient({ existingEnrollments: ['0131CS240099'] });

    await createRosterImportAccess(client).replaceSection('section-1', rows);

    expect(ops).toEqual([
      'students.select',
      'student_roster.delete',
      'students.delete',
      'students.insert',
      'student_roster.upsert',
    ]);
    // Explicit ordering guarantee: both deletes precede both writes.
    expect(ops.indexOf('students.delete')).toBeLessThan(ops.indexOf('students.insert'));
    expect(ops.indexOf('student_roster.delete')).toBeLessThan(ops.indexOf('student_roster.upsert'));
  });

  it('reports the deleted (pre-existing) and imported (new) counts', async () => {
    const { client } = createRecordingClient({
      existingEnrollments: ['0131CS240097', '0131CS240098', '0131CS240099'],
    });

    const summary = await createRosterImportAccess(client).replaceSection('section-1', rows);

    expect(summary).toEqual({ deleted: 3, imported: 2 });
  });

  it('inserts the expected students and upserts the allowlist rows verbatim', async () => {
    const { client, studentsInserted, rosterUpserted } = createRecordingClient();

    await createRosterImportAccess(client).replaceSection('section-1', rows);

    expect(studentsInserted).toEqual([
      { section_id: 'section-1', enrollment_number: '0131CS241001', name: 'Aarav', email: 'aarav@example.com' },
      { section_id: 'section-1', enrollment_number: '0131CS241002', name: 'Diya', email: 'diya@example.com' },
    ]);
    expect(rosterUpserted).toEqual([
      { enrollment_number: '0131CS241001', name: 'Aarav', email: 'aarav@example.com' },
      { enrollment_number: '0131CS241002', name: 'Diya', email: 'diya@example.com' },
    ]);
  });

  it('skips the roster delete when the section had no existing enrollments (deleted: 0)', async () => {
    const { client, ops } = createRecordingClient({ existingEnrollments: [] });

    const summary = await createRosterImportAccess(client).replaceSection('section-1', rows);

    expect(summary).toEqual({ deleted: 0, imported: 2 });
    // No allowlist rows to remove, so that delete is not issued...
    expect(ops).not.toContain('student_roster.delete');
    // ...but the students delete still runs before the insert.
    expect(ops).toEqual(['students.select', 'students.delete', 'students.insert', 'student_roster.upsert']);
  });

  it('issues no insert/upsert when replacing with an empty roster (clear only)', async () => {
    const { client, ops } = createRecordingClient({ existingEnrollments: ['0131CS240099'] });

    const summary = await createRosterImportAccess(client).replaceSection('section-1', []);

    expect(summary).toEqual({ deleted: 1, imported: 0 });
    expect(ops).toEqual(['students.select', 'student_roster.delete', 'students.delete']);
    expect(ops).not.toContain('students.insert');
    expect(ops).not.toContain('student_roster.upsert');
  });

  // ------------------------------------------------------------------------
  // DATA-INTEGRITY RISK (documented, not fixed):
  // The delete-then-insert sequence is NOT atomic — there is no surrounding
  // transaction. If the INSERT fails after the DELETEs have already committed,
  // the section is left with its old students removed and no replacements,
  // i.e. partial data loss. This test pins that behavior: on an insert error,
  // the error surfaces as a DataAccessError, but the deletes have already run
  // and the allowlist upsert never happens.
  // ------------------------------------------------------------------------
  it('surfaces an insert error as a DataAccessError AFTER the deletes already ran (non-atomic risk)', async () => {
    const { client, ops } = createRecordingClient({
      existingEnrollments: ['0131CS240099'],
      failOn: 'students.insert',
    });

    let caught: unknown;
    try {
      await createRosterImportAccess(client).replaceSection('section-1', rows);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DataAccessError);
    expect((caught as DataAccessError).code).toBe('PGRST999');

    // The destructive deletes already committed before the failing insert...
    expect(ops).toContain('student_roster.delete');
    expect(ops).toContain('students.delete');
    expect(ops.indexOf('students.delete')).toBeLessThan(ops.indexOf('students.insert'));
    // ...and no compensating rollback / roster upsert occurred: the section is
    // left emptied with the new students never written. Partial data loss.
    expect(ops).not.toContain('student_roster.upsert');
  });
});
