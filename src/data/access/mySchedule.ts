/**
 * Unified "My Schedule" data-access + pure formatting (task 26.1).
 *
 * Aggregates entries across ALL of a teacher's `teacher_assignments` — every
 * batch/section/subject, not one section at a time (Requirement 17.1). Reads
 * are still per-section under the hood (`owner_id = auth.uid()` RLS on
 * `timetable_entries` already scopes every read to the caller, exactly as in
 * `timetableAccess.ts`), just fanned out across every distinct section the
 * teacher's assignments touch and merged client-side — no server-side
 * aggregation RPC, so the formatting/truncation/labeling logic
 * (Requirement 17.2/17.3) stays pure and unit-testable, consistent with how
 * every other view in this codebase (Dashboard, Timetable, Attendance) keeps
 * derivation pure and client-side with Supabase used only for storage.
 *
 * `SelectedSectionContext` and every single-section page (Attendance, Marks,
 * Syllabus) are completely untouched by this module (Requirement 17.4).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import type { DayOfWeek, SpecialActivity, TimetableEntry } from '../../domain/services/timetableService';

/** One cell of the unified weekly grid — one scheduled period for one of the
 *  teacher's own `teacher_assignments` (Requirement 17.1). */
export interface MyScheduleCell {
  readonly entry: TimetableEntry;
  readonly sem: number;
  readonly section: string; // 'A' | 'B' | 'C'
  readonly subjectName: string;
}

/**
 * The longest a subject name may render at full length in a My Schedule cell
 * before the deterministic truncation rule (Requirement 17.3) kicks in.
 */
export const MAX_SUBJECT_NAME_LENGTH = 24;

/**
 * Deterministic truncation rule (Requirement 17.3): a name at or under
 * {@link MAX_SUBJECT_NAME_LENGTH} is returned unchanged (identity for short
 * names); a longer name is cut to the threshold minus one character plus a
 * trailing ellipsis, applied identically every time. The truncated result's
 * length is always exactly `MAX_SUBJECT_NAME_LENGTH`, so re-truncating an
 * already-truncated name is a no-op (idempotent).
 */
export function truncateSubjectName(name: string): string {
  return name.length <= MAX_SUBJECT_NAME_LENGTH
    ? name
    : `${name.slice(0, MAX_SUBJECT_NAME_LENGTH - 1)}…`;
}

/**
 * Cell label formatter — pure, so the exact format is unit-testable in
 * isolation (Requirement 17.2: `"SEM {n}({section}) {subject name}"`, e.g.
 * `"SEM 5(A) Database Management Systems"`).
 */
export function formatScheduleCellLabel(sem: number, section: string, subjectName: string): string {
  return `SEM ${sem}(${section}) ${truncateSubjectName(subjectName)}`;
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

interface TeacherAssignmentRow {
  readonly id: string;
  readonly batch_id: string;
  readonly section: string;
  readonly subject_id: string;
}

interface SyllabusSubjectRow {
  readonly id: string;
  readonly sem: number;
  readonly name: string;
}

interface SectionRow {
  readonly id: string;
  readonly name: string;
  readonly batch: string | null;
}

interface TimetableEntryFullRow {
  readonly id: string;
  readonly section_id: string;
  readonly subject_id: string | null;
  readonly day_of_week: string;
  readonly time_slot: string;
  readonly period_id: string | null;
  readonly span_periods: number | null;
  readonly room: string | null;
  readonly is_tutorial: boolean | null;
  readonly special_activity: string | null;
}

/** Resolve the current teacher's id from the Supabase session (live mode). */
async function requireTeacherId(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) {
    throw new Error('No authenticated teacher session.');
  }
  return userId;
}

/**
 * Resolve the real `sections.id` for a `teacher_assignments` row's
 * `(batch_id, section)` pair, mirroring the exact join every existing quiz/
 * dashboard RPC already uses (`s.batch = ta.batch_id AND upper(right(s.name,
 * 1)) = ta.section`) — just evaluated client-side here instead of in SQL.
 */
function resolveSectionId(
  sections: readonly SectionRow[],
  batchId: string,
  section: string,
): string | undefined {
  return sections.find(
    (s) => s.batch === batchId && s.name.slice(-1).toUpperCase() === section.toUpperCase(),
  )?.id;
}

