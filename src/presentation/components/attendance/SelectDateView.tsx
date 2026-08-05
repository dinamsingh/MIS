import { useState, useMemo, useEffect } from 'react';
import { Button } from '@presentation/components/ui';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { createAttendanceAccess, type AttendanceStatusRangeReport } from '@data/access/attendanceAccess';
import { createLocalDemoAttendanceAccess, isLocalDemoMode, listDemoRoster } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';

interface SelectDateViewProps {
  onDateSelected: (date: string) => void;
}

const supabaseAttendance = createAttendanceAccess(supabase);

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function loadDemoRoster(sectionId: string) {
  return listDemoRoster(sectionId).map(s => ({ ...s, sectionId }));
}

export function SelectDateView({ onDateSelected }: SelectDateViewProps) {
  const { selectedSection } = useSelectedSection();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewReport, setPreviewReport] = useState<AttendanceStatusRangeReport | null>(null);

  const attendance = useMemo(
    () => (isLocalDemoMode() ? createLocalDemoAttendanceAccess(loadDemoRoster) : supabaseAttendance),
    [],
  );

  useEffect(() => {
    if (!selectedSection || !selectedDate) {
      setPreviewReport(null);
      return;
    }
    let active = true;
    setPreviewLoading(true);
    
    attendance.loadStatusRangeReport({
      sectionId: selectedSection.id,
      fromDate: selectedDate,
      toDate: selectedDate,
    }).then(report => {
      if (active) {
        setPreviewReport(report);
        setPreviewLoading(false);
      }
    }).catch(() => {
      if (active) setPreviewLoading(false);
    });
    
    return () => { active = false; };
  }, [selectedSection, selectedDate, attendance]);

  const handleMarkAttendance = () => {
    if (selectedDate) {
      onDateSelected(selectedDate);
    }
  };

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  // Calendar logic
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  
  const calendarCells = [];
  // Empty slots for previous month
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarCells.push(<div key={`empty-${i}`} className="text-text-soft"></div>);
  }
  
  // Days of the month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isSelected = selectedDate === dateStr;
    const isToday = dateStr === today.toISOString().slice(0, 10);
    const isFuture = new Date(dateStr) > today;
    
    calendarCells.push(
      <button 
        key={d}
        disabled={isFuture}
        className={`rounded-full p-2 w-10 h-10 mx-auto flex items-center justify-center transition-colors 
          ${isFuture ? 'text-border cursor-not-allowed' : 
            isSelected ? 'bg-accent text-surface' : 
            isToday ? 'border border-accent text-accent font-bold hover:bg-surface-muted' : 
            'text-text hover:bg-surface-muted'}`}
        onClick={() => setSelectedDate(dateStr)}
      >
        {d}
      </button>
    );
  }

  // Preview logic
  let presentCount = 0;
  let absentCount = 0;
  let markedCount = 0;
  if (previewReport) {
    for (const tally of previewReport.tallies) {
      presentCount += tally.present;
      absentCount += tally.absent;
      markedCount += tally.present + tally.absent + tally.leave + tally.notApplicable;
    }
  }
  const isAttendanceMarked = markedCount > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="md:col-span-8 rounded-card border border-border bg-surface shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-text">Select Date</h2>
          <div className="flex items-center gap-4 text-text font-medium bg-surface-muted px-2 py-1 rounded-full border border-border">
             <button onClick={goToPrevMonth} className="w-8 h-8 rounded-full text-text-soft hover:text-text hover:bg-surface transition-colors flex items-center justify-center">&lt;</button>
             <span className="min-w-[120px] text-center text-sm font-bold">{MONTH_NAMES[viewMonth]} {viewYear}</span>
             <button onClick={goToNextMonth} className="w-8 h-8 rounded-full text-text-soft hover:text-text hover:bg-surface transition-colors flex items-center justify-center">&gt;</button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-y-4 text-center text-sm font-medium">
           {WEEKDAYS.map(day => (
             <div key={day} className="text-text-soft text-[10px] font-bold uppercase tracking-wider mb-2">{day}</div>
           ))}
           {calendarCells}
        </div>
      </div>

      <div className="md:col-span-4 flex flex-col gap-6">
        <div className="rounded-card border border-border bg-surface shadow-sm overflow-hidden flex-1">
           <div className="p-6">
              <h3 className="text-lg font-bold text-text mb-6">Date Summary</h3>
              
              <div className="space-y-6">
                 <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center mt-0.5">
                      <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    </div>
                    <div>
                       <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Selected Date</p>
                       <p className="text-text font-bold text-sm mt-0.5">
                         {selectedDate ? new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(selectedDate)) : 'None selected'}
                       </p>
                    </div>
                 </div>

                 <div className="w-full h-px bg-border"></div>

                 <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center mt-0.5">
                      <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253"></path></svg>
                    </div>
                    <div>
                       <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Assigned Section</p>
                       <p className="text-text font-bold text-sm mt-0.5">{selectedSection?.name ?? 'No Section'}</p>
                    </div>
                 </div>

                 <div className="w-full h-px bg-border"></div>

                 <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mt-0.5 ${!selectedDate ? 'bg-surface-muted text-muted' : previewLoading ? 'bg-surface-muted text-muted animate-pulse' : isAttendanceMarked ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {!selectedDate || previewLoading ? (
                        <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      ) : isAttendanceMarked ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      )}
                    </div>
                    <div>
                       <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Status Preview</p>
                       {!selectedDate ? (
                         <p className="text-muted font-bold text-sm mt-0.5">Select a date</p>
                       ) : previewLoading ? (
                         <p className="text-muted font-bold text-sm mt-0.5">Checking...</p>
                       ) : isAttendanceMarked ? (
                         <div>
                           <p className="text-emerald-700 font-bold text-sm mt-0.5">Attendance Marked</p>
                           <p className="text-xs font-semibold text-text mt-1">{presentCount} Present • {absentCount} Absent</p>
                         </div>
                       ) : (
                         <p className="text-amber-700 font-bold text-sm mt-0.5">Not Marked Yet</p>
                       )}
                    </div>
                 </div>
              </div>
           </div>
        </div>

        <div className="rounded-card border border-border bg-surface-muted/50 p-6 flex flex-col items-center justify-center text-center shadow-sm">
            <h3 className="text-lg font-bold text-text mb-2">Ready?</h3>
            <p className="text-muted text-sm font-medium mb-6">Review or edit attendance records for the selected date.</p>
            <Button 
                variant="primary" 
                className="w-full justify-center"
                onClick={handleMarkAttendance}
                disabled={!selectedDate}
            >
                {isAttendanceMarked ? 'View/Edit Records' : 'Mark Attendance'} &rarr;
            </Button>
        </div>
      </div>
    </div>
  );
}
