// @ts-nocheck
import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  type AttendanceStatus,
  type AttendanceStatusMark,
  type PeriodKey,
} from '@domain/services/attendanceService';
import { messages } from '@domain/shared/messages';
import { applyAbsentList, applyPresentList, previewPresentList, type PresentListPreview } from '@domain/services/quickAttendance';
import {
  Alert,
  Toast,
  Button,
  IconButton,
  Card,
  SearchInput,
  Select,
  Checkbox,
  Badge,
  SkeletonLoader,
  Popover,
} from '@presentation/components/ui';

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

export interface StudentAttendanceOverall {
  readonly studentId: string;
  readonly present: number;
  readonly total: number;
}

export type LoadRoster = (sectionId: string) => Promise<RosterStudent[]>;

export interface AttendanceRangeReportRow {
  readonly studentId: string;
  readonly present: number;
  readonly total: number;
}

export interface AttendanceRangeReportResult {
  readonly tallies: readonly AttendanceRangeReportRow[];
  /** Distinct dates with at least one recorded row in the range (classes held). */
  readonly heldDates: readonly string[];
}

export interface AttendancePeriodMeta {
  readonly lastSavedAt: string | null;
}

export interface AttendancePersistence {
  loadStatusPeriod(key: PeriodKey): Promise<AttendanceStatusMark[]>;
  saveStatusPeriod(key: PeriodKey, marks: AttendanceStatusMark[]): Promise<void>;
  loadStudentOverall(scope: { readonly sectionId: string; readonly subjectId?: string }): Promise<StudentAttendanceOverall[]>;
  /** Load a per-student present/total report for an inclusive date range. */
  loadRangeReport(scope: {
    readonly sectionId: string;
    readonly subjectId?: string;
    readonly fromDate: string;
    readonly toDate: string;
  }): Promise<AttendanceRangeReportResult>;
  loadStatusRangeReport?: (scope: {
    readonly sectionId: string;
    readonly subjectId?: string;
    readonly fromDate: string;
    readonly toDate: string;
  }) => Promise<{ records: Array<{ date: string; status: string; studentId: string }> }>;
  loadMarkedSlots(scope: {
    readonly sectionId: string;
    readonly subjectId?: string;
    readonly date: string;
  }): Promise<string[]>;
  loadMarkedDates(scope: {
    readonly sectionId: string;
    readonly subjectId?: string;
    readonly fromDate: string;
    readonly toDate: string;
  }): Promise<string[]>;
  loadPeriodMeta(key: PeriodKey): Promise<AttendancePeriodMeta>;
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
  readonly unmarked: number;
  readonly counted: number;
  readonly percent: number;
}

type PeriodSelector = 'section' | 'subject' | 'timeSlot' | 'date';

interface PendingPeriodChange {
  readonly section?: string;
  readonly subject?: string;
  readonly timeSlot?: string;
  readonly date?: string;
}

const STATUS_OPTIONS: Array<{
  readonly value: AttendanceStatus;
  readonly label: string;
  readonly shortLabel: string;
}> = [
  { value: 'present', label: 'Present', shortLabel: 'P' },
  { value: 'absent', label: 'Absent', shortLabel: 'A' },
  { value: 'leave', label: 'Leave', shortLabel: 'L' },
  { value: 'not-applicable', label: 'N/A', shortLabel: 'NA' },
];

function todayIso(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(`${iso}T00:00:00`),
  );
}

function summarize(statuses: ReadonlyArray<AttendanceStatus | undefined>): StatusSummary {
  let present = 0;
  let absent = 0;
  let leave = 0;
  let notApplicable = 0;
  let unmarked = 0;

  for (const status of statuses) {
    if (status === 'present') present += 1;
    if (status === 'absent') absent += 1;
    if (status === 'leave') leave += 1;
    if (status === 'not-applicable') notApplicable += 1;
    if (status === undefined) unmarked += 1;
  }

  const counted = present + absent;
  return {
    present,
    absent,
    leave,
    notApplicable,
    unmarked,
    counted,
    percent: counted === 0 ? 0 : Math.round((present / counted) * 100),
  };
}

function savedStatusMapFromMarks(saved: readonly AttendanceStatusMark[]): Record<string, AttendanceStatus> {
  return Object.fromEntries(saved.map((mark) => [mark.studentId, mark.status]));
}

function isCountedStatus(status: AttendanceStatus | undefined): status is 'present' | 'absent' {
  return status === 'present' || status === 'absent';
}

function percentageFromTally(tally: Pick<StudentAttendanceOverall, 'present' | 'total'> | null): number | null {
  if (!tally || tally.total <= 0) return null;
  return Math.round((tally.present / tally.total) * 100);
}

function projectOverallTally(
  base: StudentAttendanceOverall | undefined,
  savedStatus: AttendanceStatus | undefined,
  currentStatus: AttendanceStatus | undefined,
  includeCurrentPeriod: boolean,
): Pick<StudentAttendanceOverall, 'present' | 'total'> | null {
  let present = base?.present ?? 0;
  let total = base?.total ?? 0;

  if (includeCurrentPeriod) {
    if (isCountedStatus(savedStatus) && total > 0) {
      total -= 1;
      if (savedStatus === 'present' && present > 0) {
        present -= 1;
      }
    }
    if (isCountedStatus(currentStatus)) {
      total += 1;
      if (currentStatus === 'present') {
        present += 1;
      }
    }
  }

  return total > 0 ? { present, total } : null;
}

type QuickListMode = 'present' | 'absent';

type SummaryTone = 'present' | 'absent' | 'total';

