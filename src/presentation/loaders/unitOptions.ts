/**
 * Unit options loader — reads the shared master syllabus units for a subject.
 *
 * After unification, units everywhere (Quiz, Assignment, ...) come from the
 * onboarding master `syllabus_units`, keyed to `syllabus_subjects` (the same id
 * the global Subject selector provides). This replaces the legacy `units` table
 * whose ids never matched the onboarding subjects.
 */

import { isLocalDemoMode } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';

export interface UnitOption {
  readonly id: string;
  readonly name: string;
  readonly subjectId: string;
}

interface UnitRow {
  id: string;
  name: string;
  subject_id: string;
  unit_no: number;
  sort_order: number;
}

function toOption(row: UnitRow): UnitOption {
  return { id: row.id, name: `Unit ${row.unit_no}: ${row.name}`, subjectId: row.subject_id };
}

/** Load the master units for a single subject (a syllabus_subjects id). */
export async function loadUnitsForSubject(subjectId: string | null | undefined): Promise<UnitOption[]> {
  if (!subjectId || isLocalDemoMode()) {
    return [];
  }
  const { data, error } = await supabase
    .from('syllabus_units')
    .select('id, name, subject_id, unit_no, sort_order')
    .eq('subject_id', subjectId)
    .order('sort_order', { ascending: true })
    .order('unit_no', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as UnitRow[]).map(toOption);
}

/** Load the master units for several subjects at once. */
export async function loadUnitsForSubjects(subjectIds: readonly string[]): Promise<UnitOption[]> {
  const ids = Array.from(new Set(subjectIds.filter(Boolean)));
  if (ids.length === 0 || isLocalDemoMode()) {
    return [];
  }
  const { data, error } = await supabase
    .from('syllabus_units')
    .select('id, name, subject_id, unit_no, sort_order')
    .in('subject_id', ids)
    .order('sort_order', { ascending: true })
    .order('unit_no', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as UnitRow[]).map(toOption);
}

/** Load the topic names for a single master unit (for AI quiz grounding). */
export async function loadTopicNamesForUnit(unitId: string | null | undefined): Promise<string[]> {
  if (!unitId || isLocalDemoMode()) {
    return [];
  }
  const { data, error } = await supabase
    .from('syllabus_topics')
    .select('name, sort_order')
    .eq('unit_id', unitId)
    .order('sort_order', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as Array<{ name: string }>).map((r) => r.name).filter((n) => n && n.length > 0);
}
