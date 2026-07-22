/**
 * Database row shapes and the pure mappers that translate them to and from the
 * domain types (task 16.2).
 *
 * Keeping the row→domain (and domain→row) translation in small, exported, pure
 * functions means the correctness of the mapping can be unit-tested without any
 * network or live database, while the wrapper modules stay focused on issuing
 * parameterized queries. Column names mirror the schema in
 * `src/data/migrations/0001_init_schema.sql`.
 */

import type { RosterEntry } from '../../domain/services/rosterService';
import type {
  AttendanceMark,
  AttendanceStatus,
  AttendanceStatusMark,
  PeriodKey,
} from '../../domain/services/attendanceService';
import type { Topic, Unit } from '../../domain/services/syllabusService';
import type { MarkComponent, MarkValue } from '../../domain/services/marksService';
import type { TimetableEntry, DayOfWeek } from '../../domain/services/timetableService';
import type { LeaderboardWeights } from '../../domain/services/leaderboardService';
import type { SubmissionStatus } from '../../domain/shared/types';

// ---------------------------------------------------------------------------
// sections
// ---------------------------------------------------------------------------

/**
 * A class group the teacher works with. Beyond the bare `id`/`name`, a section
 * is described by its `batch`, `semester`, and `department` so one teacher can
 * organise multiple groups (e.g. CSE · 2024-2028 · 5th Semester · CSE-5A). The
 * descriptor columns were added in migration 0007 and are nullable, so older
 * rows that predate the migration surface them as `null`.
 */
export interface Section {
  readonly id: string;
  readonly name: string;
  readonly batch: string | null;
  readonly semester: string | null;
  readonly department: string | null;
}

/** A row of the `sections` table. */
export interface SectionRow {
  readonly id: string;
  readonly name: string;
  readonly batch: string | null;
  readonly semester: string | null;
  readonly department: string | null;
}

/** Map a section row to the domain {@link Section}, preserving null descriptors. */
export function toSection(row: SectionRow): Section {
  return {
    id: row.id,
    name: row.name,
    batch: row.batch,
    semester: row.semester,
    department: row.department,
  };
}

// ---------------------------------------------------------------------------
// student_roster
// ---------------------------------------------------------------------------

/** A row of the `student_roster` table. */
export interface StudentRosterRow {
  readonly id?: string;
  readonly enrollment_number: string;
  readonly email: string;
  readonly name: string | null;
}

/** Map a roster row to the domain {@link RosterEntry} (omitting a null name). */
export function toRosterEntry(row: StudentRosterRow): RosterEntry {
  return {
    enrollmentNumber: row.enrollment_number,
    email: row.email,
    ...(row.name !== null && row.name !== undefined ? { name: row.name } : {}),
  };
}

/** Map a domain {@link RosterEntry} to the columns persisted on `student_roster`. */
export function fromRosterEntry(entry: RosterEntry): StudentRosterRow {
  return {
    enrollment_number: entry.enrollmentNumber,
    email: entry.email,
    name: entry.name ?? null,
  };
}

// ---------------------------------------------------------------------------
// attendance
// ---------------------------------------------------------------------------

/** A row of the `attendance` table. */
export interface AttendanceRow {
  readonly student_id: string;
  readonly section_id: string;
  readonly subject_id: string;
  readonly date: string;
  readonly time_slot: string;
  readonly present: boolean;
  readonly status: AttendanceStatus;
}

/** Project an attendance row down to the domain {@link AttendanceMark}. */
export function toAttendanceMark(row: AttendanceRow): AttendanceMark {
  return { studentId: row.student_id, present: row.status === 'present' };
}

/** Build the full attendance row for upsert from a period key and a single mark. */
export function fromAttendanceMark(key: PeriodKey, mark: AttendanceMark): AttendanceRow {
  const status: AttendanceStatus = mark.present ? 'present' : 'absent';
  return {
    student_id: mark.studentId,
    section_id: key.sectionId,
    subject_id: key.subjectId,
    date: key.date,
    time_slot: key.timeSlot,
    present: mark.present,
    status,
  };
}

/** Project an attendance row to the full teacher-facing status mark. */
export function toAttendanceStatusMark(row: AttendanceRow): AttendanceStatusMark {
  return { studentId: row.student_id, status: row.status };
}

/** Build an attendance row with `present` kept in sync from authoritative `status`. */
export function fromAttendanceStatusMark(key: PeriodKey, mark: AttendanceStatusMark): AttendanceRow {
  return {
    student_id: mark.studentId,
    section_id: key.sectionId,
    subject_id: key.subjectId,
    date: key.date,
    time_slot: key.timeSlot,
    present: mark.status === 'present',
    status: mark.status,
  };
}

