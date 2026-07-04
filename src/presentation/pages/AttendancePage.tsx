import { useMemo } from 'react';
import AttendanceView, { type AttendanceOption, type AttendanceSectionOption, type RosterStudent } from '@presentation/views/AttendanceView';
import { createAttendanceAccess } from '@data/access/attendanceAccess';
import { createLocalDemoAttendanceAccess, isLocalDemoMode, listDemoRoster } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';

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
  const { selectedSection, subjects, selectedSubjectId } = useSelectedSection();
  const attendance = useMemo(
    () => (isLocalDemoMode() ? createLocalDemoAttendanceAccess(loadRoster) : supabaseAttendance),
    [],
  );

  // Section + subject both come from the global top-bar selectors — no per-page
  // pickers. Attendance is scoped to the one globally-selected subject.
  const sections: AttendanceSectionOption[] = selectedSection ? [selectedSection] : [];
  const scopedSubjects: AttendanceOption[] = useMemo(
    () => subjects.filter((s) => s.id === selectedSubjectId).map((s) => ({ id: s.id, name: s.name })),
    [subjects, selectedSubjectId],
  );

  return (
    <AttendanceView
      sections={sections}
      subjects={scopedSubjects}
      timeSlots={DEFAULT_TIME_SLOTS}
      loadRoster={loadRoster}
      attendance={attendance}
    />
  );
}
