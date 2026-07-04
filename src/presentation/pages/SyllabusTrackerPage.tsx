import { useMemo } from 'react';
import SyllabusTrackerView, { type SyllabusSubject } from '@presentation/views/SyllabusTrackerView';
import { createSyllabusAccess } from '@data/access/syllabusAccess';
import { createLocalDemoSyllabusAccess, isLocalDemoMode } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';

const supabaseAccess = createSyllabusAccess(supabase);

export default function SyllabusTrackerPage() {
  // Subject comes from the global top-bar selector.
  const { subjects, selectedSubjectId } = useSelectedSection();
  const access = useMemo(
    () => (isLocalDemoMode() ? createLocalDemoSyllabusAccess() : supabaseAccess),
    [],
  );

  const scopedSubjects: SyllabusSubject[] = useMemo(
    () => subjects.filter((s) => s.id === selectedSubjectId).map((s) => ({ id: s.id, name: s.name })),
    [subjects, selectedSubjectId],
  );

  return <SyllabusTrackerView subjects={scopedSubjects} access={access} />;
}
