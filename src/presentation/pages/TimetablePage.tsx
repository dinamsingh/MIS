import { useEffect, useState } from 'react';
import TimetableView, { type SectionOption, type SubjectOption } from '@presentation/views/TimetableView';
import { createTimetableAccess } from '@data/access/timetableAccess';
import { createSectionsAccess } from '@data/access/sectionsAccess';
import { supabase } from '@data/supabase';
import { useSelectedSemester, useSelectedSection, mapSemesterToDb } from '@presentation/hooks';

const access = createTimetableAccess(supabase);
const sectionsAccess = createSectionsAccess(supabase);

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
        const suffix = `${semNum}${section}`;

        // Real section list (with batch/semester/department labels), narrowed
        // to the globally-selected section.
        const allSections = await sectionsAccess.listSections();
        setSections(allSections.filter((s) => s.name.endsWith(suffix)));

        // Subjects are scoped to the selected semester.
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
