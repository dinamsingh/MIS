/**
 * Syllabus Tracker data-access (shared master curriculum + per-teacher progress).
 *
 * Reads the SHARED master syllabus (`syllabus_units` + `syllabus_topics`, keyed
 * to `syllabus_subjects`) and overlays the CURRENT teacher's private progress
 * (`teacher_topic_progress`, RLS-scoped to auth.uid()). A topic is "complete"
 * for this teacher iff a progress row exists for it.
 *
 * Toggling completion inserts (taught) or deletes (not taught) the teacher's
 * own progress row — teacher_id defaults to auth.uid() server-side, so the
 * client never sends it.
 *
 * Independent of the legacy `subjects/units/topics` tables: subjectId here is a
 * `syllabus_subjects.id` (the same id the global Subject selector provides).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import { progressPercent, type Topic, type Unit } from '../../domain/services/syllabusService';

export { progressPercent };

/** Read-only master + per-teacher completion for the Syllabus Tracker. */
export interface SyllabusTrackerAccess {
  /** Load a subject's master units (each with topics + this teacher's ✓). */
  listUnits(subjectId: string): Promise<Unit[]>;
  /** Mark/unmark a topic as taught by the current teacher. */
  setTopicComplete(topicId: string, complete: boolean): Promise<void>;
}

interface UnitRow {
  id: string;
  unit_no: number;
  name: string;
  sort_order: number;
}

interface TopicRow {
  id: string;
  unit_id: string;
  name: string;
  sort_order: number;
}

/** Create a {@link SyllabusTrackerAccess} bound to the given Supabase client. */
export function createSyllabusTrackerAccess(
  client: SupabaseClient = defaultClient,
): SyllabusTrackerAccess {
  return {
    async listUnits(subjectId: string): Promise<Unit[]> {
      if (!subjectId) {
        return [];
      }

      const { data: unitData, error: unitError } = await client
        .from('syllabus_units')
        .select('id, unit_no, name, sort_order')
        .eq('subject_id', subjectId)
        .order('sort_order', { ascending: true })
        .order('unit_no', { ascending: true });
      if (unitError) {
        throw new Error(unitError.message);
      }
      const unitRows = (unitData ?? []) as UnitRow[];
      if (unitRows.length === 0) {
        return [];
      }

      const unitIds = unitRows.map((u) => u.id);

      const { data: topicData, error: topicError } = await client
        .from('syllabus_topics')
        .select('id, unit_id, name, sort_order')
        .in('unit_id', unitIds)
        .order('sort_order', { ascending: true });
      if (topicError) {
        throw new Error(topicError.message);
      }
      const topicRows = (topicData ?? []) as TopicRow[];

      // The teacher's own progress (RLS scopes this to auth.uid()).
      const topicIds = topicRows.map((t) => t.id);
      const taught = new Set<string>();
      if (topicIds.length > 0) {
        const { data: progressData, error: progressError } = await client
          .from('teacher_topic_progress')
          .select('topic_id')
          .in('topic_id', topicIds);
        if (progressError) {
          throw new Error(progressError.message);
        }
        for (const row of (progressData ?? []) as Array<{ topic_id: string }>) {
          taught.add(row.topic_id);
        }
      }

      return unitRows.map((unit) => {
        const topics: Topic[] = topicRows
          .filter((t) => t.unit_id === unit.id)
          .map((t) => ({ id: t.id, name: t.name, complete: taught.has(t.id) }));
        // Prefix the unit's number so each card clearly reads e.g.
        // "Unit 1: Numerical Methods - 1".
        return { id: unit.id, name: `Unit ${unit.unit_no}: ${unit.name}`, topics };
      });
    },

    async setTopicComplete(topicId: string, complete: boolean): Promise<void> {
      if (complete) {
        // teacher_id defaults to auth.uid(); ignore duplicate-insert conflicts.
        const { error } = await client
          .from('teacher_topic_progress')
          .upsert({ topic_id: topicId }, { onConflict: 'teacher_id,topic_id', ignoreDuplicates: true });
        if (error) {
          throw new Error(error.message);
        }
      } else {
        // RLS restricts the delete to the current teacher's own row.
        const { error } = await client
          .from('teacher_topic_progress')
          .delete()
          .eq('topic_id', topicId);
        if (error) {
          throw new Error(error.message);
        }
      }
    },
  };
}
