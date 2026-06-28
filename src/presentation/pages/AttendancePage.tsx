import { useEffect, useState } from 'react';
import AttendanceView, { type AttendanceOption, type RosterStudent } from '@presentation/views/AttendanceView';
import { createAttendanceAccess } from '@data/access/attendanceAccess';
import { supabase } from '@data/supabase';
import { useSelectedSemester, useSelectedSection, mapSemesterToDb } from '@presentation/hooks';

const attendance = createAttendanceAccess(supabase);

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
  const [sections, setSections] = useState<AttendanceOption[]>([]);
  const [subjects, setSubjects] = useState<AttendanceOption[]>([]);
  const semester = useSelectedSemester();
  const section = useSelectedSection();

  useEffect(() => {
    void (async () => {
      try {
        const dbSemester = mapSemesterToDb(semester);
        const semNum = dbSemester[0];
        const targetSectionName = `CS-${semNum}${section}`;

        // Fetch sections and filter for this specific section (e.g. CS-5A)
        const sectionRows = await supabase.from('sections').select('id, name').order('name');
        if (sectionRows.data) {
          const filteredSections = (sectionRows.data as AttendanceOption[]).filter(
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
