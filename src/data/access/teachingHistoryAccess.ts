/**
 * Teaching History data-access wrapper (task 18.1).
 *
 * Issues the SAME owner-scoped queries the live Attendance/Marks/Quiz pages
 * already use (`attendance`/`mark_values`/`quiz_attempts`, all filtered by
 * `owner_id = auth.uid()` via the existing RLS from migration 0014/0015 —
 * this module never adds its own `.eq('owner_id', ...)` filter, exactly like
 * `attendanceAccess.ts`/`marksAccess.ts` don't, because RLS already enforces
 * it server-side), additionally restricted to batches that are
 * `status = 'graduated'` OR whose `current_sem` has advanced past the
 * historical record's subject semester — reusing the exact same
 * `isStaleAssignment` comparison `teacherAssignmentService.ts` already
 * exports (unmodified), just applied here for DISPLAY instead of exclusion
 * (Requirement 12.1, 12.3).
 *
 * No new table or column is introduced (Requirement 12.3). Because RLS
 * (`owner_id = auth.uid()`) on `attendance`/`mark_values`/`quizzes` is
 * unchanged, one teacher's query can never return another teacher's rows
 * (Requirement 12.4) — the same isolation guarantee migration 0014 already
 * established.
 *
 * `mark_values` and `quiz_attempts` carry no direct section/batch column, so
 * each row's batch is resolved via its student's `section_id` → `sections.
 * batch` (the same join every other report screen relies on indirectly).
 * A row whose batch cannot be resolved this way is dropped rather than
 * displayed under a fabricated batch label.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import { isStaleAssignment, type BatchState } from '../../domain/services/teacherAssignmentService';

/** One row of historical teaching data, already resolved to batch/semester/subject. */
export interface HistoricalRecordRow {
  readonly batchId: string;
  /** The subject's own semester (what determines whether this record is historical). */
  readonly semester: number;
  readonly subjectId: string;
  readonly subjectCode: string;
  readonly subjectName: string;
  readonly kind: 'attendance' | 'marks' | 'quiz';
  /** How many underlying rows (attendance marks / mark values / quiz attempts) this summarizes. */
  readonly count: number;
}

export interface TeachingHistoryAccess {
  /** Load every one of the caller's own historical (past-semester/graduated) records. */
  loadHistoricalRecords(): Promise<HistoricalRecordRow[]>;
}

interface BatchRow {
  readonly id: string;
  readonly current_sem: number;
  readonly status: 'classes' | 'exams' | 'graduated';
}

interface SubjectRow {
  readonly id: string;
  readonly sem: number;
  readonly code: string;
  readonly name: string;
}

interface SectionRow {
  readonly id: string;
  readonly batch: string | null;
}

interface StudentRow {
  readonly id: string;
  readonly section_id: string | null;
}

/**
 * A record is "historical" under the SAME condition an assignment is derived
 * "stale" (`isStaleAssignment`), plus the graduated-batch case — a batch at
 * `current_sem = 8` that has been marked `graduated` is not strictly "past"
 * its own final-semester subjects by `isStaleAssignment`'s `<` comparison,
 * so `status = 'graduated'` is checked additionally, per Requirement 12.1 /
 * `design.md`'s "reusing the exact same isStaleAssignment-style comparison".
 */
function isHistoricalRecord(subjectSem: number, batch: BatchState & { readonly status: BatchRow['status'] }): boolean {
  if (batch.status === 'graduated') {
    return true;
  }
  return isStaleAssignment({ assignmentId: '', batchId: batch.batchId, subjectSem }, [batch]);
}

