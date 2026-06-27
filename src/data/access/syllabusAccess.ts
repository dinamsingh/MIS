/**
 * Syllabus data-access wrapper (task 16.2).
 *
 * Binds the pure `syllabusService` to the `units` and `topics` tables: units
 * and topics CRUD, planned-date persistence, and completion toggles are
 * parameterized writes (Requirements 6.1–6.4), while progress percentage and
 * schedule status are computed by the re-exported pure functions so the tracker
 * math lives in one place (Requirements 6.5, 6.6).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import {
  progressPercent,
  scheduleStatus,
  type Topic,
  type Unit,
} from '../../domain/services/syllabusService';
import { toUnit, type TopicRow, type UnitRow } from './rows';
import { expectOk, unwrap, unwrapList } from './support';

export { progressPercent, scheduleStatus };

/** Fields accepted when creating or editing a unit. */
export interface UnitInput {
  readonly id?: string;
  readonly subjectId: string;
  readonly name: string;
  readonly plannedDate?: string | null;
}

/** Fields accepted when creating or editing a topic. */
export interface TopicInput {
  readonly id?: string;
  readonly unitId: string;
  readonly name: string;
  readonly complete?: boolean;
  readonly plannedDate?: string | null;
}

/** Supabase-backed syllabus operations. */
export interface SyllabusAccess {
  /** Load a subject's units, each with its topics (Requirement 6.1). */
  listUnits(subjectId: string): Promise<Unit[]>;
  /** Create or update a unit, returning its id (Requirements 6.2, 6.3). */
  upsertUnit(input: UnitInput): Promise<string>;
  /** Delete a unit (cascades to its topics). */
  deleteUnit(unitId: string): Promise<void>;
  /** Create or update a topic, returning its id (Requirements 6.2, 6.3). */
  upsertTopic(input: TopicInput): Promise<string>;
  /** Delete a topic. */
  deleteTopic(topicId: string): Promise<void>;
  /** Persist a topic's completion state (Requirement 6.4). */
  setTopicComplete(topicId: string, complete: boolean): Promise<void>;
}

interface InsertedId {
  readonly id: string;
}

/** Create a {@link SyllabusAccess} bound to the given Supabase client. */
export function createSyllabusAccess(
  client: SupabaseClient = defaultClient,
): SyllabusAccess {
  return {
    async listUnits(subjectId: string): Promise<Unit[]> {
      const unitRows = unwrapList(
        await client
          .from('units')
          .select('id, subject_id, name, planned_date')
          .eq('subject_id', subjectId)
          .order('name', { ascending: true }),
      ) as UnitRow[];

      if (unitRows.length === 0) {
        return [];
      }

      const topicRows = unwrapList(
        await client
          .from('topics')
          .select('id, unit_id, name, complete, planned_date')
          .in(
            'unit_id',
            unitRows.map((u) => u.id),
          )
          .order('name', { ascending: true }),
      ) as TopicRow[];

      return unitRows.map((unit) => toUnit(unit, topicRows));
    },

    async upsertUnit(input: UnitInput): Promise<string> {
      const row = {
        ...(input.id !== undefined ? { id: input.id } : {}),
        subject_id: input.subjectId,
        name: input.name,
        planned_date: input.plannedDate ?? null,
      };
      const inserted = unwrap(
        await client.from('units').upsert(row).select('id').single(),
      ) as InsertedId | null;
      return inserted?.id ?? input.id ?? '';
    },

    async deleteUnit(unitId: string): Promise<void> {
      expectOk(await client.from('units').delete().eq('id', unitId));
    },

    async upsertTopic(input: TopicInput): Promise<string> {
      const row = {
        ...(input.id !== undefined ? { id: input.id } : {}),
        unit_id: input.unitId,
        name: input.name,
        complete: input.complete ?? false,
        planned_date: input.plannedDate ?? null,
      };
      const inserted = unwrap(
        await client.from('topics').upsert(row).select('id').single(),
      ) as InsertedId | null;
      return inserted?.id ?? input.id ?? '';
    },

    async deleteTopic(topicId: string): Promise<void> {
      expectOk(await client.from('topics').delete().eq('id', topicId));
    },

    async setTopicComplete(topicId: string, complete: boolean): Promise<void> {
      expectOk(
        await client.from('topics').update({ complete }).eq('id', topicId),
      );
    },
  };
}

/**
 * Convenience: compute the progress percentage across an arbitrary set of
 * topics (a unit's or a whole subject's), reusing the pure domain function.
 */
export function unitProgress(topics: Topic[]): number {
  return progressPercent(topics);
}
