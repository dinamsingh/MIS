/**
 * Property-based tests for the admin bulk roster import wrapper (task 10.2-10.4).
 *
 * Uses a minimal recording fake of the Supabase query builder — the same style
 * as `fileStorage.test.ts` — so persistence assertions exercise the real
 * `replaceSection`/`addSingleStudent` code paths without any network access.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { SupabaseClient } from '@supabase/supabase-js';

import { parseAdminRosterCsv, addSingleStudent } from './adminRosterImportAccess';
import { createRosterImportAccess } from './rosterImportAccess';
import { isValidEnrollmentNumber } from '../../domain/services/rosterService';
import { messages } from '../../domain/shared/messages';

// ---------------------------------------------------------------------------
// A recording fake of the Supabase query builder used by both
// `rosterImportAccess.ts` (replaceSection) and `adminRosterImportAccess.ts`
// (addSingleStudent). Captures every row inserted into `students` and every
// row upserted into `student_roster` so persistence content can be asserted.
// ---------------------------------------------------------------------------

interface RecordedStudentRow {
  section_id: string;
  enrollment_number: string;
  name: string;
  email: string | null;
}

interface RecordedRosterRow {
  enrollment_number: string;
  name: string;
  email: string | null;
}

function createRecordingClient(existingEnrollments: readonly string[] = []) {
  const studentsInserted: RecordedStudentRow[] = [];
  const rosterUpserted: RecordedRosterRow[] = [];

  const studentsTable = {
    select: (_cols: string) => ({
      eq: (_col: string, _val: string) =>
        Promise.resolve({
          data: existingEnrollments.map((enrollment_number) => ({ enrollment_number })),
          error: null,
        }),
    }),
    delete: () => ({
      eq: (_col: string, _val: string) => Promise.resolve({ error: null }),
    }),
    insert: (rows: RecordedStudentRow | RecordedStudentRow[]) => {
      const arr = Array.isArray(rows) ? rows : [rows];
      studentsInserted.push(...arr);
      return Promise.resolve({ error: null });
    },
  };

  const rosterTable = {
    delete: () => ({
      in: (_col: string, _vals: readonly string[]) => Promise.resolve({ error: null }),
    }),
    upsert: (
      rows: RecordedRosterRow | RecordedRosterRow[],
      _opts: { onConflict: string },
    ) => {
      const arr = Array.isArray(rows) ? rows : [rows];
      rosterUpserted.push(...arr);
      return Promise.resolve({ error: null });
    },
  };

  const client = {
    from: (table: string) => {
      if (table === 'students') return studentsTable;
      if (table === 'student_roster') return rosterTable;
      throw new Error(`createRecordingClient: unexpected table "${table}"`);
    },
  } as unknown as SupabaseClient;

  return { client, studentsInserted, rosterUpserted };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A short identifier: non-empty after trim, no CSV-breaking characters. */
const identifierArb = fc
  .string({ minLength: 1, maxLength: 12 })
  .map((s) => s.trim())
  .filter(
    (s) =>
      s.length > 0 &&
      !s.includes(',') &&
      !s.includes('\n') &&
      !s.includes('\r') &&
      s.toLowerCase() !== 'enrollment' &&
      s.toLowerCase() !== 'enrollment_number',
  );

/** A syntactically valid enrollment number matching `isValidEnrollmentNumber`. */
const validEnrollmentArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: 4,
      maxLength: 4,
    }),
    fc.stringOf(fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('')), {
      minLength: 2,
      maxLength: 2,
    }),
    fc.stringOf(
      fc.constantFrom(..."0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('')),
      { minLength: 6, maxLength: 6 },
    ),
  )
  .map(([digits, letters, tail]) => `${digits}${letters}${tail}`);

/** A non-empty string that does NOT satisfy `isValidEnrollmentNumber`. */
const invalidEnrollmentArb: fc.Arbitrary<string> = identifierArb.filter(
  (s) => !isValidEnrollmentNumber(s),
);

/** Enrollment number: missing, present-but-invalid, or a valid format. */
const enrollmentFieldArb = fc.oneof(
  fc.constant(''),
  invalidEnrollmentArb,
  validEnrollmentArb,
);

/** Name/email: missing, or a present, CSV-safe value. */
const optionalFieldArb = fc.oneof(fc.constant(''), identifierArb);

/** Build a single-line CSV row from the three raw fields (no header, no trailing newline). */
function buildLine(enrollment: string, name: string, email: string): string {
  const emailPart = email !== '' ? `,${email}` : '';
  return `${enrollment},${name}${emailPart}`;
}

// ---------------------------------------------------------------------------
// Property 14: Roster row required-field and format validation
// Validates: Requirements 6.1, 6.2, 6.6
// ---------------------------------------------------------------------------

/**
 * **Validates: Requirements 6.1, 6.2, 6.6**
 * Property 14: Roster row required-field and format validation.
 * For any uploaded roster row missing its enrollment number, name, or email,
 * OR whose enrollment number does not match `isValidEnrollmentNumber`, the
 * admin bulk-import path rejects that row and identifies both the row and the
 * specific violated field/format — for every other row (all three fields
 * present, enrollment number valid), the row is accepted.
 */
