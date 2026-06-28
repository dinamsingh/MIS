/**
 * Sections data-access wrapper (Batch / Semester / Section model wiring).
 *
 * Binds the `sections` table to the domain {@link Section} type so the
 * section-selection surfaces (Attendance, Timetable, Heatmap, Roster import)
 * can offer the richer batch / semester / department descriptors added in
 * migration 0007 instead of a bare name. Reads go through the parameterized
 * Supabase query builder (`.from().select().order()`), never ad-hoc SQL
 * (Requirement 17.4).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import { toSection, type Section, type SectionRow } from './rows';
import { unwrapList } from './support';

/** Supabase-backed section operations. */
export interface SectionsAccess {
  /**
   * List every section the teacher can work with, ordered by department, then
   * batch, then semester, then name so related class groups sit together in the
   * selectors.
   */
  listSections(): Promise<Section[]>;
}

/** Create a {@link SectionsAccess} bound to the given Supabase client. */
export function createSectionsAccess(
  client: SupabaseClient = defaultClient,
): SectionsAccess {
  return {
    async listSections(): Promise<Section[]> {
      const rows = unwrapList(
        await client
          .from('sections')
          .select('id, name, batch, semester, department')
          .order('department', { ascending: true })
          .order('batch', { ascending: true })
          .order('semester', { ascending: true })
          .order('name', { ascending: true }),
      ) as SectionRow[];
      return rows.map(toSection);
    },
  };
}
