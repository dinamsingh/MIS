import { useEffect, useState } from 'react';
import SyllabusTrackerView, { type SyllabusSubject } from '@presentation/views/SyllabusTrackerView';
import { createSyllabusAccess } from '@data/access/syllabusAccess';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';

const access = createSyllabusAccess(supabase);

export default function SyllabusTrackerPage() {
  const { selectedSection } = useSelectedSection();
  const [subjects, setSubjects] = useState<SyllabusSubject[]>([]);

  const semester = selectedSection?.semester ?? null;

  useEffect(() => {
    if (!semester) {
      setSubjects([]);
      return;
    }
    void (async () => {
      try {
        const { data } = await supabase
          .from('subjects')
          .select('id, name')
          .eq('semester', semester)
          .order('name');
        if (data) {
          setSubjects(data as SyllabusSubject[]);
        }
      } catch {
        // View handles empty state gracefully.
      }
    })();
  }, [semester]);

  return <SyllabusTrackerView subjects={subjects} access={access} />;
}
