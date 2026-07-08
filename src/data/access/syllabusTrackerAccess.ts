/**
 * Syllabus Tracker data-access (shared master curriculum + per-teacher,
 * per-section progress).
 *
 * Reads the SHARED master syllabus (`syllabus_units` + `syllabus_topics`, keyed
 * to `syllabus_subjects`) and overlays the CURRENT teacher's private progress
 * for the currently-selected SECTION (`teacher_topic_progress`, RLS-scoped to
 * auth.uid(), keyed by (teacher_id, section_id, topic_id)). A topic is
 * "complete" for this teacher IN THIS SECTION iff a progress row exists for
 * that exact combination.
 *
 * Progress is deliberately section-scoped (migration 0026): a teacher teaching
 * the same subject to two sections (e.g. CSE-5A and CSE-5B) tracks each
 * section's syllabus completion independently — ticking a topic taught in one
 * section must NOT mark it taught in another.
 *
 * Toggling completion inserts (taught) or deletes (not taught) the teacher's
 * own progress row for the given section — teacher_id defaults to auth.uid()
 * server-side, so the client never sends it.
 *
 * Independent of the legacy `subjects/units/topics` tables: subjectId here is a
 * `syllabus_subjects.id` (the same id the global Subject selector provides).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import { progressPercent, type Topic, type Unit } from '../../domain/services/syllabusService';

export { progressPercent };

/** Read-only master + per-teacher, per-section completion for the Syllabus Tracker. */
export interface SyllabusTrackerAccess {
  /** Load a subject's master units for one section (each with topics + this teacher's ✓ in that section). */
  listUnits(subjectId: string, sectionId: string): Promise<Unit[]>;
  /** Mark/unmark a topic as taught by the current teacher, scoped to one section. */
  setTopicComplete(topicId: string, sectionId: string, complete: boolean): Promise<void>;
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
    async listUnits(subjectId: string, sectionId: string): Promise<Unit[]> {
      if (!subjectId || !sectionId) {
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

      // The teacher's own progress FOR THIS SECTION ONLY (RLS scopes rows to
      // auth.uid(); section_id further scopes them so another section's ✓
      // never leaks in).
      const topicIds = topicRows.map((t) => t.id);
      const taught = new Set<string>();
      if (topicIds.length > 0) {
        const { data: progressData, error: progressError } = await client
          .from('teacher_topic_progress')
          .select('topic_id')
          .eq('section_id', sectionId)
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

    async setTopicComplete(topicId: string, sectionId: string, complete: boolean): Promise<void> {
      if (complete) {
        // teacher_id defaults to auth.uid(); ignore duplicate-insert conflicts.
        const { error } = await client.from('teacher_topic_progress').upsert(
          { topic_id: topicId, section_id: sectionId },
          { onConflict: 'teacher_id,section_id,topic_id', ignoreDuplicates: true },
        );
        if (error) {
          throw new Error(error.message);
        }
      } else {
        // RLS restricts the delete to the current teacher's own rows; the
        // section_id filter ensures only THIS section's row is cleared.
        const { error } = await client
          .from('teacher_topic_progress')
          .delete()
          .eq('topic_id', topicId)
          .eq('section_id', sectionId);
        if (error) {
          throw new Error(error.message);
        }
      }
    },
  };
}
