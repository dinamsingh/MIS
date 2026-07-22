/**
 * Timetable data-access wrapper (task 16.2).
 *
 * Binds the pure `timetableService` to the `timetable_entries` table: weekly
 * grid CRUD is parameterized reads/writes, and the Dashboard's "today's
 * classes" is derived with the re-exported pure `todaysClasses` from the loaded
 * entries (Requirements 14.1, 14.3).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import {
  sectionIdsForSubject,
  spannedPeriodIds,
  todaysClasses,
  type DayOfWeek,
  type TimetableEntry,
  type SpecialActivity,
} from '../../domain/services/timetableService';
import { toTimetableEntry, type TimetableEntryRow } from './rows';
import { expectOk, unwrap, unwrapList } from './support';

export { todaysClasses };

/** A period from the fixed college-wide Period_Catalog (migration 0049). */
export interface PeriodOption {
  readonly id: string;
  readonly label: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly dayType: 'weekday' | 'saturday';
  readonly sortOrder: number;
}

/** Result of resolving confirmed periods for a teacher's section+subject+day. */
export type ConfirmedPeriodsResult =
  | { kind: 'not-confirmed' }
  | { kind: 'confirmed'; periods: PeriodOption[] };

/** Conflict detail surfaced when `confirm_timetable` is denied due to overlap. */
export interface ConflictDetail {
  readonly day: string;
  readonly period: string;
  readonly sectionId: string;
  readonly subjectId: string;
}

/** Result of the `confirm_timetable` RPC call. */
export type ConfirmResult =
  | { status: 'confirmed'; sectionId: string }
  | { status: 'denied'; reason: 'conflict'; conflictingDay: string; entryA: ConflictDetail; entryB: ConflictDetail }
  | { status: 'denied'; reason: string };

/** Result of the `unlock_timetable` RPC call. */
export type UnlockResult =
  | { status: 'unlocked'; sectionId: string }
  | { status: 'already-draft'; sectionId: string }
  | { status: 'denied'; reason: string };

/** Fields accepted when creating or editing a timetable entry. */
export interface TimetableEntryInput {
  readonly id?: string;
  readonly sectionId: string;
  readonly subjectId?: string;
  readonly dayOfWeek: DayOfWeek;
  readonly timeSlot: string;
  /** FK → periods.id (required for new/edited entries per Requirement 13.4). */
  readonly periodId?: string;
  /** Number of consecutive periods this entry spans (default 1). */
  readonly spanPeriods?: number;
  /** Optional room/location. */
  readonly room?: string;
  /** Whether this is a tutorial session. */
  readonly isTutorial?: boolean;
  /** Optional special non-subject activity (replaces subject when set). */
  readonly specialActivity?: SpecialActivity | null;
}

/** Supabase-backed timetable operations. */
export interface TimetableAccess {
  /** Load a section's weekly timetable entries (Requirement 14.1). */
  listEntries(sectionId: string): Promise<TimetableEntry[]>;
  /** Create or update a timetable entry, returning its id. */
  upsertEntry(input: TimetableEntryInput): Promise<string>;
  /** Delete a timetable entry. */
  deleteEntry(entryId: string): Promise<void>;
  /** Derive a section's classes for the given day of week (Requirement 14.3). */
  todaysClasses(sectionId: string, day: DayOfWeek): Promise<TimetableEntry[]>;
  /**
   * Resolve the distinct sections that are taught a given subject (shared
   * materials model). Assignments, quizzes, and study material are scoped by
   * subject/unit, so this is the set of sections that share them.
   */
  listSectionIdsForSubject(subjectId: string): Promise<string[]>;
  /** Load the fixed college-wide Period catalog (Requirement 13.4). */
  listPeriods(): Promise<PeriodOption[]>;
  /**
   * Resolve confirmed periods for a teacher's section + subject + day.
   *
   * Two-step status-first resolution: reads `section_timetable_status` for
   * `(teacherId, sectionId)` — absent row or `status = 'draft'` returns
   * `{kind:'not-confirmed'}`; `status = 'confirmed'` queries `timetable_entries`
   * filtered to the exact section+subject+day, expands multi-period spans via
   * `spannedPeriodIds`, and returns `{kind:'confirmed', periods: PeriodOption[]}`
   * where `periods` may legitimately be `[]`.
   *
   * Requirements validated: 19.1, 19.2, 19.3, 19.4, 19.5
   */
  resolveConfirmedPeriods(
    teacherId: string,
    sectionId: string,
    subjectId: string,
    dayOfWeek: DayOfWeek,
  ): Promise<ConfirmedPeriodsResult>;

