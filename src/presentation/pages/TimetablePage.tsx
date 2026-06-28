import { useEffect, useState } from 'react';
import TimetableView, { type SectionOption, type SubjectOption } from '@presentation/views/TimetableView';
import { createTimetableAccess } from '@data/access/timetableAccess';
import { supabase } from '@data/supabase';
import { useSelectedSemester, useSelectedSection, mapSemesterToDb } from '@presentation/hooks';

const access = createTimetableAccess(supabase);

export default function TimetablePage() {
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const semester = useSelectedSemester();
  const section = useSelectedSection();

  useEffect(() => {
    void (async () => {
      try {
        const dbSemester = mapSemesterToDb(semester);
        const semNum = dbSemester[0];
        const targetSectionName = `CS-${semNum}${section}`;

        // Fetch sections filtered by semester and section suffix (e.g. CS-5A)
        const sectionRows = await supabase
          .from('sections')
          .select('id, name')
          .order('name');
        if (sectionRows.data) {
          const filteredSections = (sectionRows.data as SectionOption[]).filter(
            (sec) => sec.name === targetSectionName
          );
          setSections(filteredSections);
        }

        // Fetch subjects filtered by semester
        const subjectRows = await supabase
          .from('subjects')
          .select('id, name')
          .eq('semester', dbSemester)
          .order('name');
        if (subjectRows.data) {
          setSubjects(subjectRows.data as SubjectOption[]);
        }
      } catch {
        // Sections/subjects will remain empty; view handles empty state gracefully.
      }
    })();
  }, [semester, section]);

  return (
    <TimetableView
      key={`${semester}-${section}`}
      access={access}
      sections={sections}
      subjects={subjects}
    />
  );
}
