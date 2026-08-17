import { useState, useMemo, useEffect } from 'react';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { createAttendanceAccess } from '@data/access/attendanceAccess';
import { createLocalDemoAttendanceAccess, isLocalDemoMode, listDemoRoster } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';

interface SelectDateViewProps {
  onDateSelected: (date: string) => void;
  refreshVersion?: number;
}

const supabaseAttendance = createAttendanceAccess(supabase);

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function loadDemoRoster(sectionId: string) {
  return listDemoRoster(sectionId).map(s => ({ ...s, sectionId }));
}

export function SelectDateView({ onDateSelected, refreshVersion = 0 }: SelectDateViewProps) {
  const { selectedSection } = useSelectedSection();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [markedDates, setMarkedDates] = useState<Set<string>>(new Set());

  const attendance = useMemo(
    () => (isLocalDemoMode() ? createLocalDemoAttendanceAccess(loadDemoRoster) : supabaseAttendance),
    [],
  );

  // Calendar logic base
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();

  useEffect(() => {
    if (!selectedSection) return;
    let active = true;
    
    const firstDay = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const lastDay = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    
    attendance.loadMarkedDates({
      sectionId: selectedSection.id,
      fromDate: firstDay,
      toDate: lastDay,
    }).then(dates => {
      if (!active) return;
      setMarkedDates(new Set(dates));
    }).catch(console.error);
    
    return () => { active = false; };
  }, [selectedSection, viewYear, viewMonth, attendance, refreshVersion, daysInMonth]);


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
    const isMarked = markedDates.has(dateStr);
    
    let cellClass = "relative rounded-full w-9 h-9 sm:w-10 sm:h-10 text-sm mx-auto flex flex-col items-center justify-center transition-all duration-200";
    
    if (isFuture) {
      cellClass += " text-border cursor-not-allowed";
    } else if (isSelected) {
      cellClass += " bg-text text-surface font-semibold shadow-md scale-105";
    } else if (isToday) {
      cellClass += " border-2 border-text text-text font-bold hover:bg-surface-muted";
    } else {
      cellClass += " text-text hover:bg-surface-muted hover:scale-105";
      if (isMarked) {
        cellClass += " font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/10";
      }
    }

    calendarCells.push(
      <button 
        key={d}
        disabled={isFuture}
        className={cellClass}
        onClick={() => {
          setSelectedDate(dateStr);
          onDateSelected(dateStr);
        }}
      >
        <span className="leading-none mt-1">{d}</span>
        <div className="h-2 w-full flex items-center justify-center mt-0.5">
          {isMarked && (
             <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-surface/90' : 'bg-emerald-500 shadow-[0_0_3px_rgba(16,185,129,0.5)]'}`} />
          )}
        </div>
      </button>
    );
  }


  return (
    <div className="flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="w-full max-w-[400px] sm:max-w-[440px] rounded-card border border-border bg-surface shadow-sm p-4 sm:p-5 overflow-hidden mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-2 mb-4 sm:mb-5">
          <h2 className="text-lg sm:text-xl font-semibold text-text">Select Date</h2>
          <div className="flex items-center gap-2 sm:gap-3 text-text font-medium bg-surface-muted px-2 py-1 rounded-full border border-border">
             <button onClick={goToPrevMonth} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full text-text-soft hover:text-text hover:bg-surface transition-colors flex items-center justify-center text-xs sm:text-sm">&lt;</button>
             <span className="min-w-[100px] sm:min-w-[110px] text-center text-xs sm:text-sm font-bold">{MONTH_NAMES[viewMonth]} {viewYear}</span>
             <button onClick={goToNextMonth} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full text-text-soft hover:text-text hover:bg-surface transition-colors flex items-center justify-center text-xs sm:text-sm">&gt;</button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-x-1 sm:gap-x-2 gap-y-2 text-center text-xs sm:text-sm font-medium">
           {WEEKDAYS.map(day => (
             <div key={day} className="text-text-soft text-[10px] font-bold uppercase tracking-wider mb-1.5">{day}</div>
           ))}
           {calendarCells}
        </div>
      </div>
    </div>
  );
}
