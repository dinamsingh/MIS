import { useEffect, useMemo, useState } from 'react';
import AttendanceView, { type AttendanceOption, type AttendanceSectionOption, type RosterStudent } from '@presentation/views/AttendanceView';
import { createAttendanceAccess, migrateLocalStatusStore } from '@data/access/attendanceAccess';
import { createLocalDemoAttendanceAccess, isLocalDemoMode, listDemoRoster } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { useAuth } from '@presentation/auth';
import { createTimetableAccess, type ConfirmedPeriodsResult, type PeriodOption } from '@data/access/timetableAccess';
import type { DayOfWeek } from '@domain/services/timetableService';

const supabaseAttendance = createAttendanceAccess(supabase);
const timetableAccess = createTimetableAccess(supabase);

const DEFAULT_TIME_SLOTS = [
  '09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00', '14:00-15:00', '15:00-16:00', '16:00-17:00'
];

/** Map JS Date.getDay() (0=Sun) to our DayOfWeek type. */
const DAY_INDEX_MAP: Record<number, DayOfWeek> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

/** Derive the DayOfWeek from an ISO date string (YYYY-MM-DD). */
function dateToDayOfWeek(iso: string): DayOfWeek {
  const d = new Date(`${iso}T00:00:00`);
  return DAY_INDEX_MAP[d.getDay()];
}

/** Convert a PeriodOption into a time-slot string matching the existing format. */
function periodToSlotString(period: PeriodOption): string {
  return `${period.startTime}-${period.endTime}`;
}

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
  const { actor } = useAuth();
  const { selectedSection, subjects, selectedSubjectId } = useSelectedSection();
  const attendance = useMemo(
    () => (isLocalDemoMode() ? createLocalDemoAttendanceAccess(loadRoster) : supabaseAttendance),
    [],
  );

  useEffect(() => {
    if (!isLocalDemoMode()) {
      void migrateLocalStatusStore(supabase);
    }
  }, []);

  // Section + subject both come from the global top-bar selectors — no per-page
  // pickers. Attendance is scoped to the one globally-selected subject.
  const sections: AttendanceSectionOption[] = selectedSection ? [selectedSection] : [];
  const scopedSubjects: AttendanceOption[] = useMemo(
    () => subjects.filter((s) => s.id === selectedSubjectId).map((s) => ({ id: s.id, name: s.name })),
    [subjects, selectedSubjectId],
  );

  // --- Resolved time slots from confirmed timetable (Requirements 19.1–19.5) ---
  const [resolvedSlots, setResolvedSlots] = useState<string[]>(DEFAULT_TIME_SLOTS);
  // Derive from today's date — the view defaults to today and the timetable
  // resolution is per-day, so the period set corresponds to the initial date.
  const currentDate = useMemo(() => {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
  }, []);

  const teacherId = actor.kind === 'teacher' ? actor.userId : null;
  const sectionId = selectedSection?.id ?? null;
  const subjectId = selectedSubjectId ?? null;

  useEffect(() => {
    if (!teacherId || !sectionId || !subjectId) {
      setResolvedSlots(DEFAULT_TIME_SLOTS);
      return;
    }

    let active = true;
    const dayOfWeek = dateToDayOfWeek(currentDate);

    void timetableAccess
      .resolveConfirmedPeriods(teacherId, sectionId, subjectId, dayOfWeek)
      .then((result: ConfirmedPeriodsResult) => {
        if (!active) return;
        if (result.kind === 'not-confirmed') {
          // Timetable not yet confirmed — fall back to default slots.
          setResolvedSlots(DEFAULT_TIME_SLOTS);
        } else {
          // kind === 'confirmed': use the resolved periods (may be empty).
          setResolvedSlots(result.periods.map(periodToSlotString));
        }
      })
      .catch(() => {
        if (!active) return;
        // On error, fall back to defaults so the page remains usable.
        setResolvedSlots(DEFAULT_TIME_SLOTS);
      });

    return () => { active = false; };
  }, [teacherId, sectionId, subjectId, currentDate]);

  return (
    <AttendanceView
      sections={sections}
      subjects={scopedSubjects}
      timeSlots={resolvedSlots}
      loadRoster={loadRoster}
      attendance={attendance}
    />
  );
}
