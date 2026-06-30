import { useEffect, useState } from 'react';
import AttendanceView, { type AttendanceOption, type AttendanceSectionOption, type RosterStudent } from '@presentation/views/AttendanceView';
import { createAttendanceAccess } from '@data/access/attendanceAccess';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';

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
  const { selectedSection } = useSelectedSection();
  const [subjects, setSubjects] = useState<AttendanceOption[]>([]);

  // The globally-selected section is authoritative — no per-page picker.
  const sections: AttendanceSectionOption[] = selectedSection ? [selectedSection] : [];

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
          setSubjects(subjectRows.data as AttendanceOption[]);
        }
      } catch {
        // View handles empty arrays gracefully.
      }
    })();
  }, [selectedSection?.id, selectedSection?.semester]);

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
