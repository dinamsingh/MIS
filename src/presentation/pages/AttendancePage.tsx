/**
 * Connected page wrapper for AttendanceView.
 * Wires Supabase-backed attendanceAccess and loads sections/subjects/timeSlots
 * from the database at mount.
 */

import { useEffect, useState } from 'react';
import AttendanceView, { type AttendanceOption, type RosterStudent } from '@presentation/views/AttendanceView';
import { createAttendanceAccess } from '@data/access/attendanceAccess';
import { supabase } from '@data/supabase';

const attendance = createAttendanceAccess(supabase);

const DEFAULT_TIME_SLOTS = [
  '09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00',
];

async function loadRoster(sectionId: string): Promise<RosterStudent[]> {
  const { data } = await supabase
    .from('student_roster')
    .select('id, name, enrollment_number')
    .eq('section_id', sectionId)
    .order('name');
  if (!data) return [];
  return data.map((row: { id: string; name: string; enrollment_number?: string }) => ({
    id: row.id,
    name: row.name,
    enrollmentNumber: row.enrollment_number,
  }));
}

export default function AttendancePage() {
  const [sections, setSections] = useState<AttendanceOption[]>([]);
  const [subjects, setSubjects] = useState<AttendanceOption[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const sectionRows = await supabase.from('sections').select('id, name').order('name');
        if (sectionRows.data) {
          setSections(sectionRows.data as AttendanceOption[]);
        }
        const subjectRows = await supabase.from('subjects').select('id, name').order('name');
        if (subjectRows.data) {
          setSubjects(subjectRows.data as AttendanceOption[]);
        }
      } catch {
        // View handles empty arrays gracefully.
      }
    })();
  }, []);

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
