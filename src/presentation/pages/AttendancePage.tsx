import { useEffect, useMemo, useState } from 'react';
import AttendanceView, { type AttendanceOption, type AttendanceSectionOption, type RosterStudent } from '@presentation/views/AttendanceView';
import { AttendanceTabs, type AttendanceTab } from '@presentation/components/attendance/AttendanceTabs';
import { SelectDateView } from '@presentation/components/attendance/SelectDateView';
import { ReportModeView } from '@presentation/components/attendance/ReportModeView';
import { Dialog } from '@presentation/components/ui';
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
  0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday',
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

export type ExtendedAttendanceTab = AttendanceTab | 'mark-past-date';

export default function AttendancePage() {
  const { actor } = useAuth();
  const { selectedSection, subjects, selectedSubjectId } = useSelectedSection();
  const [activeTab, setActiveTab] = useState<ExtendedAttendanceTab>('today');
  const [selectedPastDate, setSelectedPastDate] = useState<string | null>(null);

  const attendance = useMemo(
    () => (isLocalDemoMode() ? createLocalDemoAttendanceAccess(loadRoster) : supabaseAttendance),
    [],
  );

  useEffect(() => {
    if (!isLocalDemoMode()) {
      void migrateLocalStatusStore(supabase);
    }
  }, []);

  const sections: AttendanceSectionOption[] = selectedSection ? [selectedSection] : [];
  const scopedSubjects: AttendanceOption[] = useMemo(
    () => subjects.filter((s) => s.id === selectedSubjectId).map((s) => ({ id: s.id, name: s.name })),
    [subjects, selectedSubjectId],
  );

  const [resolvedSlots, setResolvedSlots] = useState<string[]>(DEFAULT_TIME_SLOTS);
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
          setResolvedSlots(DEFAULT_TIME_SLOTS);
        } else {
          setResolvedSlots(result.periods.map(periodToSlotString));
        }
      })
      .catch(() => {
        if (!active) return;
        setResolvedSlots(DEFAULT_TIME_SLOTS);
      });

    return () => { active = false; };
  }, [teacherId, sectionId, subjectId, currentDate]);

  const [refreshVersion, setRefreshVersion] = useState(0);

  const handleTabChange = (tab: ExtendedAttendanceTab) => {
    setActiveTab(tab);
    if (tab !== 'select-date' && tab !== 'mark-past-date') {
      setSelectedPastDate(null);
    }
  };

  const handleDateSelected = (date: string) => {
    setSelectedPastDate(date);
  };

  const closePastDateModal = () => {
    setSelectedPastDate(null);
    setRefreshVersion(v => v + 1);
  };

  return (
    <div className="flex flex-col h-full pb-12">
      <div className="flex flex-col">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 mb-2">
          <h1 className="hidden sm:block text-2xl font-semibold text-text tracking-tight" style={{ fontFamily: 'Geist, sans-serif' }}>Attendance</h1>
          <p className="text-text-muted text-xs sm:text-sm font-medium" style={{ fontFamily: 'Geist, sans-serif' }}>
            {selectedSection?.name ?? 'No Section'} — {scopedSubjects[0]?.name ?? 'No Subject'} <span className="hidden sm:inline">—</span><br className="sm:hidden" /> {new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(currentDate))}
          </p>
        </div>
        
        <AttendanceTabs 
          activeTab={activeTab === 'mark-past-date' ? 'select-date' : activeTab} 
          onTabChange={handleTabChange} 
        />

        <div className="mt-4">
          {activeTab === 'today' && (
             <AttendanceView
               sections={sections}
               subjects={scopedSubjects}
               timeSlots={resolvedSlots}
               loadRoster={loadRoster}
               attendance={attendance}
               initialDate={currentDate}
             />
          )}
          {activeTab === 'select-date' && (
             <>
               <SelectDateView onDateSelected={handleDateSelected} refreshVersion={refreshVersion} />
               <Dialog 
                 open={!!selectedPastDate} 
                 onOpenChange={(open) => !open && closePastDateModal()}
                 maxWidth="5xl"
                 title={`Attendance Record - ${selectedPastDate ? new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(selectedPastDate)) : ''}`}
               >
                 {selectedPastDate && (
                   <div className="max-h-[80vh] overflow-y-auto px-1 pb-4">
                     <AttendanceView
                       sections={sections}
                       subjects={scopedSubjects}
                       timeSlots={resolvedSlots}
                       loadRoster={loadRoster}
                       attendance={attendance}
                       initialDate={selectedPastDate}
                       isPopup={true}
                       onSaveSuccess={closePastDateModal}
                     />
                   </div>
                 )}
               </Dialog>
             </>
          )}
          {activeTab === 'report' && (
             <ReportModeView />
          )}
        </div>
      </div>
    </div>
  );
}
