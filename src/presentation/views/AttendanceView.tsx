/**
 * Attendance marking surface.
 *
 * Teachers can mark each student present, absent, on leave, or not applicable
 * for a selected class period. Leave and not-applicable statuses are excluded
 * from the counted attendance denominator.
 *
 * Layout (mockup-style): a compact page head, three summary cards, and one
 * clean roster card where attendance is marked inline.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type AttendanceStatus,
  type AttendanceStatusMark,
  type PeriodKey,
} from '@domain/services/attendanceService';
import { messages } from '@domain/shared/messages';
import { applyPresentList, previewPresentList, type PresentListPreview } from '@domain/services/quickAttendance';
import { Alert } from '@presentation/components/ui';

export interface AttendanceOption {
  readonly id: string;
  readonly name: string;
}

export interface AttendanceSectionOption extends AttendanceOption {
  readonly batch?: string | null;
  readonly semester?: string | null;
  readonly department?: string | null;
}

export interface RosterStudent {
  readonly id: string;
  readonly name: string;
  readonly enrollmentNumber?: string;
}

export type LoadRoster = (sectionId: string) => Promise<RosterStudent[]>;

export interface AttendancePersistence {
  loadStatusPeriod(key: PeriodKey): Promise<AttendanceStatusMark[]>;
  saveStatusPeriod(key: PeriodKey, marks: AttendanceStatusMark[]): Promise<void>;
}

export interface AttendanceViewProps {
  readonly sections: readonly AttendanceSectionOption[];
  readonly subjects: readonly AttendanceOption[];
  readonly timeSlots: readonly string[];
  readonly loadRoster: LoadRoster;
  readonly attendance: AttendancePersistence;
  readonly initialDate?: string;
}

interface StatusSummary {
  readonly present: number;
  readonly absent: number;
  readonly leave: number;
  readonly notApplicable: number;
  readonly counted: number;
  readonly percent: number;
}

const STATUS_OPTIONS: Array<{
  readonly value: AttendanceStatus;
  readonly label: string;
  readonly shortLabel: string;
  readonly activeClass: string;
}> = [
  {
    value: 'present',
    label: 'Present',
    shortLabel: 'P',
    activeClass: 'border-transparent bg-emerald-50 text-emerald-700',
  },
  {
    value: 'absent',
    label: 'Absent',
    shortLabel: 'A',
    activeClass: 'border-transparent bg-red-50 text-red-700',
  },
  {
    value: 'leave',
    label: 'Leave',
    shortLabel: 'L',
    activeClass: 'border-transparent bg-amber-50 text-amber-700',
  },
  {
    value: 'not-applicable',
    label: 'N/A',
    shortLabel: 'NA',
    activeClass: 'border-transparent bg-sky-50 text-sky-700',
  },
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function todayIso(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(`${iso}T00:00:00`),
  );
}

function formatMonthLabel(monthKey: string): string {
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(
    new Date(`${monthKey}-01T00:00:00`),
  );
}

function buildIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function calendarCells(monthKey: string): Array<string | null> {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<string | null> = Array.from({ length: firstDay }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(buildIsoDate(year, monthIndex, day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function shiftMonthKey(monthKey: string, offset: number, maxMonthKey: string): string {
  const [yearText, monthText] = monthKey.split('-');
  const next = new Date(Number(yearText), Number(monthText) - 1 + offset, 1);
  const nextKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  return nextKey > maxMonthKey ? maxMonthKey : nextKey;
}

function summarize(statuses: readonly AttendanceStatus[]): StatusSummary {
  let present = 0;
  let absent = 0;
  let leave = 0;
  let notApplicable = 0;

  for (const status of statuses) {
    if (status === 'present') present += 1;
    if (status === 'absent') absent += 1;
    if (status === 'leave') leave += 1;
    if (status === 'not-applicable') notApplicable += 1;
  }

  const counted = present + absent;
  return {
    present,
    absent,
    leave,
    notApplicable,
    counted,
    percent: counted === 0 ? 0 : Math.round((present / counted) * 100),
  };
}

function statusMapFromMarks(
  roster: readonly RosterStudent[],
  saved: readonly AttendanceStatusMark[],
): Record<string, AttendanceStatus> {
  const savedById = new Map(saved.map((mark) => [mark.studentId, mark.status]));
  const next: Record<string, AttendanceStatus> = {};
  for (const student of roster) {
    next[student.id] = savedById.get(student.id) ?? 'present';
  }
  return next;
}

function statusButtonClass(isActive: boolean, activeClass: string): string {
  return [
    'min-h-8 min-w-8 rounded-button border px-2 text-xs font-bold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60',
    isActive ? activeClass : 'border-border bg-white text-muted hover:border-accent/40 hover:bg-background hover:text-text',
  ].join(' ');
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function todayPercentLabel(status: AttendanceStatus): string {
  if (status === 'present') return '100%';
  if (status === 'absent') return '0%';
  if (status === 'leave') return 'Leave';
  return 'N/A';
}

function todayPercentClass(status: AttendanceStatus): string {
  if (status === 'present') return 'bg-emerald-50 text-emerald-700';
  if (status === 'absent') return 'bg-red-50 text-red-700';
  if (status === 'leave') return 'bg-amber-50 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}

function SummaryCard({
  label,
  value,
  icon,
  chipClass,
}: {
  readonly label: string;
  readonly value: number;
  readonly icon: string;
  readonly chipClass: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-card border border-border bg-surface px-3 py-1.5 shadow-soft">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-button text-[10px] font-bold ${chipClass}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-lg font-extrabold leading-none tracking-tight text-text">{value}</p>
        <p className="mt-0.5 truncate text-[10px] font-medium text-muted">{label}</p>
      </div>
    </div>
  );
}

function AttendanceCalendarCard({
  selectedDate,
  maxDate,
  monthKey,
  onMonthChange,
  onDateChange,
  hasSavedAttendance,
}: {
  readonly selectedDate: string;
  readonly maxDate: string;
  readonly monthKey: string;
  readonly onMonthChange: (monthKey: string) => void;
  readonly onDateChange: (date: string) => void;
  readonly hasSavedAttendance: boolean;
}) {
  const maxMonthKey = maxDate.slice(0, 7);
  const days = calendarCells(monthKey);
  const canGoNext = monthKey < maxMonthKey;

  return (
    <aside className="rounded-card border border-border bg-white p-3 shadow-soft">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Calendar</p>
          <h3 className="text-sm font-extrabold text-text">{formatMonthLabel(monthKey)}</h3>
        </div>
        <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-bold text-muted">
          {hasSavedAttendance ? 'Edit saved' : 'New mark'}
        </span>
      </div>

      <div className="mb-2 flex items-center gap-1.5">
        <button
          type="button"
          className="min-h-8 rounded-button border border-border bg-surface px-2.5 text-sm font-bold text-text transition-colors hover:bg-background focus:outline-none focus:ring-2 focus:ring-accent/30"
          aria-label="Previous month"
          onClick={() => onMonthChange(shiftMonthKey(monthKey, -1, maxMonthKey))}
        >
          &lt;
        </button>
        <button
          type="button"
          className="min-h-8 flex-1 rounded-button border border-border bg-surface px-2 text-[11px] font-bold uppercase tracking-wide text-text transition-colors hover:bg-background focus:outline-none focus:ring-2 focus:ring-accent/30"
          onClick={() => onDateChange(maxDate)}
        >
          Today
        </button>
        <button
          type="button"
          className="min-h-8 rounded-button border border-border bg-surface px-2.5 text-sm font-bold text-text transition-colors hover:bg-background focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next month"
          disabled={!canGoNext}
          onClick={() => onMonthChange(shiftMonthKey(monthKey, 1, maxMonthKey))}
        >
          &gt;
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((day) => (
          <span key={day} className="py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted">
            {day}
          </span>
        ))}
        {days.map((day, index) => {
          if (day === null) {
            return <span key={`blank-${index}`} className="h-7" />;
          }

          const isSelected = day === selectedDate;
          const isToday = day === maxDate;
          const isFuture = day > maxDate;
          const dateNumber = Number(day.slice(-2));

          return (
            <button
              key={day}
              type="button"
              disabled={isFuture}
              aria-pressed={isSelected}
              aria-label={`Load attendance for ${formatDate(day)}`}
              className={[
                'relative flex h-7 items-center justify-center rounded-button text-[11px] font-bold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-30',
                isSelected
                  ? 'bg-text text-white shadow-[0_10px_18px_rgba(15,23,42,0.20)]'
                  : 'bg-background text-text hover:bg-accent-tint hover:text-accent',
              ].join(' ')}
              onClick={() => onDateChange(day)}
            >
              {dateNumber}
              {isToday && !isSelected ? (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="mt-2 rounded-button bg-background px-2.5 py-1 text-[11px] font-medium text-muted">
        <span className="font-bold text-text">{formatDate(selectedDate)}</span>
      </p>

      <label className="mt-1.5 flex items-center justify-between gap-2 rounded-button bg-background px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
        Date
        <input
          type="date"
          value={selectedDate}
          max={maxDate}
          onChange={(event) => onDateChange(event.target.value)}
          aria-label="Jump to attendance date"
          className="min-h-7 rounded-button border border-border bg-surface px-2 text-[11px] font-medium normal-case tracking-normal text-text focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </label>
    </aside>
  );
}

export default function AttendanceView(props: AttendanceViewProps) {
  const { sections, subjects, timeSlots, loadRoster, attendance, initialDate } = props;
  const maxAttendanceDate = useMemo(() => todayIso(), []);
  const initialAttendanceDate = initialDate && initialDate <= maxAttendanceDate ? initialDate : maxAttendanceDate;
  const maxAttendanceMonth = maxAttendanceDate.slice(0, 7);
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [date, setDate] = useState(initialAttendanceDate);
  const [calendarMonth, setCalendarMonth] = useState(initialAttendanceDate.slice(0, 7));
  const [roster, setRoster] = useState<readonly RosterStudent[]>([]);
  const [statusById, setStatusById] = useState<Record<string, AttendanceStatus>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [rosterLoading, setRosterLoading] = useState(false);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [presentInput, setPresentInput] = useState('');
  const [quickResult, setQuickResult] = useState<{
    matchedCount: number;
    notFound: string[];
    ambiguous: string[];
  } | null>(null);
  const [preview, setPreview] = useState<PresentListPreview | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [hasSavedAttendance, setHasSavedAttendance] = useState(false);
  const [dirty, setDirty] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setCalendarMonth(date.slice(0, 7));
  }, [date]);

  useEffect(() => {
    if (sections.length === 0) {
      setSectionId('');
      return;
    }
    if (!sections.some((section) => section.id === sectionId)) {
      setSectionId(sections[0].id);
    }
  }, [sectionId, sections]);

  useEffect(() => {
    if (subjects.length === 0) {
      setSubjectId('');
      return;
    }
    if (!subjects.some((subject) => subject.id === subjectId)) {
      setSubjectId(subjects[0].id);
    }
  }, [subjectId, subjects]);

  useEffect(() => {
    if (timeSlots.length === 0) {
      setTimeSlot('');
      return;
    }
    if (!timeSlots.includes(timeSlot)) {
      setTimeSlot(timeSlots[0]);
    }
  }, [timeSlot, timeSlots]);

  useEffect(() => {
    if (!sectionId) {
      setRoster([]);
      setStatusById({});
      setHasSavedAttendance(false);
      return;
    }

    let active = true;
    setRosterLoading(true);
    setLoadError(false);

    void loadRoster(sectionId)
      .then((students) => {
        if (!active) return;
        setRoster(students);
        setRosterLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setRoster([]);
        setStatusById({});
        setHasSavedAttendance(false);
        setRosterLoading(false);
        setLoadError(true);
      });

    return () => {
      active = false;
    };
  }, [sectionId, loadRoster]);

  const periodKey = useMemo<PeriodKey | null>(() => {
    if (!sectionId || !subjectId || !date || !timeSlot) return null;
    if (date > maxAttendanceDate) return null;
    return { sectionId, subjectId, date, timeSlot };
  }, [date, maxAttendanceDate, sectionId, subjectId, timeSlot]);

  useEffect(() => {
    if (!periodKey || roster.length === 0) {
      setStatusById({});
      setHasSavedAttendance(false);
      setDirty(false);
      return;
    }

    let active = true;
    setPeriodLoading(true);
    setLoadError(false);
    setSavedMessage(null);

    void attendance
      .loadStatusPeriod(periodKey)
      .then((saved) => {
        if (!active) return;
        setHasSavedAttendance(saved.length > 0);
        setStatusById(statusMapFromMarks(roster, saved));
        setDirty(false);
        setPeriodLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setPeriodLoading(false);
        setLoadError(true);
      });

    return () => {
      active = false;
    };
  }, [attendance, periodKey, roster]);

  // Auto-dismiss the success alert after a short delay (errors/future stay).
  useEffect(() => {
    if (!savedMessage) return;
    const timer = window.setTimeout(() => setSavedMessage(null), 3500);
    return () => window.clearTimeout(timer);
  }, [savedMessage]);

  // Confirm modal accessibility: focus management + Escape to close.
  useEffect(() => {
    if (!showConfirm) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    confirmButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowConfirm(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [showConfirm]);

  const busy = rosterLoading || periodLoading;
  const quickMarkMode = hasSavedAttendance ? 'correction' : 'first-time';
  const isQuickCorrectionMode = quickMarkMode === 'correction';
  const isFutureDate = date > maxAttendanceDate;
  const saveDisabled = !periodKey || roster.length === 0 || saving || isFutureDate;

  const filteredRoster = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return roster;
    }
    return roster.filter(
      (student) =>
        student.name.toLowerCase().includes(query) ||
        (student.enrollmentNumber ?? '').toLowerCase().includes(query),
    );
  }, [roster, searchQuery]);

  const summary = useMemo(
    () => summarize(roster.map((student) => statusById[student.id] ?? 'present')),
    [roster, statusById],
  );

  function setStudentStatus(studentId: string, status: AttendanceStatus) {
    if (isFutureDate) return;
    setSavedMessage(null);
    setDirty(true);
    setStatusById((prev) => ({ ...prev, [studentId]: status }));
  }

  function openPreview() {
    if (isFutureDate) return;
    setPreview(previewPresentList(roster, presentInput));
    setShowConfirm(true);
  }

  function confirmApply() {
    if (isFutureDate) return;
    const result = applyPresentList(roster, presentInput, { mode: quickMarkMode });
    if (quickMarkMode === 'first-time') {
      setStatusById(result.statusById);
    } else {
      setStatusById((prev) => ({ ...prev, ...result.statusById }));
    }
    setQuickResult({
      matchedCount: result.matchedCount,
      notFound: result.notFound,
      ambiguous: result.ambiguous,
    });
    setSavedMessage(null);
    setDirty(true);
    setShowConfirm(false);
  }

  function clearQuick() {
    setPresentInput('');
    setQuickResult(null);
  }

  function changeAttendanceDate(nextDate: string) {
    const safeDate = nextDate > maxAttendanceDate ? maxAttendanceDate : nextDate;
    setDate(safeDate);
    setQuickResult(null);
    setShowConfirm(false);
  }

  function changeCalendarMonth(nextMonth: string) {
    setCalendarMonth(nextMonth > maxAttendanceMonth ? maxAttendanceMonth : nextMonth);
  }

  async function saveAttendance() {
    if (!periodKey || roster.length === 0 || isFutureDate) {
      return;
    }

    setSaving(true);
    setLoadError(false);
    setSavedMessage(null);
    try {
      await attendance.saveStatusPeriod(
        periodKey,
        roster.map((student) => ({
          studentId: student.id,
          status: statusById[student.id] ?? 'present',
        })),
      );
      setHasSavedAttendance(true);
      setDirty(false);
      setSavedMessage(`Saved ${formatDate(periodKey.date)} attendance.`);
    } catch {
      setLoadError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-2">
      <h1 className="sr-only">Attendance</h1>

      <div className="sticky top-16 z-40 -mx-4 bg-secondary px-4 pb-1.5 pt-0 shadow-[0_10px_24px_rgba(15,23,42,0.06)] backdrop-blur lg:-mx-6 lg:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1">
          <div className="grid w-full gap-2 sm:grid-cols-4">
            <SummaryCard label="Present" value={summary.present} icon="P" chipClass="bg-emerald-50 text-emerald-700" />
            <SummaryCard label="Absent" value={summary.absent} icon="A" chipClass="bg-red-50 text-red-700" />
            <SummaryCard label="Leave" value={summary.leave} icon="L" chipClass="bg-amber-50 text-amber-700" />
            <SummaryCard label="Total students" value={roster.length} icon="#" chipClass="bg-sky-50 text-sky-700" />
          </div>
          <div className="flex items-center justify-end gap-1.5">
            {dirty && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                Unsaved
              </span>
            )}
            <button
              type="button"
              className="btn-primary min-h-8"
              disabled={saveDisabled}
              onClick={() => void saveAttendance()}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {loadError && (
        <Alert tone="danger" title="Unable to load attendance">
          {messages.error.generic}
        </Alert>
      )}

      {isFutureDate && (
        <Alert tone="danger" title="Future attendance blocked">
          Attendance can only be marked for today or past dates.
        </Alert>
      )}

      {savedMessage && (
        <Alert tone="success" title="Attendance saved">
          {savedMessage}
        </Alert>
      )}

      <div className="overflow-hidden rounded-card border border-border bg-surface shadow-soft">
        <div className="flex flex-col gap-2 border-b border-border p-3">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-text">Roster</h2>
              <p className="text-xs text-muted">
                {searchQuery.trim()
                  ? `${filteredRoster.length}/${roster.length}`
                  : `${roster.length} students`}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search roll/name"
                aria-label="Search student or roll"
                className="min-h-9 w-full rounded-button border border-border bg-surface px-3 text-xs font-medium normal-case tracking-normal text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 sm:w-60"
              />
              <span className="w-fit rounded-full bg-background px-3 py-1 text-xs font-semibold text-muted">
                {summary.counted === 0 ? 'No marks' : `${summary.percent}%`}
              </span>
            </div>
          </div>

          <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_15.5rem]">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="grid gap-2 md:grid-cols-2">
                <label className="m-0 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Subject
                  <select
                    value={subjectId}
                    onChange={(event) => setSubjectId(event.target.value)}
                    className="min-h-10 rounded-button border border-border bg-surface px-3 text-sm font-medium normal-case tracking-normal text-text focus:outline-none focus:ring-2 focus:ring-accent/30"
                  >
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="m-0 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Period
                  <select
                    value={timeSlot}
                    onChange={(event) => setTimeSlot(event.target.value)}
                    className="min-h-10 rounded-button border border-border bg-surface px-3 text-sm font-medium normal-case tracking-normal text-text focus:outline-none focus:ring-2 focus:ring-accent/30"
                  >
                    {timeSlots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-1 flex-col rounded-card border border-emerald-200 bg-emerald-50/70 p-2.5 shadow-[0_10px_30px_rgba(16,185,129,0.12)]">
                <div className="mb-1.5 flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-extrabold text-emerald-900">Quick mark</h3>
                      <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Time saver
                      </span>
                    </div>
                  </div>
                  <span
                    className="w-fit rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-bold text-emerald-700"
                    title={
                      isQuickCorrectionMode
                        ? 'Edit mode: pasted rolls become Present. Everyone else stays unchanged.'
                        : 'First-time mode: pasted rolls become Present. Everyone else becomes Absent.'
                    }
                  >
                    {isQuickCorrectionMode ? 'Edit' : 'New'}
                  </span>
                </div>

                <label className="m-0 flex flex-1 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                  Present rolls
                  <textarea
                    value={presentInput}
                    onChange={(event) => setPresentInput(event.target.value)}
                    rows={2}
                    placeholder="e.g. 001, 004, 067, D01"
                    className="min-h-[2.75rem] flex-1 resize-y rounded-button border border-emerald-200 bg-white px-3 py-1.5 text-sm font-semibold normal-case tracking-normal text-text shadow-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </label>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-primary min-h-8 bg-emerald-600 hover:bg-emerald-700"
                    disabled={roster.length === 0 || saving || isFutureDate}
                    onClick={openPreview}
                  >
                    {isQuickCorrectionMode ? 'Mark matched Present' : 'Apply Present List'}
                  </button>
                  <button type="button" className="btn-secondary min-h-8" disabled={saving} onClick={clearQuick}>
                    Clear
                  </button>
                  {quickResult && (
                    <span className="text-xs font-semibold text-emerald-600">
                      {isQuickCorrectionMode
                        ? `${quickResult.matchedCount} updated, rest unchanged`
                        : `${quickResult.matchedCount} present, rest absent`}
                    </span>
                  )}
                </div>
                {quickResult && (quickResult.notFound.length > 0 || quickResult.ambiguous.length > 0) && (
                  <div className="mt-2 space-y-1">
                    {quickResult.notFound.length > 0 && (
                      <p className="text-xs font-medium text-status-red">
                        Not found: {quickResult.notFound.join(', ')}
                      </p>
                    )}
                    {quickResult.ambiguous.length > 0 && (
                      <p className="text-xs font-medium text-amber-600">
                        Matched more than one (please check): {quickResult.ambiguous.join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <AttendanceCalendarCard
              selectedDate={date}
              maxDate={maxAttendanceDate}
              monthKey={calendarMonth}
              onMonthChange={changeCalendarMonth}
              onDateChange={changeAttendanceDate}
              hasSavedAttendance={hasSavedAttendance}
            />
          </div>
        </div>

        {busy ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-11 animate-pulse rounded-button bg-border/50" />
            ))}
          </div>
        ) : roster.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">{messages.emptyState.noStudents}</p>
        ) : (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead className="bg-surface">
                <tr>
                  <th className="border-b border-border px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted">Student</th>
                  <th className="border-b border-border px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted">Roll</th>
                  <th className="border-b border-border px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted">Status</th>
                  <th className="border-b border-border px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted">Today</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoster.map((student) => {
                  const activeStatus = statusById[student.id] ?? 'present';
                  const studentCode = student.enrollmentNumber ?? student.id.slice(0, 8);
                  return (
                    <tr key={student.id} className="transition-colors hover:bg-background">
                      <td className="border-b border-border px-4 py-2">
                        <div className="flex items-center gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-tint text-[11px] font-bold text-accent">
                            {initials(student.name)}
                          </span>
                          <span className="font-semibold text-text">{student.name}</span>
                        </div>
                      </td>
                      <td className="border-b border-border px-4 py-2 text-sm font-medium text-muted">{studentCode}</td>
                      <td className="border-b border-border px-4 py-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${todayPercentClass(activeStatus)}`}>
                          {todayPercentLabel(activeStatus)}
                        </span>
                      </td>
                      <td className="border-b border-border px-4 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {STATUS_OPTIONS.map((option) => {
                            const isActive = activeStatus === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                aria-pressed={isActive}
                                aria-label={`${option.label} for ${student.name}`}
                                className={statusButtonClass(isActive, option.activeClass)}
                                disabled={saving || busy || isFutureDate}
                                onClick={() => setStudentStatus(student.id, option.value)}
                              >
                                {option.shortLabel}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!busy && roster.length > 0 && (
          <ul className="divide-y divide-border md:hidden">
            {filteredRoster.map((student) => {
              const activeStatus = statusById[student.id] ?? 'present';
              const studentCode = student.enrollmentNumber ?? student.id.slice(0, 8);
              return (
                <li key={student.id} className="flex flex-col gap-3 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-tint text-xs font-bold text-accent">
                        {initials(student.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-text">{student.name}</p>
                        <p className="text-xs font-medium text-muted">{studentCode}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${todayPercentClass(activeStatus)}`}>
                      {todayPercentLabel(activeStatus)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_OPTIONS.map((option) => {
                      const isActive = activeStatus === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={isActive}
                          aria-label={`${option.label} for ${student.name}`}
                          className={statusButtonClass(isActive, option.activeClass)}
                          disabled={saving || busy || isFutureDate}
                          onClick={() => setStudentStatus(student.id, option.value)}
                        >
                          {option.shortLabel}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showConfirm && preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col rounded-card border border-border bg-surface shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold text-text">Confirm attendance</h2>
              <p className="mt-1 text-sm text-muted">
                {preview.matched.length} student{preview.matched.length === 1 ? '' : 's'} will be marked
                {isQuickCorrectionMode
                  ? ' Present. All other attendance entries will stay unchanged.'
                  : ` Present. The remaining ${Math.max(roster.length - preview.matched.length, 0)} will be marked Absent.`}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {preview.matched.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">
                  No students matched the pasted roll numbers.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {preview.matched.map((match) => {
                    const student = roster.find((item) => item.id === match.id);
                    return (
                      <li
                        key={match.id}
                        className="flex items-center justify-between gap-3 rounded-button bg-background px-3 py-2 text-sm"
                      >
                        <span className="font-semibold text-text">{student?.name ?? match.id}</span>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          ({match.token})
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {(preview.notFound.length > 0 || preview.ambiguous.length > 0) && (
                <div className="mt-3 space-y-1">
                  {preview.notFound.length > 0 && (
                    <p className="text-xs font-medium text-status-red">
                      Not found: {preview.notFound.join(', ')}
                    </p>
                  )}
                  {preview.ambiguous.length > 0 && (
                    <p className="text-xs font-medium text-amber-600">
                      Matched more than one (please check): {preview.ambiguous.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button type="button" className="btn-secondary min-h-10" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                ref={confirmButtonRef}
                className="btn-primary min-h-10 bg-emerald-500 hover:bg-emerald-600"
                onClick={confirmApply}
              >
                Confirm &amp; Mark
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
