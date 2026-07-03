import { useEffect, useMemo, useState } from 'react';
import AttendanceView, { type AttendanceOption, type AttendanceSectionOption, type RosterStudent } from '@presentation/views/AttendanceView';
import { createAttendanceAccess } from '@data/access/attendanceAccess';
import { createLocalDemoAttendanceAccess, isLocalDemoMode, listDemoRoster } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { loadSubjectOptionsForSection } from '@presentation/loaders/subjectOptions';

const supabaseAttendance = createAttendanceAccess(supabase);

const DEFAULT_TIME_SLOTS = [
  '09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00', '14:00-15:00', '15:00-16:00', '16:00-17:00'
];

async function loadRoster(sectionId: string): Promise<RosterStudent[]> {
  if (isLocalDemoMode()) {
    const localRoster = listDemoRoster(sectionId);
    if (localRoster.length > 0) {
      return localRoster.map((student) => ({
        id: student.id,
        name: student.name,
        enrollmentNumber: student.enrollmentNumber,
      }));
    }
  }

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
  const attendance = useMemo(
    () => (isLocalDemoMode() ? createLocalDemoAttendanceAccess(loadRoster) : supabaseAttendance),
    [],
  );

  // The globally-selected section is authoritative — no per-page picker.
  const sections: AttendanceSectionOption[] = selectedSection ? [selectedSection] : [];

  useEffect(() => {
    if (!selectedSection?.semester) {
      setSubjects([]);
      return;
    }
    setSubjects([]);
    void (async () => {
      try {
        setSubjects(await loadSubjectOptionsForSection(selectedSection));
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