  /**
   * Confirm the teacher's timetable for a section. Runs the cross-batch
   * conflict check first; transitions to 'confirmed' only if no conflicts
   * found, otherwise returns the conflict details (Requirements 16.4, 18.1-18.4).
   */
  confirmTimetable(sectionId: string): Promise<ConfirmResult>;

  /**
   * Unlock a confirmed section's timetable, transitioning the whole section
   * back to 'draft' (Requirement 16.6).
   */
  unlockTimetable(sectionId: string): Promise<UnlockResult>;

  /**
   * Get the current timetable status for the calling teacher's section.
   * Returns 'draft' when no row exists or status is draft, 'confirmed' otherwise.
   */
  getTimetableStatus(sectionId: string): Promise<'draft' | 'confirmed'>;
}

interface InsertedId {
  readonly id: string;
}

/** Row shape returned by the periods table query. */
interface PeriodRow {
  readonly id: string;
  readonly label: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly day_type: string;
  readonly sort_order: number;
}

/** Create a {@link TimetableAccess} bound to the given Supabase client. */
export function createTimetableAccess(
  client: SupabaseClient = defaultClient,
): TimetableAccess {
  async function loadEntries(sectionId: string): Promise<TimetableEntry[]> {
    const rows = unwrapList(
      await client
        .from('timetable_entries')
        .select('id, section_id, subject_id, day_of_week, time_slot, period_id, span_periods, room, is_tutorial, special_activity')
        .eq('section_id', sectionId)
        .order('time_slot', { ascending: true }),
    ) as TimetableEntryRow[];
    return rows.map(toTimetableEntry);
  }

  return {
    listEntries: loadEntries,

    async upsertEntry(input: TimetableEntryInput): Promise<string> {
      const row: Record<string, unknown> = {
        ...(input.id !== undefined ? { id: input.id } : {}),
        section_id: input.sectionId,
        subject_id: input.subjectId ?? null,
        day_of_week: input.dayOfWeek,
        time_slot: input.timeSlot,
        period_id: input.periodId ?? null,
        span_periods: input.spanPeriods ?? 1,
        room: input.room ?? null,
        is_tutorial: input.isTutorial ?? false,
        special_activity: input.specialActivity ?? null,
      };
      const inserted = unwrap(
        await client.from('timetable_entries').upsert(row).select('id').single(),
      ) as InsertedId | null;
      return inserted?.id ?? input.id ?? '';
    },

    async deleteEntry(entryId: string): Promise<void> {
      expectOk(await client.from('timetable_entries').delete().eq('id', entryId));
    },

    async todaysClasses(sectionId: string, day: DayOfWeek): Promise<TimetableEntry[]> {
      return todaysClasses(await loadEntries(sectionId), day);
    },

    async listSectionIdsForSubject(subjectId: string): Promise<string[]> {
      const rows = unwrapList(
        await client
          .from('timetable_entries')
          .select('id, section_id, subject_id, day_of_week, time_slot, period_id, span_periods, room, is_tutorial, special_activity')
          .eq('subject_id', subjectId)
          .order('time_slot', { ascending: true }),
      ) as TimetableEntryRow[];
      // Reuse the pure derivation so the distinct/ordering rule lives in one place.
      return sectionIdsForSubject(rows.map(toTimetableEntry), subjectId);
    },

    async listPeriods(): Promise<PeriodOption[]> {
      const rows = unwrapList(
        await client
          .from('periods')
          .select('id, label, start_time, end_time, day_type, sort_order')
          .order('sort_order', { ascending: true }),
      ) as PeriodRow[];
      return rows.map((r) => ({
        id: r.id,
        label: r.label,
        startTime: r.start_time,
        endTime: r.end_time,
        dayType: r.day_type as 'weekday' | 'saturday',
        sortOrder: r.sort_order,
      }));
    },

    async resolveConfirmedPeriods(
      teacherId: string,
      sectionId: string,
      subjectId: string,
      dayOfWeek: DayOfWeek,
    ): Promise<ConfirmedPeriodsResult> {
      // Step 1: read section_timetable_status for (teacherId, sectionId).
      // Absent row or status = 'draft' → not-confirmed.
      const statusRow = unwrap(
        await client
          .from('section_timetable_status')
          .select('status')
          .eq('teacher_id', teacherId)
          .eq('section_id', sectionId)
          .maybeSingle(),
      ) as { status: string } | null;

      if (!statusRow || statusRow.status !== 'confirmed') {
        return { kind: 'not-confirmed' };
      }

      // Step 2: status is 'confirmed' — query timetable_entries filtered to
      // the exact section + subject + day.
      const entryRows = unwrapList(
        await client
          .from('timetable_entries')
          .select('id, section_id, subject_id, day_of_week, time_slot, period_id, span_periods, room, is_tutorial, special_activity')
          .eq('section_id', sectionId)
          .eq('subject_id', subjectId)
          .eq('day_of_week', dayOfWeek)
          .order('time_slot', { ascending: true }),
      ) as TimetableEntryRow[];
      const entries = entryRows.map(toTimetableEntry);

      // Load the period catalog so we can expand multi-period spans.
      const catalogRows = unwrapList(
        await client
          .from('periods')
          .select('id, label, start_time, end_time, day_type, sort_order')
          .order('sort_order', { ascending: true }),
      ) as PeriodRow[];

      const catalog = catalogRows.map((r) => ({
        id: r.id,
        label: r.label,
        startTime: r.start_time,
        endTime: r.end_time,
        dayType: r.day_type as 'weekday' | 'saturday',
        sortOrder: r.sort_order,
      }));

      // Expand each entry's periodId + spanPeriods into the full set of period
      // ids it occupies, then resolve those ids to PeriodOption objects.
      const seenIds = new Set<string>();
      const periods: PeriodOption[] = [];

      for (const entry of entries) {
        if (!entry.periodId) continue;
        const ids = spannedPeriodIds(
          { periodId: entry.periodId, spanPeriods: entry.spanPeriods },
          catalogRows.map((r) => ({ id: r.id, sortOrder: r.sort_order, dayType: r.day_type })),
        );
        for (const pid of ids) {
          if (!seenIds.has(pid)) {
            seenIds.add(pid);
            const period = catalog.find((p) => p.id === pid);
            if (period) periods.push(period);
          }
        }
      }

      return { kind: 'confirmed', periods };
    },

    async confirmTimetable(sectionId: string): Promise<ConfirmResult> {
      const { data, error } = await client.rpc('confirm_timetable', {
        p_section_id: sectionId,
      });
      if (error) {
        return { status: 'denied', reason: error.message };
      }
      const result = data as Record<string, unknown>;
      if (result.status === 'confirmed') {
        return { status: 'confirmed', sectionId: result.sectionId as string };
      }
      if (result.status === 'denied' && result.reason === 'conflict') {
        const entryA = result.entryA as Record<string, unknown>;
        const entryB = result.entryB as Record<string, unknown>;
        return {
          status: 'denied',
          reason: 'conflict',
          conflictingDay: result.conflictingDay as string,
          entryA: {
            day: result.conflictingDay as string,
            period: entryA.period as string,
            sectionId: entryA.sectionId as string,
            subjectId: entryA.subjectId as string,
          },
          entryB: {
            day: result.conflictingDay as string,
            period: entryB.period as string,
            sectionId: entryB.sectionId as string,
            subjectId: entryB.subjectId as string,
          },
        };
      }
      return { status: 'denied', reason: (result.reason as string) ?? 'unknown' };
    },

    async unlockTimetable(sectionId: string): Promise<UnlockResult> {
      const { data, error } = await client.rpc('unlock_timetable', {
        p_section_id: sectionId,
      });
      if (error) {
        return { status: 'denied', reason: error.message };
      }
      const result = data as Record<string, unknown>;
      if (result.status === 'unlocked') {
        return { status: 'unlocked', sectionId: result.sectionId as string };
      }
      if (result.status === 'already-draft') {
        return { status: 'already-draft', sectionId: result.sectionId as string };
      }
      return { status: 'denied', reason: (result.reason as string) ?? 'unknown' };
    },

    async getTimetableStatus(sectionId: string): Promise<'draft' | 'confirmed'> {
      const { data } = await client
        .from('section_timetable_status')
        .select('status')
        .eq('teacher_id', (await client.auth.getUser()).data.user?.id ?? '')
        .eq('section_id', sectionId)
        .maybeSingle();
      if (!data || (data as { status: string }).status !== 'confirmed') {
        return 'draft';
      }
      return 'confirmed';
    },
  };
}
