import { useEffect, useMemo, useState } from 'react';
import TimetableView, { type SectionOption, type SubjectOption } from '@presentation/views/TimetableView';
import { createTimetableAccess } from '@data/access/timetableAccess';
import { createLocalDemoTimetableAccess, isLocalDemoMode } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';

const supabaseAccess = createTimetableAccess(supabase);

export default function TimetablePage() {
  const { selectedSection } = useSelectedSection();
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const access = useMemo(
    () => (isLocalDemoMode() ? createLocalDemoTimetableAccess(() => subjects) : supabaseAccess),
    [subjects],
  );

  // The globally-selected section is authoritative — no per-page picker.
  const sections: SectionOption[] = selectedSection ? [selectedSection] : [];

  useEffect(() => {
    if (!selectedSection?.semester) {
      setSubjects([]);
      return;
    }
    void (async () => {
      try {
        // Subjects are scoped to the selected section's semester.
        const subjectRows = await supabase
          .from('subjects')
          .select('id, name')
          .eq('semester', selectedSection.semester)
          .order('name');
        if (subjectRows.data) {
          setSubjects(subjectRows.data as SubjectOption[]);
        }
      } catch {
        // Subjects will remain empty; view handles empty state gracefully.
      }
    })();
  }, [selectedSection?.id, selectedSection?.semester]);

  return (
    <TimetableView
      key={selectedSection?.id ?? 'none'}
      access={access}
      sections={sections}
      subjects={subjects}
    />
  );
}
