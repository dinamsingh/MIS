/**
 * Connected page wrapper for RosterView.
 * Wires the Supabase-backed rosterImportAccess and loads the teacher's sections
 * for the import target picker, plus fetching the current roster.
 */

import RosterView, { type RosterSectionOption, type RosterStudent } from '@presentation/views/RosterView';
import { createRosterImportAccess } from '@data/access/rosterImportAccess';
import { isLocalDemoMode, replaceDemoRoster, listDemoRoster } from '@data/demo/localDemoMode';
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

async function loadRoster(sectionId: string): Promise<RosterStudent[]> {
  if (isLocalDemoMode()) {
    const localRoster = listDemoRoster(sectionId);
    if (localRoster.length > 0) {
      return localRoster.map((student) => ({
        id: student.id,
        name: student.name,
        enrollmentNumber: student.enrollmentNumber,
      }));
    }
  }

  const { data } = await supabase
    .from('students')
    .select('id, name, enrollment_number')
    .eq('section_id', sectionId)
    .order('name');

  if (!data) return [];

  return data.map((row: { id: string; name: string; enrollment_number?: string | null }) => ({
    id: row.id,
    name: row.name,
    enrollmentNumber: row.enrollment_number || undefined,
  }));
}

export default function RosterPage() {
  const { selectedSection } = useSelectedSection();
  const sections = selectedSection ? [selectedSection] : [];

  return <RosterView persistence={persistence} sections={sections as RosterSectionOption[]} loadRoster={loadRoster} />;
}
