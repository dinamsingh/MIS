import { useMemo } from 'react';
import TimetableView, { type SectionOption, type SubjectOption } from '@presentation/views/TimetableView';
import { createTimetableAccess } from '@data/access/timetableAccess';
import { createLocalDemoTimetableAccess, isLocalDemoMode } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';

const supabaseAccess = createTimetableAccess(supabase);

export default function TimetablePage() {
  // Section from the global selector. Timetable needs the FULL subject list
  // (it schedules many subjects into slots), so it uses all of the section's
  // subjects rather than the single globally-selected one.
  const { selectedSection, subjects: contextSubjects } = useSelectedSection();
  const subjects = useMemo<SubjectOption[]>(
    () => contextSubjects.map((s) => ({ id: s.id, name: s.name })),
    [contextSubjects],
  );
  const access = useMemo(
    () => (isLocalDemoMode() ? createLocalDemoTimetableAccess(() => subjects) : supabaseAccess),
    [subjects],
  );

  const sections: SectionOption[] = selectedSection ? [selectedSection] : [];

  return (
    <TimetableView
      key={selectedSection?.id ?? 'none'}
      access={access}
      sections={sections}
      subjects={subjects}
    />
  );
}
