/**
 * Connected page wrapper for SyllabusTrackerView.
 * Wires Supabase-backed syllabusAccess and loads subjects from the database.
 */

import { useEffect, useState } from 'react';
import SyllabusTrackerView, { type SyllabusSubject } from '@presentation/views/SyllabusTrackerView';
import { createSyllabusAccess } from '@data/access/syllabusAccess';
import { supabase } from '@data/supabase';

const access = createSyllabusAccess(supabase);

export default function SyllabusTrackerPage() {
  const [subjects, setSubjects] = useState<SyllabusSubject[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.from('subjects').select('id, name').order('name');
        if (data) {
          setSubjects(data as SyllabusSubject[]);
        }
      } catch {
        // View handles empty state gracefully.
      }
    })();
  }, []);

  return <SyllabusTrackerView subjects={subjects} access={access} />;
}