describe('Property 14: Roster row required-field and format validation', () => {
  it('rejects rows missing enrollment/name/email or with an invalid enrollment format; accepts every other row', () => {
    fc.assert(
      fc.property(
        enrollmentFieldArb,
        optionalFieldArb,
        optionalFieldArb,
        (enrollment, name, email) => {
          const line = buildLine(enrollment, name, email);
          const result = parseAdminRosterCsv(line);

          if (enrollment === '' || !isValidEnrollmentNumber(enrollment)) {
            // Format/required violation on the enrollment number itself:
            // the base parser rejects it (malformed or invalid-enrollment).
            expect(result.rejected).toHaveLength(1);
            expect(result.valid).toHaveLength(0);
            expect(result.missingEmail).toHaveLength(0);
            const rejection = result.rejected[0];
            expect(['malformed', 'invalid-enrollment']).toContain(rejection.reason);
            expect(rejection.message.length).toBeGreaterThan(0);
            return;
          }

          if (name === '') {
            // Missing name: rejected by the base parser, identified by reason.
            expect(result.rejected).toHaveLength(1);
            expect(result.valid).toHaveLength(0);
            expect(result.missingEmail).toHaveLength(0);
            expect(result.rejected[0].reason).toBe('missing-name');
            return;
          }

          if (email === '') {
            // Passed the base parser but missing the admin-required email:
            // moved into the new `missingEmail` bucket, identified by row.
            expect(result.rejected).toHaveLength(0);
            expect(result.valid).toHaveLength(0);
            expect(result.missingEmail).toHaveLength(1);
            const row = result.missingEmail[0];
            expect(row.enrollmentNumber).toBe(enrollment);
            expect(row.name).toBe(name);
            expect(row.email).toBeNull();
            // The message identifies the row (by enrollment number).
            expect(messages.rosterImport.missingEmail(row.enrollmentNumber)).toContain(
              row.enrollmentNumber,
            );
            return;
          }

          // All three fields present and the enrollment format is valid: accepted.
          expect(result.rejected).toHaveLength(0);
          expect(result.missingEmail).toHaveLength(0);
          expect(result.valid).toHaveLength(1);
          expect(result.valid[0]).toEqual({
            enrollmentNumber: enrollment,
            name,
            email,
          });
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15: Accepted roster email is immediately bound
// Validates: Requirements 6.3
// ---------------------------------------------------------------------------

/**
 * Distinct-by-enrollment AND distinct-by-email (case-insensitive) arrays of
 * valid rows, each with a non-null email — a real roster never binds the same
 * email to two different students, so the property is checked over that
 * realistic input space.
 */
const acceptedRowsArb = fc
  .uniqueArray(
    fc.record({
      enrollmentNumber: validEnrollmentArb,
      name: identifierArb,
      email: identifierArb,
    }),
    { minLength: 1, maxLength: 5 },
  )
  .filter((rows) => {
    const enrollments = new Set(rows.map((r) => r.enrollmentNumber));
    const emails = new Set(rows.map((r) => r.email.toLowerCase()));
    return enrollments.size === rows.length && emails.size === rows.length;
  });

/**
 * **Validates: Requirements 6.3**
 * Property 15: Accepted roster email is immediately bound.
 * For any roster row accepted with an email, the resulting `student_roster`
 * entry is pre-bound such that a first quiz-link access for that email
 * succeeds without any enrollment-verification step. This is exercised
 * against `replaceSection`'s existing, unmodified upsert: the RPC that binds
 * access (`request_quiz_access`) looks a student up by
 * `lower(email) = lower(v_email)` and, when found, skips the
 * enrollment-required branch entirely — so the property here is that every
 * accepted row's email is present, verbatim, in the upserted allowlist.
 */
describe('Property 15: Accepted roster email is immediately bound', () => {
  it('pre-binds every accepted row so an email lookup finds it without requiring an enrollment number', async () => {
    await fc.assert(
      fc.asyncProperty(acceptedRowsArb, async (rows) => {
        const { client, rosterUpserted } = createRecordingClient();
        const access = createRosterImportAccess(client);

        await access.replaceSection('section-1', rows);

        for (const row of rows) {
          // Simulate the RPC's binding lookup: find-by-email must succeed —
          // this is exactly what lets a first-time student skip the
          // enrollment-verification / self-registration branch.
          const bound = rosterUpserted.find(
            (r) => r.email !== null && r.email.toLowerCase() === row.email.toLowerCase(),
          );
          expect(bound).toBeDefined();
          expect(bound?.enrollment_number).toBe(row.enrollmentNumber);
          expect(bound?.name).toBe(row.name);
        }
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 16: Single-student add is equivalent to a one-row import
// Validates: Requirements 6.5
// ---------------------------------------------------------------------------

const singleStudentArb = fc.record({
  enrollmentNumber: validEnrollmentArb,
  name: identifierArb,
  email: identifierArb,
});

/**
 * **Validates: Requirements 6.5**
 * Property 16: Single-student add is equivalent to a one-row import.
 * For any valid single-student input, the `students`/`student_roster` rows
 * produced by `addSingleStudent` are identical in content to what a one-row
 * CSV import of the same data would produce via `replaceSection`.
 */
describe('Property 16: Single-student add is equivalent to a one-row import', () => {
  it('produces the same students/student_roster row content as a one-row replaceSection import', async () => {
    await fc.assert(
      fc.asyncProperty(singleStudentArb, async (row) => {
        const sectionId = 'section-1';

        const single = createRecordingClient();
        await addSingleStudent(single.client, sectionId, row);

        const bulk = createRecordingClient();
        await createRosterImportAccess(bulk.client).replaceSection(sectionId, [row]);

        expect(single.studentsInserted).toEqual(bulk.studentsInserted);
        expect(single.rosterUpserted).toEqual(bulk.rosterUpserted);
      }),
    );
  });
});