const summaryToneClass: Record<SummaryTone, { border: string; bar: string; chip: string; fill: string }> = {
  present: {
    border: 'border-emerald-200/80',
    bar: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    fill: 'bg-emerald-500',
  },
  absent: {
    border: 'border-red-200/80',
    bar: 'bg-red-500',
    chip: 'bg-red-50 text-red-700 ring-red-100',
    fill: 'bg-red-500',
  },
  total: {
    border: 'border-sky-200/80',
    bar: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-700 ring-sky-100',
    fill: 'bg-sky-500',
  },
};

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseLocalDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function toIsoDate(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function monthBounds(iso: string): { readonly fromDate: string; readonly toDate: string } {
  const dateValue = parseLocalDate(iso);
  const first = new Date(dateValue.getFullYear(), dateValue.getMonth(), 1);
  const last = new Date(dateValue.getFullYear(), dateValue.getMonth() + 1, 0);
  return { fromDate: toIsoDate(first), toDate: toIsoDate(last) };
}

function monthCalendarDays(iso: string): string[] {
  const dateValue = parseLocalDate(iso);
  const first = new Date(dateValue.getFullYear(), dateValue.getMonth(), 1);
  const last = new Date(dateValue.getFullYear(), dateValue.getMonth() + 1, 0);
  const days: string[] = [];
  for (let cursor = first; cursor <= last; cursor = addDays(cursor, 1)) {
    days.push(toIsoDate(cursor));
  }
  return days;
}

function nearbyCalendarDays(iso: string): string[] {
  const center = parseLocalDate(iso);
  const days: string[] = [];
  for (let offset = -10; offset <= 10; offset += 1) {
    days.push(toIsoDate(addDays(center, offset)));
  }
  return days;
}

function shiftMonth(iso: string, offset: number): string {
  const dateValue = parseLocalDate(iso);
  return toIsoDate(new Date(dateValue.getFullYear(), dateValue.getMonth() + offset, 1));
}


function formatWeekdayShort(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(parseLocalDate(iso));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function statusLabel(status: AttendanceStatus): string {
  if (status === 'not-applicable') return 'N/A';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function SummaryTile({
  label,
  value,
  tone,
  shortLabel,
  fillPercent,
}: {
  readonly label: string;
  readonly value: number;
  readonly tone: SummaryTone;
  readonly shortLabel: string;
  readonly fillPercent: number;
}) {
  const toneClasses = summaryToneClass[tone];
  const width = `${Math.max(0, Math.min(100, fillPercent))}%`;

  return (
    <article
      className={`relative min-h-[4.5rem] overflow-hidden rounded-card border ${toneClasses.border} bg-surface px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)]`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${toneClasses.bar}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold leading-none text-text">{value}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-button text-xs font-bold ring-1 ${toneClasses.chip}`}>
          {shortLabel}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className={`h-full rounded-full ${toneClasses.fill}`} style={{ width }} />
      </div>
    </article>
  );
}

const overallToneClass = {
  empty: 'bg-surface-muted text-muted',
  low: 'bg-red-50 text-red-700',
  watch: 'bg-amber-50 text-amber-700',
  healthy: 'bg-emerald-50 text-emerald-700',
} as const;

function overallBadgeClass(percent: number | null): string {
  if (percent === null) return overallToneClass.empty;
  if (percent < 60) return overallToneClass.low;
  if (percent < 75) return overallToneClass.watch;
  return overallToneClass.healthy;
}

const AttendanceTableRow = memo(function AttendanceTableRow({
  student,
  status,
  overallPercent,
  overallLoading,
  isSelected,
  onStatusChange,
  onToggleSelection,
  index,
  disabled
}: {
  student: RosterStudent;
  status: AttendanceStatus | undefined;
  overallPercent: number | null;
  overallLoading: boolean;
  isSelected: boolean;
  onStatusChange: (studentId: string, status: AttendanceStatus) => void;
  onToggleSelection: (studentId: string, index: number, shiftKey: boolean) => void;
  onClick?: (studentId: string) => void;
  index: number;
  disabled: boolean;
}) {
  const studentCode = student.enrollmentNumber ?? student.id.slice(0, 8);

  const initials = student.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  let percentColor = 'text-text-muted';
  let percentBg = 'bg-transparent';
  if (overallPercent !== null) {
    if (overallPercent >= 75) { percentColor = 'text-[#166534]'; percentBg = 'bg-[#dcfce7]'; }
    else if (overallPercent >= 60) { percentColor = 'text-[#854d0e]'; percentBg = 'bg-[#fef08a]'; }
    else { percentColor = 'text-[#9f1239]'; percentBg = 'bg-[#ffe4e6]'; }
  }

  // Calculate pseudo-random streak based on ID for demo purposes
  const pseudoStreak = student.id.length > 5 && student.id.charCodeAt(0) % 3 === 0 ? (student.id.charCodeAt(1) % 7) + 2 : 0;

  const rowBg = status === 'absent' ? 'bg-red-50/80' : 'bg-white';
  const leftIndicator = status === 'absent' ? 'bg-red-500' : 'bg-transparent';
  
  return (
    <motion.tr
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30, delay: Math.min(index * 0.02, 0.2) }}
      onClick={() => onClick?.(student.id)}
      className={`group cursor-pointer transition-all duration-300 ${rowBg} hover:shadow-md hover:-translate-y-[2px] block sm:table-row bg-white rounded-xl sm:rounded-none mb-3 sm:mb-0 shadow-sm sm:shadow-none border border-border sm:border-transparent relative`}
    >
      <td className="hidden sm:table-cell w-8 sm:w-10 text-center py-3.5 rounded-l-xl relative">
        <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-2/3 w-[5px] rounded-r-md ${leftIndicator} transition-colors`} />
        <span className="text-[11px] font-bold text-[#9ca3af] group-hover:text-text transition-colors">{index + 1}</span>
      </td>
      <td className="flex justify-between items-start sm:table-cell min-w-[140px] px-3 sm:px-2 pt-3 sm:pt-3.5 pb-2 sm:pb-3.5">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 shrink-0 rounded-full bg-white border border-border flex items-center justify-center text-[11px] font-bold ${percentColor}`}>
            {initials}
          </div>
          <div className="flex flex-col justify-center">
            <span className="font-semibold text-text text-sm leading-tight">{student.name}</span>
            <span className="text-muted font-medium text-[11px] leading-tight mt-0.5">{studentCode}</span>
          </div>
        </div>
        
        {/* Mobile percentage view */}
        <div className="sm:hidden shrink-0">
          <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${leftIndicator} transition-colors`} />
          {overallLoading ? (
            <span className="text-xs text-muted">...</span>
          ) : overallPercent === null ? (
            <span className="text-xs text-muted">--</span>
          ) : (
            <span className={`inline-flex px-1.5 py-0.5 rounded-[4px] text-[11px] font-bold ${percentBg} ${percentColor}`}>
              {overallPercent}%
            </span>
          )}
        </div>
      </td>
      <td className="hidden sm:table-cell py-3.5">
        {overallLoading ? (
          <span className="text-xs text-muted">...</span>
        ) : overallPercent === null ? (
          <span className="text-xs text-muted">--</span>
        ) : (
          <span className={`inline-flex px-1.5 py-0.5 rounded-[4px] text-[11px] font-bold ${percentBg} ${percentColor}`}>
            {overallPercent}%
          </span>
        )}
      </td>
      <td className="block sm:table-cell px-3 sm:px-2 pb-3 sm:pb-3.5 pt-1 sm:pt-3.5 pr-3 sm:pr-4 rounded-r-xl">
        <div className="flex items-center gap-1.5 sm:gap-1 w-full sm:w-auto">
          {STATUS_OPTIONS.filter(opt => opt.value !== 'not-applicable').map(opt => {
            const isActive = status === opt.value;
            let activeStyle = '';
            if (isActive) {
              if (opt.value === 'present') activeStyle = 'border-emerald-500 text-emerald-700 bg-emerald-50 shadow-sm ring-2 ring-emerald-500/20';
              else if (opt.value === 'absent') activeStyle = 'border-red-500 text-red-700 bg-red-50 shadow-sm ring-2 ring-red-500/20';
              else if (opt.value === 'leave') activeStyle = 'border-amber-500 text-amber-700 bg-amber-50 shadow-sm ring-2 ring-amber-500/20';
            } else {
              activeStyle = 'border-transparent bg-[#f4f0e6] text-[#7a7268] hover:bg-[#e8e4db] hover:text-text';
            }

            return (
              <button
                key={opt.value}
                disabled={disabled}
                onClick={(e) => { e.stopPropagation(); onStatusChange(student.id, opt.value); }}
                className={`flex-1 sm:flex-none sm:w-6 h-8 sm:h-6 flex items-center justify-center rounded-[5px] sm:rounded-[3px] border text-[13px] font-medium transition-all duration-150 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${activeStyle}`}
                title={opt.label}
              >
                <span className="sm:hidden font-semibold">{opt.label}</span>
                <span className="hidden sm:inline">{opt.shortLabel.charAt(0)}</span>
              </button>
            )
          })}
        </div>
      </td>
    </motion.tr>
  )
});


export default function AttendanceView(props: AttendanceViewProps) {
  const { sections, subjects, timeSlots, loadRoster, attendance, initialDate } = props;
  const maxAttendanceDate = useMemo(() => todayIso(), []);
  const initialAttendanceDate = initialDate && initialDate <= maxAttendanceDate ? initialDate : maxAttendanceDate;

  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [date, setDate] = useState(initialAttendanceDate);
  const [visibleMonthDate, setVisibleMonthDate] = useState(initialAttendanceDate);

  const [roster, setRoster] = useState<readonly RosterStudent[]>([]);
  const [statusById, setStatusById] = useState<Record<string, AttendanceStatus | undefined>>({});
  const [savedStatusById, setSavedStatusById] = useState<Record<string, AttendanceStatus>>({});
  const [overallById, setOverallById] = useState<Record<string, StudentAttendanceOverall>>({});
  const [overallLoading, setOverallLoading] = useState(false);
  const [overallRefreshVersion, setOverallRefreshVersion] = useState(0);
  const [markedSlots, setMarkedSlots] = useState<Set<string>>(new Set());
  const [markedDates, setMarkedDates] = useState<Set<string>>(new Set());
  const [periodMeta, setPeriodMeta] = useState<AttendancePeriodMeta>({ lastSavedAt: null });
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [rosterLoading, setRosterLoading] = useState(false);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [hasSavedAttendance, setHasSavedAttendance] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // Quick mark state
  const [quickListMode, setQuickListMode] = useState<QuickListMode>('present');
  const [presentInput, setPresentInput] = useState('');
  const [quickResult, setQuickResult] = useState<{
    matchedCount: number;
    notFound: string[];
    ambiguous: string[];
  } | null>(null);
  const [pendingSaveMarks, setPendingSaveMarks] = useState<AttendanceStatusMark[] | null>(null);
  const [trendData, setTrendData] = useState<{ date: string; percent: number }[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [focusedStudentId, setFocusedStudentId] = useState<string | null>(null);
  const [quickMarkOpen, setQuickMarkOpen] = useState(false);
  const [preview, setPreview] = useState<PresentListPreview | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingPeriodChange, setPendingPeriodChange] = useState<PendingPeriodChange | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  const stagePeriodChange = useCallback((selector: PeriodSelector, value: string) => {
    setPendingPeriodChange((previous) => ({ ...(previous ?? {}), [selector]: value }));
  }, []);

  const commitPeriodChange = useCallback((change: PendingPeriodChange) => {
    if (change.section !== undefined) {
      setSectionId(change.section);
    }
    if (change.subject !== undefined) {
      setSubjectId(change.subject);
    }
    if (change.timeSlot !== undefined) {
      setTimeSlot(change.timeSlot);
    }
    if (change.date !== undefined) {
      setDate(change.date);
    }
  }, []);

  const requestPeriodChange = useCallback((selector: PeriodSelector, value: string) => {
    const currentValue =
      selector === 'section' ? sectionId :
      selector === 'subject' ? subjectId :
      selector === 'timeSlot' ? timeSlot :
      date;

    if (value === currentValue) {
      return;
    }

    if (dirty) {
      stagePeriodChange(selector, value);
      return;
    }

    if (selector === 'date') {
      setVisibleMonthDate(value);
    }
    commitPeriodChange({ [selector]: value });
  }, [commitPeriodChange, date, dirty, sectionId, stagePeriodChange, subjectId, timeSlot]);

  useEffect(() => {
    const nextSectionId = sections[0]?.id ?? '';
    if (sections.some((section) => section.id === sectionId)) {
      return;
    }
    if (dirty) {
      stagePeriodChange('section', nextSectionId);
      return;
    }
    setSectionId(nextSectionId);
  }, [dirty, sectionId, sections, stagePeriodChange]);

  useEffect(() => {
    const nextSubjectId = subjects[0]?.id ?? '';
    if (subjects.some((subject) => subject.id === subjectId)) {
      return;
    }
    if (dirty) {
      stagePeriodChange('subject', nextSubjectId);
      return;
    }
    setSubjectId(nextSubjectId);
  }, [dirty, stagePeriodChange, subjectId, subjects]);

  useEffect(() => {
    const nextTimeSlot = timeSlots[0] ?? '';
    if (timeSlots.includes(timeSlot)) {
      return;
    }
    if (dirty) {
      stagePeriodChange('timeSlot', nextTimeSlot);
      return;
    }
    setTimeSlot(nextTimeSlot);
  }, [dirty, stagePeriodChange, timeSlot, timeSlots]);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!sectionId) {
      setRoster([]);
      setStatusById({});
      setSavedStatusById({});
      setHasSavedAttendance(false);
      return;
    }

    let active = true;
    setRosterLoading(true);
    setLoadError(false);
    setSelectedRows(new Set());

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
        setSavedStatusById({});
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
    if (!sectionId || !subjectId) {
      setOverallById({});
      setOverallLoading(false);
      return;
    }

    let active = true;
    setOverallLoading(true);

    void attendance
      .loadStudentOverall({ sectionId, subjectId })
      .then((overall) => {
        if (!active) return;
        setOverallById(Object.fromEntries(overall.map((item) => [item.studentId, item])));
        setOverallLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setOverallById({});
        setOverallLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attendance, overallRefreshVersion, sectionId, subjectId]);

  useEffect(() => {
    if (!sectionId || !subjectId || !date) {
      setMarkedSlots(new Set());
      return;
    }

    let active = true;
    void attendance
      .loadMarkedSlots({ sectionId, subjectId, date })
      .then((slots) => {
        if (!active) return;
        setMarkedSlots(new Set(slots));
      })
      .catch(() => {
        if (!active) return;
        setMarkedSlots(new Set());
      });

    return () => {
      active = false;
    };
  }, [attendance, date, overallRefreshVersion, sectionId, subjectId]);

  useEffect(() => {
    if (!sectionId || !subjectId || !visibleMonthDate) {
      setMarkedDates(new Set());
      return;
    }

    const { fromDate, toDate } = monthBounds(visibleMonthDate);
    let active = true;
    void attendance
      .loadMarkedDates({ sectionId, subjectId, fromDate, toDate })
      .then((dates) => {
        if (!active) return;
        setMarkedDates(new Set(dates));
      })
      .catch(() => {
        if (!active) return;
        setMarkedDates(new Set());
      });

    return () => {
      active = false;
    };
  }, [attendance, overallRefreshVersion, sectionId, subjectId, visibleMonthDate]);

  useEffect(() => {
    if (!attendance.loadStatusRangeReport || !sectionId || roster.length === 0) {
      setTrendData([]);
      return;
    }
    let active = true;
    setTrendLoading(true);
    const toDate = date; // today or selected date
    const fromDate = new Date(new Date(date).getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    void attendance.loadStatusRangeReport({ sectionId, subjectId, fromDate, toDate })
      .then((report) => {
        if (!active) return;
        // Compute daily percentages
        const dailyCounts: Record<string, { present: number; total: number }> = {};
        for (const record of report.records) {
          if (!dailyCounts[record.date]) {
            dailyCounts[record.date] = { present: 0, total: 0 };
          }
          if (record.status === 'present' || record.status === 'absent') {
            dailyCounts[record.date].total += 1;
            if (record.status === 'present') {
              dailyCounts[record.date].present += 1;
            }
          }
        }
        
        // Build 7 days array
        const result = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(new Date(date).getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const counts = dailyCounts[d];
          const percent = counts && counts.total > 0 ? Math.round((counts.present / counts.total) * 100) : 0;
          result.push({ date: d, percent });
        }
        setTrendData(result);
        setTrendLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setTrendData([]);
        setTrendLoading(false);
      });
    return () => { active = false; };
  }, [attendance, sectionId, subjectId, date, roster, overallRefreshVersion]);

  useEffect(() => {
    if (!periodKey || roster.length === 0) {
      setStatusById({});
      setSavedStatusById({});
      setHasSavedAttendance(false);
      setPeriodMeta({ lastSavedAt: null });
      setDirty(false);
      return;
    }

    let active = true;
    setPeriodLoading(true);
    setLoadError(false);
    setSavedMessage(null);
    setSelectedRows(new Set());

    void Promise.all([
      attendance.loadStatusPeriod(periodKey),
      attendance.loadPeriodMeta(periodKey),
    ])
      .then(([saved, meta]) => {
        if (!active) return;
        setHasSavedAttendance(saved.length > 0);
        setSavedStatusById(savedStatusMapFromMarks(saved));
        setStatusById(savedStatusMapFromMarks(saved));
        setPeriodMeta(meta);
        setDirty(false);
        setPeriodLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setSavedStatusById({});
        setPeriodMeta({ lastSavedAt: null });
        setPeriodLoading(false);
        setLoadError(true);
      });

    return () => {
      active = false;
    };
  }, [attendance, periodKey, roster]);

  useEffect(() => {
    if (!savedMessage) return;
    const timer = window.setTimeout(() => setSavedMessage(null), 3500);
    return () => window.clearTimeout(timer);
  }, [savedMessage]);

  const busy = rosterLoading || periodLoading;
  const isFutureDate = date > maxAttendanceDate;
  const saveDisabled = !periodKey || roster.length === 0 || saving || isFutureDate;
  const quickMarkMode = hasSavedAttendance ? 'correction' : 'first-time';
  const isQuickCorrectionMode = quickMarkMode === 'correction';
  const monthDays = useMemo(() => monthCalendarDays(visibleMonthDate), [visibleMonthDate]);
  const compactCalendarDays = useMemo(() => nearbyCalendarDays(date), [date]);
  const displayedCalendarDays = calendarExpanded ? monthDays : compactCalendarDays;

  const [headerContainer, setHeaderContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHeaderContainer(document.getElementById('attendance-header-actions'));
  }, []);

  const filteredRoster = useMemo(() => {
    let result = roster;
    const query = searchQuery.trim().toLowerCase();

    if (query) {
      result = result.filter(
        (student) =>
          student.name.toLowerCase().includes(query) ||
          (student.enrollmentNumber ?? '').toLowerCase().includes(query),
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((student) =>
        statusFilter === 'unmarked'
          ? statusById[student.id] === undefined
          : statusById[student.id] === statusFilter,
      );
    }

    return result;
  }, [roster, searchQuery, statusFilter, statusById]);

  const summary = useMemo(
    () => summarize(roster.map((student) => statusById[student.id])),
    [roster, statusById],
  );

  const overallPercentById = useMemo(() => {
    const next: Record<string, number | null> = {};
    for (const student of roster) {
      const tally = projectOverallTally(
        overallById[student.id],
        savedStatusById[student.id],
        statusById[student.id],
        dirty,
      );
      next[student.id] = percentageFromTally(tally);
    }
    return next;
  }, [dirty, overallById, roster, savedStatusById, statusById]);

  const setStudentStatus = useCallback((studentId: string, status: AttendanceStatus) => {
    if (isFutureDate) return;
    setValidationMessage(null);
    setSavedMessage(null);
    setDirty(true);
    setStatusById((prev) => ({ ...prev, [studentId]: status }));
  }, [isFutureDate]);

  const toggleRowSelection = useCallback((id: string, index: number, shiftKey: boolean) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        for (let i = start; i <= end; i++) {
          next.add(filteredRoster[i].id);
        }
      } else {
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
    setLastSelectedIndex(index);
  }, [filteredRoster, lastSelectedIndex]);

  const toggleAllSelection = useCallback(() => {
    if (selectedRows.size === filteredRoster.length && filteredRoster.length > 0) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredRoster.map(s => s.id)));
    }
  }, [filteredRoster, selectedRows.size]);

  const bulkMark = useCallback((status: AttendanceStatus) => {
    if (selectedRows.size === 0 || isFutureDate) return;
    setStatusById(prev => {
      const next = { ...prev };
      for (const id of selectedRows) {
        next[id] = status;
      }
      return next;
    });
    setDirty(true);
    setValidationMessage(null);
    setSavedMessage(`Marked ${selectedRows.size} students as ${statusLabel(status)}.`);
    setSelectedRows(new Set());
  }, [isFutureDate, selectedRows]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        setSelectedRows(new Set());
      } else if (e.key === 'p' || e.key === 'P') {
        if (selectedRows.size > 0) bulkMark('present');
      } else if (e.key === 'a' || e.key === 'A') {
        if (selectedRows.size > 0) bulkMark('absent');
      } else if (e.key === 'l' || e.key === 'L') {
        if (selectedRows.size > 0) bulkMark('leave');
      } else if (e.key === 'n' || e.key === 'N') {
        if (selectedRows.size > 0) bulkMark('not-applicable');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRows.size, bulkMark]);

  function openPreview() {
    if (isFutureDate) return;
    setPreview(previewPresentList(roster, presentInput));
    setShowConfirm(true);
  }

  function confirmApply() {
    if (isFutureDate) return;
    const result = quickListMode === 'present'
      ? applyPresentList(roster, presentInput, { mode: 'correction' })
      : applyAbsentList(roster, presentInput, { mode: 'correction' });
    setStatusById((prev) => ({ ...prev, ...result.statusById }));
    setQuickResult({
      matchedCount: result.matchedCount,
      notFound: result.notFound,
      ambiguous: result.ambiguous,
    });
    setValidationMessage(null);
    setSavedMessage(null);
    setDirty(true);
    setShowConfirm(false);
  }

  function clearQuick() {
    setPresentInput('');
    setQuickResult(null);
  }

  function buildSaveMarks(): AttendanceStatusMark[] | null {
    const marked = roster.filter((student) => statusById[student.id] !== undefined);
    const unmarked = roster.filter((student) => statusById[student.id] === undefined);

    if (unmarked.length === 0) {
      return roster.map((student) => ({
        studentId: student.id,
        status: statusById[student.id] as AttendanceStatus,
      }));
    }

    if (hasSavedAttendance) {
      setValidationMessage(`Mark all students before saving. ${unmarked.length} student${unmarked.length === 1 ? '' : 's'} still unmarked.`);
      return null;
    }

    if (marked.length === 0) {
      setValidationMessage('Mark at least one student before saving fresh attendance.');
      return null;
    }

    return roster.map((student) => ({
      studentId: student.id,
      status: statusById[student.id] ?? 'absent',
    }));
  }

  function countMarks(marks: readonly AttendanceStatusMark[]): StatusSummary {
    return summarize(marks.map((mark) => mark.status));
  }

  async function saveAttendance(nextMarks: AttendanceStatusMark[]) {
    if (!periodKey || roster.length === 0 || isFutureDate) {
      return;
    }

    setSaving(true);
    setLoadError(false);
    setValidationMessage(null);
    setSavedMessage(null);
    try {
      await attendance.saveStatusPeriod(
        periodKey,
        nextMarks,
      );
      setOverallById((previous) => {
        const next = { ...previous };
        for (const mark of nextMarks) {
          const tally = projectOverallTally(
            previous[mark.studentId],
            savedStatusById[mark.studentId],
            mark.status,
            true,
          );
          if (tally) {
            next[mark.studentId] = { studentId: mark.studentId, present: tally.present, total: tally.total };
          } else {
            delete next[mark.studentId];
          }
        }
        return next;
      });
      setSavedStatusById(savedStatusMapFromMarks(nextMarks));
      setOverallRefreshVersion((version) => version + 1);
      setHasSavedAttendance(true);
      setPeriodMeta({ lastSavedAt: new Date().toISOString() });
      setDirty(false);
      setStatusById(savedStatusMapFromMarks(nextMarks));
      setPendingSaveMarks(null);
      setSavedMessage(`Attendance saved for ${formatDate(periodKey.date)}`);
    } catch {
      setLoadError(true);
    } finally {
      setSaving(false);
    }
  }

  function requestSaveAttendance() {
    if (!periodKey || roster.length === 0 || isFutureDate) {
      return;
    }
    setValidationMessage(null);
    const nextMarks = buildSaveMarks();
    if (!nextMarks) {
      return;
    }
    setPendingSaveMarks(nextMarks);
  }

  function confirmSaveAttendance() {
    if (!pendingSaveMarks) {
      return;
    }
    void saveAttendance(pendingSaveMarks);
  }

  function discardPendingPeriodChange() {
    if (!pendingPeriodChange) {
      return;
    }
    if (pendingPeriodChange.date) {
      setVisibleMonthDate(pendingPeriodChange.date);
    }
    commitPeriodChange(pendingPeriodChange);
    setPendingPeriodChange(null);
    setDirty(false);
    setSavedMessage(null);
    setSelectedRows(new Set());
  }

  function showPreviousMonth() {
    setVisibleMonthDate((current) => shiftMonth(current, -1));
  }

  function showNextMonth() {
    setVisibleMonthDate((current) => shiftMonth(current, 1));
  }

  function showCurrentMonth() {
    setVisibleMonthDate(date);
  }

  function showTodayDate() {
    setVisibleMonthDate(maxAttendanceDate);
    requestPeriodChange('date', maxAttendanceDate);
  }

  const toastBottomClass = selectedRows.size > 0 ? 'bottom-28 sm:bottom-24' : 'bottom-4';
  const renderSaveButton = (className = '') => (
    <Button
      variant="primary"
      size="sm"
      disabled={saveDisabled}
      loading={saving}
      className={className}
      onClick={requestSaveAttendance}
    >
      Save Attendance
    </Button>
  );
  const pendingSaveSummary = pendingSaveMarks ? countMarks(pendingSaveMarks) : null;

  function markAllPresent() {
    if (saveDisabled) return;
    setStatusById((prev) => {
      const next = { ...prev };
      for (const student of roster) {
        next[student.id] = 'present';
      }
      return next;
    });
    setDirty(true);
  }

  const headerPortal = headerContainer ? createPortal(
    <div className="flex flex-wrap items-center gap-2">
      <Button 
        variant="secondary" 
        size="sm" 
        disabled={saveDisabled} 
        onClick={markAllPresent}
        className="font-medium bg-surface hover:bg-surface-muted text-text-muted border-border"
      >
        <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
        </svg>
        Mark All Present
      </Button>
      {renderSaveButton('bg-[#2c2822] hover:bg-[#37322B] text-white')}
    </div>,
    headerContainer
  ) : null;

  return (
    <div className="flex flex-col gap-6 pb-24">
      {headerPortal}
      {loadError && (
        <Alert tone="danger" title="Unable to load attendance">
          {messages.error.generic}
        </Alert>
      )}

      {validationMessage && (
        <Alert tone="danger" title="Attendance incomplete">
          {validationMessage}
        </Alert>
      )}

      {isFutureDate && (
        <Alert tone="danger" title="Future attendance blocked">
          Attendance can only be marked for today or past dates.
        </Alert>
      )}

      {!busy && periodKey && roster.length > 0 && !hasSavedAttendance && !dirty && (
        <div className="inline-flex w-fit max-w-full items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden="true" />
          Fresh attendance: mark one Present to auto-mark the rest Absent.
        </div>
      )}

      {/* Top Summary Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface-muted/50 p-4 sm:p-5 rounded-2xl border border-border mt-2">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-surface p-2 sm:p-2.5 rounded-xl border border-border shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
            Present: <strong className="ml-0.5">{summary.present}</strong>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 text-rose-700 dark:text-rose-400 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"></span>
            Absent: <strong className="ml-0.5">{summary.absent}</strong>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-amber-500"></span>
            Leave: <strong className="ml-0.5">{summary.leave}</strong>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-muted border border-border text-text-muted">
            Total: <strong className="ml-0.5">{roster.length}</strong>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {roster.length > 0 && (
            <div className="inline-flex items-center rounded-full border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden="true" />
              Students below 75%: {roster.filter(s => overallPercentById[s.id] !== undefined && overallPercentById[s.id]! < 75).length}
            </div>
          )}

          <Popover
            open={quickMarkOpen}
            onOpenChange={setQuickMarkOpen}
            trigger={
              <Button variant="outline" size="sm" className="font-semibold text-text">
                Quick Mark
              </Button>
            }
            widthClass="w-80 sm:w-96"
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-emerald-950 dark:text-emerald-400">Quick Mark</h3>
                  <p className="text-[10px] font-medium text-emerald-800/75 dark:text-emerald-400/75">
                    {quickListMode === 'present' ? 'Present roll entry' : 'Absent roll entry'}
                  </p>
                </div>
                <Badge tone={isQuickCorrectionMode ? 'info' : 'success'} size="sm">
                  {isQuickCorrectionMode ? 'Correction' : 'Fresh Save'}
                </Badge>
              </div>
              <div className="flex rounded-button border border-emerald-200 dark:border-emerald-500/20 bg-white dark:bg-[#1c1c1e] p-1 text-xs font-bold">
                <button
                  type="button"
                  className={['flex-1 rounded-[6px] px-2 py-1 transition-colors', quickListMode === 'present' ? 'bg-emerald-700 text-white' : 'text-emerald-800 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'].join(' ')}
                  onClick={() => setQuickListMode('present')}
                >
                  Present
                </button>
                <button
                  type="button"
                  className={['flex-1 rounded-[6px] px-2 py-1 transition-colors', quickListMode === 'absent' ? 'bg-red-700 text-white' : 'text-emerald-800 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'].join(' ')}
                  onClick={() => setQuickListMode('absent')}
                >
                  Absent
                </button>
              </div>
              <input
                value={presentInput}
                onChange={(event) => setPresentInput(event.target.value)}
                placeholder="e.g. 001, 004, 067"
                className="h-9 rounded-button border border-border bg-background px-3 text-sm font-medium text-text placeholder:text-muted focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className={['flex-1 text-white', quickListMode === 'present' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-red-700 hover:bg-red-800'].join(' ')}
                  disabled={roster.length === 0 || saving || isFutureDate}
                  onClick={() => { setQuickMarkOpen(false); openPreview(); }}
                >
                  Mark {quickListMode === 'present' ? 'Present' : 'Absent'}
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={clearQuick}>Clear</Button>
              </div>
              {quickResult && (
                <div className="rounded-control border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-[10px]">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {quickResult.matchedCount} updated
                  </span>
                  {quickResult.notFound.length > 0 && <p className="text-status-red dark:text-red-400 mt-1">Not found: {quickResult.notFound.join(', ')}</p>}
                </div>
              )}
            </div>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 px-0 sm:px-1">
        
        {/* Left Column: Table container */}
        <div className="flex flex-col min-w-0 border-y sm:border-y-0 sm:border-t border-border bg-[#ece7db] dark:bg-transparent shadow-sm sm:rounded-card -mx-4 sm:mx-0">

        {busy ? (
          <div className="p-6 space-y-4">
            <SkeletonLoader variant="block" className="h-12 w-full" />
            <SkeletonLoader variant="block" className="h-12 w-full" />
            <SkeletonLoader variant="block" className="h-12 w-full" />
            <SkeletonLoader variant="block" className="h-12 w-full" />
          </div>
        ) : roster.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-muted">{messages.emptyState.noStudents}</p>
          </div>
        ) : filteredRoster.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-muted">No students match your filters.</p>
          </div>
        ) : (
          <div className="px-0 sm:px-2 pb-6">
            <table className="block sm:table table-base w-full border-separate border-spacing-y-2 relative text-left">
              <thead className="hidden sm:table-header-group table-head">
                <tr>
                  <th className="table-header-cell w-8 sm:w-10 text-center pb-2 px-1 sm:px-2 text-xs font-bold uppercase tracking-wider text-text/90">#</th>
                  <th className="table-header-cell pb-2 px-2 sm:px-4 text-xs font-bold uppercase tracking-wider text-text/90">Student</th>
                  <th className="table-header-cell pb-2 px-2 sm:px-4 text-xs font-bold uppercase tracking-wider text-text/90">Overall %</th>
                  <th className="table-header-cell pb-2 px-2 sm:px-4 text-xs font-bold uppercase tracking-wider text-text/90">Today's Status</th>
                </tr>
              </thead>
              <tbody className="block sm:table-row-group">
                <AnimatePresence>
                  {filteredRoster.map((student, index) => (
                    <AttendanceTableRow
                      key={student.id}
                      student={student}
                      status={statusById[student.id]}
                      overallPercent={overallPercentById[student.id] ?? null}
                      overallLoading={overallLoading}
                      isSelected={selectedRows.has(student.id)}
                      onStatusChange={setStudentStatus}
                      onToggleSelection={toggleRowSelection}
                      onClick={setFocusedStudentId}
                      index={index}
                      disabled={saving || busy || isFutureDate}
                    />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* End Left Column */}

      {/* Right Column: Quick Stats & Focus */}
      <div>
        <div className="flex flex-col gap-6 sticky top-24">
          {/* Quick Stats Widget */}
          <Card className="flex flex-col p-4 shadow-sm" padded={false}>
          <h3 className="text-sm font-bold text-text mb-4">Quick Stats (Last 7 Days)</h3>
          {trendLoading ? (
            <div className="flex justify-center py-6"><SkeletonLoader variant="block" className="h-16 w-full" /></div>
          ) : trendData.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted font-medium bg-surface-muted rounded-lg border border-dashed border-border">
              No trend data available.
            </div>
          ) : (
            <div className="flex items-end justify-between h-24 gap-1.5 mt-2">
              {trendData.map((day, idx) => {
                const dateObj = new Date(day.date);
                const isSelected = day.date === date;
                const percent = day.percent;
                // Height between 10% and 100%
                const height = Math.max(10, percent);
                return (
                  <div key={day.date} className="flex flex-col items-center flex-1 gap-2 relative group">
                    {/* Tooltip */}
                    <div className="absolute -top-8 bg-surface-inverted text-surface rounded px-2 py-1 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                      {percent}%
                    </div>
                    {/* Bar */}
                    <div className="w-full bg-surface-muted rounded-sm h-full flex flex-col justify-end overflow-hidden relative">
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: `${height}%`, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25, delay: idx * 0.05 }}
                        className={`w-full rounded-sm transition-colors duration-500 ${isSelected ? 'bg-accent shadow-[0_0_10px_rgba(0,0,0,0.1)]' : percent < 75 ? 'bg-rose-400' : 'bg-emerald-400 group-hover:bg-emerald-500'}`}
                      />
                    </div>
                    <span className={`text-[10px] font-bold ${isSelected ? 'text-accent' : 'text-muted'}`}>
                      {['S','M','T','W','T','F','S'][dateObj.getDay()]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase text-muted tracking-wider mb-1">Class Avg</p>
              <p className="text-lg font-bold text-text">
                {trendData.length > 0 
                  ? Math.round(trendData.reduce((acc, d) => acc + d.percent, 0) / trendData.filter(d => d.percent > 0).length || 1) + '%' 
                  : '--'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-muted tracking-wider mb-1">Low Attd.</p>
              <p className="text-lg font-bold text-rose-600">
                {roster.filter(s => overallPercentById[s.id] !== undefined && overallPercentById[s.id]! < 75).length}
              </p>
            </div>
          </div>
        </Card>

        {/* Student Focus Widget */}
        <Card className="flex flex-col p-4 shadow-sm" padded={false}>
          <h3 className="text-sm font-bold text-text mb-4 flex items-center justify-between">
            Student Focus
            {focusedStudentId && (
               <button onClick={() => setFocusedStudentId(null)} className="text-[10px] font-bold text-muted hover:text-text">Clear</button>
            )}
          </h3>
          {!focusedStudentId ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center border-2 border-dashed border-border rounded-xl bg-surface-muted/50">
              <svg width="24" height="24" viewBox="0 0 15 15" fill="none" className="text-muted/50 mb-2"><path d="M7.5 0.875C5.49797 0.875 3.875 2.49797 3.875 4.5C3.875 6.15288 4.98124 7.54738 6.49373 7.98351C5.2997 8.12901 4.27557 8.55134 3.50468 9.32223C2.52987 10.297 2.04233 11.7107 2.05103 13.5654C2.05141 13.6453 2.08339 13.7218 2.13992 13.7783C2.19645 13.8349 2.27299 13.8668 2.35294 13.8668C2.43288 13.8668 2.50943 13.8349 2.56596 13.7783C2.62248 13.7218 2.65446 13.6453 2.65485 13.5654C2.64627 11.7456 3.09033 10.4398 3.93126 9.5989C4.60677 8.92338 5.61864 8.53982 7.03906 8.53982C7.23439 8.53982 7.42971 8.53982 7.62503 8.53982C9.04546 8.53982 10.0573 8.92338 10.7328 9.5989C11.5738 10.4398 12.0178 11.7456 12.0092 13.5654C12.0096 13.6453 12.0416 13.7218 12.0981 13.7783C12.1547 13.8349 12.2312 13.8668 12.3111 13.8668C12.3911 13.8668 12.4676 13.8349 12.5242 13.7783C12.5807 13.7218 12.6127 13.6453 12.6131 13.5654C12.6218 11.7107 12.1342 10.297 11.1594 9.32223C10.3885 8.55134 9.3644 8.12901 8.17037 7.98351C9.68285 7.54738 10.7891 6.15288 10.7891 4.5C10.7891 2.49797 9.16613 0.875 7.1641 0.875H7.5ZM4.475 4.5C4.475 2.82939 5.82939 1.475 7.5 1.475C9.17061 1.475 10.525 2.82939 10.525 4.5C10.525 6.17061 9.17061 7.525 7.5 7.525C5.82939 7.525 4.475 6.17061 4.475 4.5Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
              <p className="text-xs text-muted font-medium">Select a student row to see details, past 30 days, and parent info.</p>
            </div>
          ) : (
            (() => {
              const student = roster.find(s => s.id === focusedStudentId);
              if (!student) return null;
              const percent = overallPercentById[student.id];
              return (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className="flex flex-col gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center font-bold text-accent text-lg shadow-sm border border-accent/10">
                      {student.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-text text-base leading-tight mb-0.5">{student.name}</h4>
                      <p className="text-xs font-semibold text-muted bg-surface-muted px-2 py-0.5 rounded-md inline-block">{student.enrollmentNumber || student.id.slice(0,6)}</p>
                    </div>
                  </div>
                  
                  <div className="bg-surface-muted rounded-lg p-3 border border-border">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-semibold text-muted">Overall Attendance</span>
                      <span className={`text-sm font-bold ${typeof percent === "number" && percent < 75 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {typeof percent === "number" ? `${percent}%` : '--'}
                      </span>
                    </div>
                    {typeof percent === "number" && (
                      <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${percent < 75 ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <Button variant="outline" size="sm" className="w-full text-xs font-semibold justify-center">
                      View Full Report
                    </Button>
                    <Button variant="outline" size="sm" className="w-full text-xs font-semibold justify-center text-sky-700 border-sky-200 bg-sky-50 hover:bg-sky-100">
                      Send Notice to Parents
                    </Button>
                  </div>
                </motion.div>
              );
            })()
          )}
        </Card>
        </div>
      </div>
      </div>

      {pendingPeriodChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => setPendingPeriodChange(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-md rounded-card border border-border bg-surface shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold text-text">Discard unsaved changes?</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                Discard unsaved changes for {formatDate(date)} {timeSlot}?
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <Button variant="secondary" onClick={() => setPendingPeriodChange(null)}>Keep editing</Button>
              <Button variant="primary" onClick={discardPendingPeriodChange}>Discard</Button>
            </div>
          </motion.div>
        </div>
      )}

      {pendingSaveMarks && pendingSaveSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => setPendingSaveMarks(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-md rounded-card border border-border bg-surface shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold text-text">Save attendance?</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                Today {pendingSaveSummary.present} student{pendingSaveSummary.present === 1 ? '' : 's'} Present and {pendingSaveSummary.absent} student{pendingSaveSummary.absent === 1 ? '' : 's'} Absent will be saved.
              </p>
              {(pendingSaveSummary.leave > 0 || pendingSaveSummary.notApplicable > 0) && (
                <p className="mt-1 text-xs font-medium text-muted">
                  Leave: {pendingSaveSummary.leave} | N/A: {pendingSaveSummary.notApplicable}. These do not reduce attendance percentage.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 px-5 py-4 sm:grid-cols-4">
              {[
                { label: 'Present', value: pendingSaveSummary.present, className: 'border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
                { label: 'Absent', value: pendingSaveSummary.absent, className: 'border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400' },
                { label: 'Leave', value: pendingSaveSummary.leave, className: 'border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400' },
                { label: 'N/A', value: pendingSaveSummary.notApplicable, className: 'border-sky-200 dark:border-sky-500/20 bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400' },
              ].map((item) => (
                <div key={item.label} className={`rounded-control border px-3 py-2 ${item.className}`}>
                  <p className="text-[11px] font-bold uppercase tracking-wide">{item.label}</p>
                  <p className="text-2xl font-black leading-tight">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button variant="secondary" onClick={() => setPendingSaveMarks(null)}>Cancel</Button>
              <Button variant="primary" loading={saving} onClick={confirmSaveAttendance}>Save Attendance</Button>
            </div>
          </motion.div>
        </div>
      )}

      {showConfirm && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => setShowConfirm(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="flex max-h-[85vh] w-full max-w-md flex-col rounded-card border border-border bg-surface shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold text-text">Confirm attendance</h2>
              <p className="mt-1 text-sm text-muted">
                {preview.matched.length} student{preview.matched.length === 1 ? '' : 's'} will be marked {quickListMode === 'present' ? 'Present' : 'Absent'}.
                {isQuickCorrectionMode
                  ? ' All other attendance entries will stay unchanged.'
                  : ' All other students will stay blank here and will be counted in the save confirmation.'}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {preview.matched.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">No students matched the pasted roll numbers.</p>
              ) : (
                <ul className="space-y-1.5">
                  {preview.matched.map((match) => {
                    const student = roster.find((item) => item.id === match.id);
                    return (
                      <li key={match.id} className="flex items-center justify-between gap-3 rounded-button bg-background px-3 py-2 text-sm">
                        <span className="font-semibold text-text">{student?.name ?? match.id}</span>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">({match.token})</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {(preview.notFound.length > 0 || preview.ambiguous.length > 0) && (
                <div className="mt-3 space-y-1">
                  {preview.notFound.length > 0 && <p className="text-xs font-medium text-status-red">Not found: {preview.notFound.join(', ')}</p>}
                  {preview.ambiguous.length > 0 && <p className="text-xs font-medium text-amber-600">Matched more than one and skipped: {preview.ambiguous.join(', ')}</p>}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button variant="secondary" onClick={() => setShowConfirm(false)}>Cancel</Button>
              <Button ref={confirmButtonRef as any} variant="primary" className="bg-emerald-500 hover:bg-emerald-600 text-white" onClick={confirmApply}>Confirm &amp; Mark</Button>
            </div>
          </motion.div>
        </div>
      )}

      <div
        className={[
          'fixed right-4 z-50 flex flex-col gap-2 transition-[bottom] duration-200 ease-standard',
          toastBottomClass,
        ].join(' ')}
      >
        <AnimatePresence>
          {savedMessage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <Toast title="Success" message={savedMessage} tone="success" onClose={() => setSavedMessage(null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
