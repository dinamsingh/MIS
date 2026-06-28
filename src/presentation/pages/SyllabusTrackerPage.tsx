import { useEffect, useState } from 'react';
import SyllabusTrackerView, { type SyllabusSubject } from '@presentation/views/SyllabusTrackerView';
import { createSyllabusAccess } from '@data/access/syllabusAccess';
import { supabase } from '@data/supabase';
import { useSelectedSemester, mapSemesterToDb } from '@presentation/hooks';

const access = createSyllabusAccess(supabase);

export default function SyllabusTrackerPage() {
  const [subjects, setSubjects] = useState<SyllabusSubject[]>([]);
  const semester = useSelectedSemester();

  useEffect(() => {
    void (async () => {
      try {
        const dbSemester = mapSemesterToDb(semester);
        const { data } = await supabase
          .from('subjects')
          .select('id, name')
          .eq('semester', dbSemester)
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
