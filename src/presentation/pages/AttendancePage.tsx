import { useEffect, useState } from 'react';
import AttendanceView, { type AttendanceOption, type AttendanceSectionOption, type RosterStudent } from '@presentation/views/AttendanceView';
import { createAttendanceAccess } from '@data/access/attendanceAccess';
import { createSectionsAccess } from '@data/access/sectionsAccess';
import { supabase } from '@data/supabase';
import { useSelectedSemester, useSelectedSection, mapSemesterToDb } from '@presentation/hooks';

const attendance = createAttendanceAccess(supabase);
const sectionsAccess = createSectionsAccess(supabase);

const DEFAULT_TIME_SLOTS = [
  '09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00', '14:00-15:00', '15:00-16:00', '16:00-17:00'
];

async function loadRoster(sectionId: string): Promise<RosterStudent[]> {
  // Query public.students table which actually contains section_id (unlike student_roster)
  const { data } = await supabase
    .from('students')
    .select('id, name, enrollment_number')
    .eq('section_id', sectionId)
    .order('name');
  if (!data) return [];
  return data.map((row: { id: string; name: string; enrollment_number?: string | null }) => ({
    id: row.id,
    name: row.name,
    enrollmentNumber: row.enrollment_number || undefined,
  }));
}

export default function AttendancePage() {
  const [sections, setSections] = useState<AttendanceSectionOption[]>([]);
  const [subjects, setSubjects] = useState<AttendanceOption[]>([]);
  const semester = useSelectedSemester();
  const section = useSelectedSection();

  useEffect(() => {
    void (async () => {
      try {
        const dbSemester = mapSemesterToDb(semester);
        const semNum = dbSemester[0];
        // Match the globally-selected section against the real section list
        // (e.g. selection "5" + "A" -> a name ending in "5A", matching both
        // legacy "CS-5A" and the imported "CSE-5A").
        const suffix = `${semNum}${section}`;

        const allSections = await sectionsAccess.listSections();
        setSections(allSections.filter((s) => s.name.endsWith(suffix)));

        // Subjects are scoped to the selected semester.
        const subjectRows = await supabase
          .from('subjects')
          .select('id, name')
          .eq('semester', dbSemester)
          .order('name');
        if (subjectRows.data) {
          setSubjects(subjectRows.data as AttendanceOption[]);
        }
      } catch {
        // View handles empty arrays gracefully.
      }
    })();
  }, [semester, section]);

  return (
    <AttendanceView
      sections={sections}
      subjects={subjects}
      timeSlots={DEFAULT_TIME_SLOTS}
      loadRoster={loadRoster}
      attendance={attendance}
    />
  );
}
