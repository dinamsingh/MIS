/**
 * Connected page wrapper for RosterView.
 * Wires the Supabase-backed rosterImportAccess and loads the teacher's sections
 * for the import target picker.
 */

import RosterView, { type RosterSectionOption } from '@presentation/views/RosterView';
import { createRosterImportAccess } from '@data/access/rosterImportAccess';
import { isLocalDemoMode, replaceDemoRoster } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { clearCache } from '@presentation/hooks';
import type { ParsedRosterRow } from '@domain/services/rosterImportService';

const access = createRosterImportAccess(supabase);

const persistence = {
  async importRoster(sectionId: string, rows: readonly ParsedRosterRow[]) {
    try {
      if (isLocalDemoMode()) {
        return replaceDemoRoster(sectionId, rows);
      }
      return await access.replaceSection(sectionId, rows);
    } finally {
      clearCache();
    }
  },
};

export default function RosterPage() {
  const { selectedSection } = useSelectedSection();
  const sections = selectedSection ? [selectedSection] : [];

  return <RosterView persistence={persistence} sections={sections as RosterSectionOption[]} />;
}
