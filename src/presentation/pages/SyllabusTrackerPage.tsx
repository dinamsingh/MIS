import { useEffect, useMemo, useState } from 'react';
import SyllabusTrackerView, { type SyllabusSubject } from '@presentation/views/SyllabusTrackerView';
import { createSyllabusAccess } from '@data/access/syllabusAccess';
import { createLocalDemoSyllabusAccess, isLocalDemoMode } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { loadSubjectOptionsForSection } from '@presentation/loaders/subjectOptions';

const supabaseAccess = createSyllabusAccess(supabase);

export default function SyllabusTrackerPage() {
  const { selectedSection } = useSelectedSection();
  const [subjects, setSubjects] = useState<SyllabusSubject[]>([]);
  const access = useMemo(
    () => (isLocalDemoMode() ? createLocalDemoSyllabusAccess() : supabaseAccess),
    [],
  );

  const semester = selectedSection?.semester ?? null;

  useEffect(() => {
    if (!semester) {
      setSubjects([]);
      return;
    }
    setSubjects([]);
    void (async () => {
      try {
        setSubjects(await loadSubjectOptionsForSection(selectedSection));
      } catch {
        // View handles empty state gracefully.
      }
    })();
  }, [semester, selectedSection]);

  return <SyllabusTrackerView subjects={subjects} access={access} />;
}
