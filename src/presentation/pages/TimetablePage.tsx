/**
 * Connected page wrapper for TimetableView.
 * Wires the Supabase-backed timetableAccess and provides empty-state defaults
 * for sections/subjects until runtime data is available.
 */

import { useEffect, useState } from 'react';
import TimetableView, { type SectionOption, type SubjectOption } from '@presentation/views/TimetableView';
import { createTimetableAccess } from '@data/access/timetableAccess';
import { supabase } from '@data/supabase';

const access = createTimetableAccess(supabase);

export default function TimetablePage() {
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const sectionRows = await supabase
          .from('sections')
          .select('id, name')
          .order('name');
        if (sectionRows.data) {
          setSections(sectionRows.data as SectionOption[]);
        }
        const subjectRows = await supabase
          .from('subjects')
          .select('id, name')
          .order('name');
        if (subjectRows.data) {
          setSubjects(subjectRows.data as SubjectOption[]);
        }
      } catch {
        // Sections/subjects will remain empty; view handles empty state gracefully.
      }
    })();
  }, []);

  return (
    <TimetableView
      access={access}
      sections={sections}
      subjects={subjects}
    />
  );
}
