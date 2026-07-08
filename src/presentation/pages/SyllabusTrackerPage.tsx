import { useMemo } from 'react';
import SyllabusTrackerView, { type SyllabusSubject } from '@presentation/views/SyllabusTrackerView';
import {
  createSyllabusTrackerAccess,
  type SyllabusTrackerAccess,
} from '@data/access/syllabusTrackerAccess';
import { isLocalDemoMode } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';

// Demo mode has no Supabase-backed master curriculum; show an empty tracker.
const demoTrackerAccess: SyllabusTrackerAccess = {
  async listUnits() {
    return [];
  },
  async setTopicComplete() {
    /* no-op in demo */
  },
};

export default function SyllabusTrackerPage() {
  // Subject + section both come from the global top-bar selectors. Progress is
  // tracked per (teacher, section, topic) — see migration 0026 — so the tracker
  // must know which section is active, not just which subject.
  const { subjects, selectedSubjectId, selectedSectionId } = useSelectedSection();

  const access = useMemo<SyllabusTrackerAccess>(
    () => (isLocalDemoMode() ? demoTrackerAccess : createSyllabusTrackerAccess(supabase)),
    [],
  );

  const scopedSubjects: SyllabusSubject[] = useMemo(
    () => subjects.filter((s) => s.id === selectedSubjectId).map((s) => ({ id: s.id, name: s.name })),
    [subjects, selectedSubjectId],
  );

  return <SyllabusTrackerView subjects={scopedSubjects} sectionId={selectedSectionId} access={access} />;
}
