/**
 * Connected page wrapper for RosterView.
 * Wires the Supabase-backed rosterImportAccess and loads the teacher's sections
 * for the import target picker.
 */

import { useEffect, useState } from 'react';
import RosterView, { type RosterSectionOption } from '@presentation/views/RosterView';
import { createRosterImportAccess } from '@data/access/rosterImportAccess';
import { createSectionsAccess } from '@data/access/sectionsAccess';
import { supabase } from '@data/supabase';
import type { ParsedRosterRow } from '@domain/services/rosterImportService';

const access = createRosterImportAccess(supabase);
const sectionsAccess = createSectionsAccess(supabase);

const persistence = {
  importRoster(sectionId: string, rows: readonly ParsedRosterRow[]) {
    return access.replaceSection(sectionId, rows);
  },
};

export default function RosterPage() {
  const [sections, setSections] = useState<RosterSectionOption[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        setSections(await sectionsAccess.listSections());
      } catch {
        // Sections remain empty; the view handles the empty state gracefully.
      }
    })();
  }, []);

  return <RosterView persistence={persistence} sections={sections} />;
}