/**
 * Fetch and aggregate the current teacher's unified weekly schedule across
 * ALL of their `teacher_assignments` (Requirement 17.1).
 *
 * Fans out: (1) load the teacher's own assignments, (2) resolve each
 * assignment's subject (for `sem`/`subjectName`) and real `sections.id`,
 * (3) load `timetable_entries` for every DISTINCT section id among those
 * assignments, (4) merge in-browser — an entry becomes a cell only when its
 * `(section_id, subject_id)` matches one of the teacher's own assignments,
 * so a section shared with other teachers never leaks their entries into
 * this teacher's schedule (on top of `timetable_entries`' own
 * `owner_id = auth.uid()` RLS, which already prevents that server-side).
 */
export async function fetchMySchedule(
  client: SupabaseClient = defaultClient,
): Promise<MyScheduleCell[]> {
  const teacherId = await requireTeacherId(client);

  const assignmentRes = await client
    .from('teacher_assignments')
    .select('id, batch_id, section, subject_id')
    .eq('teacher_id', teacherId);
  if (assignmentRes.error) {
    throw new Error(assignmentRes.error.message);
  }
  const assignmentRows = (assignmentRes.data ?? []) as TeacherAssignmentRow[];
  if (assignmentRows.length === 0) {
    return [];
  }

  const subjectIds = Array.from(new Set(assignmentRows.map((row) => row.subject_id)));
  const batchIds = Array.from(new Set(assignmentRows.map((row) => row.batch_id)));

  const [subjectRes, sectionRes] = await Promise.all([
    client.from('syllabus_subjects').select('id, sem, name').in('id', subjectIds),
    client.from('sections').select('id, name, batch').in('batch', batchIds),
  ]);
  if (subjectRes.error) {
    throw new Error(subjectRes.error.message);
  }
  if (sectionRes.error) {
    throw new Error(sectionRes.error.message);
  }
  const subjectById = new Map(
    ((subjectRes.data ?? []) as SyllabusSubjectRow[]).map((row) => [row.id, row]),
  );
  const sections = (sectionRes.data ?? []) as SectionRow[];

  // One context entry per assignment: its resolved sectionId plus the
  // sem/section/subjectName a matching timetable entry should be labeled
  // with (Requirement 17.2).
  interface AssignmentContext {
    readonly sectionId: string;
    readonly subjectId: string;
    readonly sem: number;
    readonly section: string;
    readonly subjectName: string;
  }
  const contexts: AssignmentContext[] = [];
  for (const row of assignmentRows) {
    const sectionId = resolveSectionId(sections, row.batch_id, row.section);
    const subject = subjectById.get(row.subject_id);
    if (!sectionId || !subject) {
      continue;
    }
    contexts.push({
      sectionId,
      subjectId: row.subject_id,
      sem: subject.sem,
      section: row.section,
      subjectName: subject.name,
    });
  }
  if (contexts.length === 0) {
    return [];
  }

  const distinctSectionIds = Array.from(new Set(contexts.map((c) => c.sectionId)));
  const entriesRes = await client
    .from('timetable_entries')
    .select('id, section_id, subject_id, day_of_week, time_slot, period_id, span_periods, room, is_tutorial, special_activity')
    .in('section_id', distinctSectionIds);
  if (entriesRes.error) {
    throw new Error(entriesRes.error.message);
  }
  const entryRows = (entriesRes.data ?? []) as TimetableEntryFullRow[];

  const contextByKey = new Map(contexts.map((c) => [`${c.sectionId}::${c.subjectId}`, c]));

  const cells: MyScheduleCell[] = [];
  for (const row of entryRows) {
    if (!row.subject_id) {
      // Special-activity / tutorial entries with no subject reference are
      // not tied to a specific teacher_assignment — not part of the
      // per-assignment My Schedule aggregation (Requirement 17.1).
      continue;
    }
    const context = contextByKey.get(`${row.section_id}::${row.subject_id}`);
    if (!context) {
      continue;
    }
    cells.push({
      entry: {
        id: row.id,
        sectionId: row.section_id,
        subjectId: row.subject_id,
        dayOfWeek: row.day_of_week as DayOfWeek,
        timeSlot: row.time_slot,
        periodId: row.period_id ?? null,
        spanPeriods: row.span_periods ?? 1,
        room: row.room,
        isTutorial: row.is_tutorial ?? false,
        specialActivity: (row.special_activity as SpecialActivity) ?? null,
      },
      sem: context.sem,
      section: context.section,
      subjectName: context.subjectName,
    });
  }
  return cells;
}