// ---------------------------------------------------------------------------
// units / topics
// ---------------------------------------------------------------------------

/** A row of the `topics` table. */
export interface TopicRow {
  readonly id: string;
  readonly unit_id: string;
  readonly name: string;
  readonly complete: boolean;
  readonly planned_date: string | null;
}

/** A row of the `units` table. */
export interface UnitRow {
  readonly id: string;
  readonly subject_id: string;
  readonly name: string;
  readonly planned_date: string | null;
}

/** Map a topic row to the domain {@link Topic}. */
export function toTopic(row: TopicRow): Topic {
  return { id: row.id, name: row.name, complete: row.complete };
}

/**
 * Map a unit row plus its topic rows to the domain {@link Unit}. Only the
 * topics belonging to the unit are attached.
 */
export function toUnit(row: UnitRow, topicRows: readonly TopicRow[]): Unit {
  return {
    id: row.id,
    name: row.name,
    topics: topicRows.filter((t) => t.unit_id === row.id).map(toTopic),
    ...(row.planned_date !== null ? { plannedDate: row.planned_date } : {}),
  };
}

// ---------------------------------------------------------------------------
// mark_components / mark_values
// ---------------------------------------------------------------------------

/** A row of the `mark_components` table. */
export interface MarkComponentRow {
  readonly id: string;
  readonly subject_id: string;
  readonly name: string;
  readonly max_value: number;
  readonly weightage: number;
}

/** A row of the `mark_values` table. */
export interface MarkValueRow {
  readonly student_id: string;
  readonly component_id: string;
  readonly value: number;
}

/** Map a mark-component row to the domain {@link MarkComponent}. */
export function toMarkComponent(row: MarkComponentRow): MarkComponent {
  return {
    id: row.id,
    name: row.name,
    maxValue: row.max_value,
    weightage: row.weightage,
  };
}

/** Map a mark-value row to the domain {@link MarkValue}. */
export function toMarkValue(row: MarkValueRow): MarkValue {
  return { componentId: row.component_id, value: row.value };
}

// ---------------------------------------------------------------------------
// timetable_entries
// ---------------------------------------------------------------------------

/** A row of the `timetable_entries` table (including Phase 4 columns). */
export interface TimetableEntryRow {
  readonly id: string;
  readonly section_id: string;
  readonly subject_id: string | null;
  readonly day_of_week: string;
  readonly time_slot: string;
  readonly period_id: string | null;
  readonly span_periods: number;
  readonly room: string | null;
  readonly is_tutorial: boolean;
  readonly special_activity: string | null;
}

/** Map a timetable row to the domain {@link TimetableEntry}. */
export function toTimetableEntry(row: TimetableEntryRow): TimetableEntry {
  return {
    id: row.id,
    sectionId: row.section_id,
    subjectId: row.subject_id ?? '',
    dayOfWeek: row.day_of_week as DayOfWeek,
    timeSlot: row.time_slot,
    periodId: row.period_id ?? null,
    spanPeriods: row.span_periods ?? 1,
    room: row.room ?? null,
    isTutorial: row.is_tutorial ?? false,
    specialActivity: (row.special_activity as TimetableEntry['specialActivity']) ?? null,
  };
}

// ---------------------------------------------------------------------------
// leaderboard_config
// ---------------------------------------------------------------------------

/** A row of the `leaderboard_config` table. */
export interface LeaderboardConfigRow {
  readonly enabled: boolean;
  readonly weight_internal: number;
  readonly weight_quiz: number;
  readonly weight_attendance: number;
}

/** Map a leaderboard-config row to the domain {@link LeaderboardWeights}. */
export function toLeaderboardWeights(row: LeaderboardConfigRow): LeaderboardWeights {
  return {
    internalMarks: row.weight_internal,
    quizScores: row.weight_quiz,
    attendance: row.weight_attendance,
  };
}

// ---------------------------------------------------------------------------
// assignment_submissions / lab_manual_submissions
// ---------------------------------------------------------------------------

/**
 * Normalize a persisted status string to the domain {@link SubmissionStatus}.
 * Any value other than the literal `'submitted'` (including a missing row)
 * collapses to `'not-submitted'`, matching the in-memory default.
 */
export function toSubmissionStatus(value: string | null | undefined): SubmissionStatus {
  return value === 'submitted' ? 'submitted' : 'not-submitted';
}