/** Aggregate a list of (batchId, subjectId) pairs into count-by-key rows. */
function aggregateCounts(keys: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Create a {@link TeachingHistoryAccess} bound to the given Supabase client. */
export function createTeachingHistoryAccess(
  client: SupabaseClient = defaultClient,
): TeachingHistoryAccess {
  async function loadHistoricalRecords(): Promise<HistoricalRecordRow[]> {
    const [batchesRes, subjectsRes, sectionsRes, attendanceRes, markValuesRes, markComponentsRes, studentsRes, quizAttemptsRes, quizzesRes, syllabusUnitsRes] =
      await Promise.all([
        client.from('batches').select('id, current_sem, status'),
        client.from('syllabus_subjects').select('id, sem, code, name'),
        client.from('sections').select('id, batch'),
        // Owner-scoped via `owner_all_attendance` RLS (owner_id = auth.uid()) — no client-side filter added.
        client.from('attendance').select('subject_id, section_id'),
        // Owner-scoped via `owner_all_mark_values` RLS.
        client.from('mark_values').select('student_id, component_id'),
        // Owner-scoped via `owner_all_mark_components` RLS — resolves component_id -> subject_id.
        client.from('mark_components').select('id, subject_id'),
        // Shared table (RLS: any teacher may read) — resolves student_id -> section_id.
        client.from('students').select('id, section_id'),
        // Owner-scoped via `teacher_read_owned_quiz_attempts` RLS (join on quizzes.owner_id).
        client.from('quiz_attempts').select('student_id, quiz_id'),
        client.from('quizzes').select('id, unit_id, section_id'),
        client.from('syllabus_units').select('id, subject_id'),
      ]);

    const batches = (batchesRes.data ?? []) as BatchRow[];
    const subjects = (subjectsRes.data ?? []) as SubjectRow[];
    const sections = (sectionsRes.data ?? []) as SectionRow[];
    const attendanceRows = (attendanceRes.data ?? []) as Array<{ subject_id: string; section_id: string }>;
    const markValueRows = (markValuesRes.data ?? []) as Array<{ student_id: string; component_id: string }>;
    const markComponentRows = (markComponentsRes.data ?? []) as Array<{ id: string; subject_id: string }>;
    const studentRows = (studentsRes.data ?? []) as StudentRow[];
    const quizAttemptRows = (quizAttemptsRes.data ?? []) as Array<{ student_id: string; quiz_id: string }>;
    const quizRows = (quizzesRes.data ?? []) as Array<{ id: string; unit_id: string; section_id: string | null }>;
    const syllabusUnitRows = (syllabusUnitsRes.data ?? []) as Array<{ id: string; subject_id: string }>;

    const batchById = new Map(batches.map((b) => [b.id, b]));
    const subjectById = new Map(subjects.map((s) => [s.id, s]));
    const batchIdBySection = new Map(sections.map((s) => [s.id, s.batch]));
    const sectionIdByStudent = new Map(studentRows.map((s) => [s.id, s.section_id]));
    const subjectIdByComponent = new Map(markComponentRows.map((c) => [c.id, c.subject_id]));
    const subjectIdByUnit = new Map(syllabusUnitRows.map((u) => [u.id, u.subject_id]));
    const quizById = new Map(quizRows.map((q) => [q.id, q]));

    /** Resolve (batchId, subjectId) for one underlying row, or null if unresolvable — never fabricated. */
    function resolveBatchSubject(batchId: string | null | undefined, subjectId: string | null | undefined): { batchId: string; subjectId: string } | null {
      if (!batchId || !subjectId) return null;
      if (!batchById.has(batchId) || !subjectById.has(subjectId)) return null;
      return { batchId, subjectId };
    }

    const attendanceKeys: string[] = [];
    for (const row of attendanceRows) {
      const batchId = batchIdBySection.get(row.section_id) ?? null;
      const resolved = resolveBatchSubject(batchId, row.subject_id);
      if (resolved) attendanceKeys.push(`${resolved.batchId}::${resolved.subjectId}`);
    }

    const marksKeys: string[] = [];
    for (const row of markValueRows) {
      const sectionId = sectionIdByStudent.get(row.student_id) ?? null;
      const batchId = sectionId ? batchIdBySection.get(sectionId) ?? null : null;
      const subjectId = subjectIdByComponent.get(row.component_id) ?? null;
      const resolved = resolveBatchSubject(batchId, subjectId);
      if (resolved) marksKeys.push(`${resolved.batchId}::${resolved.subjectId}`);
    }

    const quizKeys: string[] = [];
    for (const row of quizAttemptRows) {
      const quiz = quizById.get(row.quiz_id);
      if (!quiz) continue;
      const subjectId = subjectIdByUnit.get(quiz.unit_id) ?? null;
      // Prefer the quiz's own section_id (legacy single-section quizzes);
      // fall back to the attempting student's own section when absent.
      const sectionId = quiz.section_id ?? sectionIdByStudent.get(row.student_id) ?? null;
      const batchId = sectionId ? batchIdBySection.get(sectionId) ?? null : null;
      const resolved = resolveBatchSubject(batchId, subjectId);
      if (resolved) quizKeys.push(`${resolved.batchId}::${resolved.subjectId}`);
    }

    const attendanceCounts = aggregateCounts(attendanceKeys);
    const marksCounts = aggregateCounts(marksKeys);
    const quizCounts = aggregateCounts(quizKeys);

    const allKeys = new Set([...attendanceCounts.keys(), ...marksCounts.keys(), ...quizCounts.keys()]);
    const result: HistoricalRecordRow[] = [];

    for (const key of allKeys) {
      const [batchId, subjectId] = key.split('::');
      const batch = batchById.get(batchId);
      const subject = subjectById.get(subjectId);
      if (!batch || !subject) continue;

      const batchState: BatchState & { readonly status: BatchRow['status'] } = {
        batchId: batch.id,
        currentSem: batch.current_sem,
        status: batch.status,
      };
      if (!isHistoricalRecord(subject.sem, batchState)) continue;

      const base = {
        batchId,
        semester: subject.sem,
        subjectId,
        subjectCode: subject.code,
        subjectName: subject.name,
      };

      const attendanceCount = attendanceCounts.get(key) ?? 0;
      const marksCount = marksCounts.get(key) ?? 0;
      const quizCount = quizCounts.get(key) ?? 0;

      if (attendanceCount > 0) result.push({ ...base, kind: 'attendance', count: attendanceCount });
      if (marksCount > 0) result.push({ ...base, kind: 'marks', count: marksCount });
      if (quizCount > 0) result.push({ ...base, kind: 'quiz', count: quizCount });
    }

    return result;
  }

  return { loadHistoricalRecords };
}
