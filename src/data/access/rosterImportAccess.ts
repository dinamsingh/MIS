/** Atomic, additive CSV roster import. Identity and history stay in PostgreSQL. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import type { ParsedRosterRow } from '../../domain/services/rosterImportService';
import { unwrap } from './support';

export interface RosterImportSummary {
  readonly deleted: number;
  readonly imported: number;
  readonly inserted?: number;
  readonly updated?: number;
  readonly unchanged?: number;
}

export interface RosterImportAccess {
  /** Compatibility name; now adds/updates only and never deletes absent rows. */
  replaceSection(sectionId: string, rows: readonly ParsedRosterRow[]): Promise<RosterImportSummary>;
}

export function createRosterImportAccess(client: SupabaseClient = defaultClient): RosterImportAccess {
  return {
    async replaceSection(sectionId, rows) {
      return unwrap(await client.rpc('import_section_roster', {
        p_section_id: sectionId,
        p_rows: rows.map(row => ({
          enrollment_number: row.enrollmentNumber, name: row.name, email: row.email,
        })),
      })) as RosterImportSummary;
    },
  };
}
