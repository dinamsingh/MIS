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
  todaysClasses,
  type DayOfWeek,
  type TimetableEntry,
} from '../../domain/services/timetableService';
import { toTimetableEntry, type TimetableEntryRow } from './rows';
import { expectOk, unwrap, unwrapList } from './support';

export { todaysClasses };

/** Fields accepted when creating or editing a timetable entry. */
export interface TimetableEntryInput {
  readonly id?: string;
  readonly sectionId: string;
  readonly subjectId: string;
  readonly dayOfWeek: DayOfWeek;
  readonly timeSlot: string;
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
}

interface InsertedId {
  readonly id: string;
}

/** Create a {@link TimetableAccess} bound to the given Supabase client. */
export function createTimetableAccess(
  client: SupabaseClient = defaultClient,
): TimetableAccess {
  async function loadEntries(sectionId: string): Promise<TimetableEntry[]> {
    const rows = unwrapList(
      await client
        .from('timetable_entries')
        .select('id, section_id, subject_id, day_of_week, time_slot')
        .eq('section_id', sectionId)
        .order('time_slot', { ascending: true }),
    ) as TimetableEntryRow[];
    return rows.map(toTimetableEntry);
  }

  return {
    listEntries: loadEntries,

    async upsertEntry(input: TimetableEntryInput): Promise<string> {
      const row = {
        ...(input.id !== undefined ? { id: input.id } : {}),
        section_id: input.sectionId,
        subject_id: input.subjectId,
        day_of_week: input.dayOfWeek,
        time_slot: input.timeSlot,
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
  };
}
