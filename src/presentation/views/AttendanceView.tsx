import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  type AttendanceStatus,
  type AttendanceStatusMark,
  type PeriodKey,
} from '@domain/services/attendanceService';
import { messages } from '@domain/shared/messages';
import { applyPresentList, previewPresentList, type PresentListPreview } from '@domain/services/quickAttendance';
import {
  Alert,
  Toast,
  Button,
  IconButton,
  SectionHeader,
  Card,
  FilterBar,
  SearchInput,
  Select,
  DatePicker,
  Checkbox,
  Badge,
  SkeletonLoader,
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

export interface AttendancePersistence {
  loadStatusPeriod(key: PeriodKey): Promise<AttendanceStatusMark[]>;
  saveStatusPeriod(key: PeriodKey, marks: AttendanceStatusMark[]): Promise<void>;
  loadStudentOverall(scope: { readonly sectionId: string; readonly subjectId?: string }): Promise<StudentAttendanceOverall[]>;
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

type SummaryTone = 'present' | 'absent' | 'leave' | 'total';

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
  leave: {
    border: 'border-amber-200/80',
    bar: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-700 ring-amber-100',
    fill: 'bg-amber-500',
  },
  total: {
    border: 'border-sky-200/80',
    bar: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-700 ring-sky-100',
    fill: 'bg-sky-500',
  },
};

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
      className={`relative min-h-[5.5rem] overflow-hidden rounded-card border ${toneClasses.border} bg-surface px-4 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.07)]`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${toneClasses.bar}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-muted">{label}</p>
          <p className="mt-1 text-3xl font-semibold leading-none text-text">{value}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-button text-xs font-bold ring-1 ${toneClasses.chip}`}>
          {shortLabel}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
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
  status: AttendanceStatus;
  overallPercent: number | null;
  overallLoading: boolean;
  isSelected: boolean;
  onStatusChange: (id: string, status: AttendanceStatus) => void;
  onToggleSelection: (id: string, index: number, shiftKey: boolean) => void;
  index: number;
  disabled: boolean;
}) {
  const studentCode = student.enrollmentNumber ?? student.id.slice(0, 8);

  const statusColors: Record<AttendanceStatus, { activeClass: string }> = {
    'present': { activeClass: 'bg-emerald-100 border-emerald-300 text-emerald-800' },
    'absent': { activeClass: 'bg-red-100 border-red-300 text-red-800' },
    'leave': { activeClass: 'bg-amber-100 border-amber-300 text-amber-800' },
    'not-applicable': { activeClass: 'bg-sky-100 border-sky-300 text-sky-800' },
  };

  return (
    <motion.tr
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.01, 0.3) }}
      className={`table-row hover:bg-surface-muted transition-colors ${isSelected ? 'bg-accent/5' : ''}`}
    >
      <td className="table-cell sticky left-0 z-10 w-12 text-center bg-inherit">
        <Checkbox
          checked={isSelected}
          onChange={(e) => onToggleSelection(student.id, index, (e.nativeEvent as PointerEvent).shiftKey)}
          label=""
        />
      </td>
      <td className="table-cell sticky left-12 z-10 bg-inherit min-w-[200px]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted text-xs font-semibold text-text">
            {index + 1}
          </span>
          <span className="font-semibold text-text">{student.name}</span>
        </div>
      </td>
      <td className="table-cell text-muted">{studentCode}</td>
      <td className="table-cell">
        <Badge className={overallBadgeClass(overallPercent)}>
          {overallLoading ? '...' : overallPercent === null ? '--' : `${overallPercent}%`}
        </Badge>
      </td>
      <td className="table-cell text-right">
        <div className="flex items-center justify-end gap-1.5">
          {STATUS_OPTIONS.map(opt => {
            const isActive = status === opt.value;
            return (
              <button
                key={opt.value}
                disabled={disabled}
                onClick={() => onStatusChange(student.id, opt.value)}
                className={`min-h-8 min-w-8 rounded-button border px-2 text-xs font-bold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60 ${
                  isActive ? statusColors[opt.value].activeClass : 'border-border bg-white text-muted hover:border-accent/40 hover:bg-background hover:text-text'
                }`}
              >
                {opt.shortLabel}
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

  const [roster, setRoster] = useState<readonly RosterStudent[]>([]);
  const [statusById, setStatusById] = useState<Record<string, AttendanceStatus>>({});
  const [savedStatusById, setSavedStatusById] = useState<Record<string, AttendanceStatus>>({});
  const [overallById, setOverallById] = useState<Record<string, StudentAttendanceOverall>>({});
  const [overallLoading, setOverallLoading] = useState(false);
  const [overallRefreshVersion, setOverallRefreshVersion] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [rosterLoading, setRosterLoading] = useState(false);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [hasSavedAttendance, setHasSavedAttendance] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // Quick mark state
  const [presentInput, setPresentInput] = useState('');
  const [quickResult, setQuickResult] = useState<{
    matchedCount: number;
    notFound: string[];
    ambiguous: string[];
  } | null>(null);
  const [preview, setPreview] = useState<PresentListPreview | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

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
    if (!periodKey || roster.length === 0) {
      setStatusById({});
      setSavedStatusById({});
      setHasSavedAttendance(false);
      setDirty(false);
      return;
    }

    let active = true;
    setPeriodLoading(true);
    setLoadError(false);
    setSavedMessage(null);
    setSelectedRows(new Set());

    void attendance
      .loadStatusPeriod(periodKey)
      .then((saved) => {
        if (!active) return;
        setHasSavedAttendance(saved.length > 0);
        setSavedStatusById(savedStatusMapFromMarks(saved));
        setStatusById(statusMapFromMarks(roster, saved));
        setDirty(false);
        setPeriodLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setSavedStatusById({});
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
      result = result.filter((student) => statusById[student.id] === statusFilter);
    }

    return result;
  }, [roster, searchQuery, statusFilter, statusById]);

  const summary = useMemo(
    () => summarize(roster.map((student) => statusById[student.id] ?? 'present')),
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
    setSavedMessage(`Marked ${selectedRows.size} students as ${status}.`);
    setSelectedRows(new Set());
  }, [selectedRows, isFutureDate]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        setSelectedRows(new Set());
      } else if (e.key === 'p' || e.key === 'P') {
        if (selectedRows.size > 0) bulkMark('present');
      } else if (e.key === 'a' || e.key === 'A') {
        if (selectedRows.size > 0) bulkMark('absent');
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

  async function saveAttendance() {
    if (!periodKey || roster.length === 0 || isFutureDate) {
      return;
    }

    setSaving(true);
    setLoadError(false);
    setSavedMessage(null);
    try {
      const nextMarks = roster.map((student) => ({
        studentId: student.id,
        status: statusById[student.id] ?? 'present',
      }));
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
      setDirty(false);
      setSavedMessage(`Attendance saved for ${formatDate(periodKey.date)}`);
    } catch {
      setLoadError(true);
    } finally {
      setSaving(false);
    }
  }

  const rosterCountForProgress = Math.max(roster.length, 1);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-20">
      <SectionHeader
        eyebrow="Academic Operations"
        title="Attendance"
        description="Selected class period attendance."
        density="compact"
        actions={
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                Unsaved
              </span>
            )}
            <Button
              variant="primary"
              size="sm"
              disabled={saveDisabled}
              loading={saving}
              onClick={() => void saveAttendance()}
            >
              Save Attendance
            </Button>
          </div>
        }
      />

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

      {/* Floating Bulk Actions Toolbar */}
      <AnimatePresence>
        {selectedRows.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-full border border-border bg-surface px-6 py-3 shadow-elevated"
          >
            <span className="text-sm font-semibold text-text">{selectedRows.size} selected</span>
            <div className="h-6 w-px bg-border" />
            <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100" onClick={() => bulkMark('present')}>
              Mark Present (P)
            </Button>
            <Button size="sm" variant="outline" className="text-red-700 border-red-200 bg-red-50 hover:bg-red-100" onClick={() => bulkMark('absent')}>
              Mark Absent (A)
            </Button>
            <IconButton icon={
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
            } label="Clear selection (Esc)" onClick={() => setSelectedRows(new Set())} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid w-full grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile
          label="Present"
          value={summary.present}
          tone="present"
          shortLabel="P"
          fillPercent={(summary.present / rosterCountForProgress) * 100}
        />
        <SummaryTile
          label="Absent"
          value={summary.absent}
          tone="absent"
          shortLabel="A"
          fillPercent={(summary.absent / rosterCountForProgress) * 100}
        />
        <SummaryTile
          label="Leave"
          value={summary.leave}
          tone="leave"
          shortLabel="L"
          fillPercent={(summary.leave / rosterCountForProgress) * 100}
        />
        <SummaryTile
          label="Total Students"
          value={roster.length}
          tone="total"
          shortLabel="#"
          fillPercent={roster.length > 0 ? 100 : 0}
        />
      </div>

      <Card className="relative overflow-hidden border-emerald-200/70 bg-[linear-gradient(135deg,rgba(236,253,245,0.9),rgba(240,253,250,0.76)_52%,rgba(255,255,255,0.96))] p-0 shadow-[0_10px_24px_rgba(15,118,110,0.08)]">
        <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500" aria-hidden="true" />
        <div className="p-4">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center">
              <div className="min-w-0">
                <h3 className="text-base font-semibold leading-6 text-emerald-950">Quick Mark</h3>
                <p className="text-xs font-medium text-emerald-800/75">Fast roll entry</p>
              </div>
            </div>
            <Badge tone={isQuickCorrectionMode ? 'info' : 'success'} size="sm" className="self-start bg-white sm:self-center">
              {isQuickCorrectionMode ? 'Correction Mode' : 'First Save Mode'}
            </Badge>
          </div>
          <div className="flex flex-col gap-2 rounded-control border border-emerald-200 bg-white/90 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:flex-row sm:items-center">
            <input
              value={presentInput}
              onChange={(event) => setPresentInput(event.target.value)}
              placeholder="e.g. 001, 004, 067, D01"
              className="min-h-10 flex-1 rounded-button border border-transparent bg-transparent px-2 text-sm font-medium text-text placeholder:text-muted focus:border-emerald-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="min-w-32 bg-emerald-700 text-white shadow-[0_6px_14px_rgba(4,120,87,0.16)] hover:bg-emerald-800"
                disabled={roster.length === 0 || saving || isFutureDate}
                onClick={openPreview}
              >
                Mark Present
              </Button>
              <Button type="button" size="sm" variant="secondary" className="bg-white/80 text-emerald-900 hover:bg-emerald-50" disabled={saving} onClick={clearQuick}>
                Clear
              </Button>
            </div>
          </div>
          {quickResult && (
            <div className="mt-3 rounded-control border border-emerald-200 bg-white/80 px-3 py-2 text-xs">
              <span className="font-semibold text-emerald-700">
                {isQuickCorrectionMode
                  ? `${quickResult.matchedCount} updated, rest unchanged`
                  : `${quickResult.matchedCount} present, rest absent`}
              </span>
              {quickResult.notFound.length > 0 && (
                <p className="mt-1 font-medium text-status-red">
                  Not found: {quickResult.notFound.join(', ')}
                </p>
              )}
              {quickResult.ambiguous.length > 0 && (
                <p className="mt-1 font-medium text-amber-600">
                  Matched multiple: {quickResult.ambiguous.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card padded={false} className="overflow-hidden flex flex-col">
        <FilterBar className="border-b border-border rounded-none bg-surface-muted/30">
          <SearchInput
            placeholder="Search student or roll..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="min-w-[250px]"
          />
          <Select
            options={[
              { label: 'All Subjects', value: '' },
              ...subjects.map(s => ({ label: s.name, value: s.id }))
            ]}
            value={subjectId}
            onChange={e => setSubjectId(e.target.value)}
            className="min-w-[150px]"
          />
          <Select
            options={timeSlots.map(s => ({ label: s, value: s }))}
            value={timeSlot}
            onChange={e => setTimeSlot(e.target.value)}
            className="min-w-[150px]"
          />
          <DatePicker
            value={date}
            max={maxAttendanceDate}
            onChange={e => setDate(e.target.value)}
            className="min-w-[150px]"
          />
          <Select
            options={[
              { label: 'All Statuses', value: 'all' },
              { label: 'Present', value: 'present' },
              { label: 'Absent', value: 'absent' },
              { label: 'Leave', value: 'leave' }
            ]}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="min-w-[150px]"
          />
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}>
            Reset Filters
          </Button>
        </FilterBar>

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
          <div className="overflow-x-auto max-h-[600px]">
            <table className="table-base w-full min-w-[800px] border-collapse relative text-left">
              <thead className="table-head sticky top-0 z-20 bg-surface shadow-sm">
                <tr>
                  <th className="table-header-cell sticky left-0 z-30 w-12 text-center bg-surface border-b border-border py-2.5 px-4 text-[11px] font-bold uppercase text-muted">
                    <Checkbox
                      checked={selectedRows.size > 0 && selectedRows.size === filteredRoster.length}
                      onChange={toggleAllSelection}
                      label=""
                    />
                  </th>
                  <th className="table-header-cell sticky left-12 z-30 bg-surface border-b border-border py-2.5 px-4 text-[11px] font-bold uppercase text-muted">Student</th>
                  <th className="table-header-cell bg-surface border-b border-border py-2.5 px-4 text-[11px] font-bold uppercase text-muted">Roll Number</th>
                  <th className="table-header-cell bg-surface border-b border-border py-2.5 px-4 text-[11px] font-bold uppercase text-muted">Attendance</th>
                  <th className="table-header-cell text-right bg-surface pr-6 border-b border-border py-2.5 px-4 text-[11px] font-bold uppercase text-muted">Mark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <AnimatePresence>
                  {filteredRoster.map((student, index) => (
                    <AttendanceTableRow
                      key={student.id}
                      student={student}
                      status={statusById[student.id] ?? 'present'}
                      overallPercent={overallPercentById[student.id] ?? null}
                      overallLoading={overallLoading}
                      isSelected={selectedRows.has(student.id)}
                      onStatusChange={setStudentStatus}
                      onToggleSelection={toggleRowSelection}
                      index={index}
                      disabled={saving || busy || isFutureDate}
                    />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
                {preview.matched.length} student{preview.matched.length === 1 ? '' : 's'} will be marked
                {isQuickCorrectionMode
                  ? ' Present. All other attendance entries will stay unchanged.'
                  : ` Present. The remaining ${Math.max(roster.length - preview.matched.length, 0)} will be marked Absent.`}
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
                  {preview.ambiguous.length > 0 && <p className="text-xs font-medium text-amber-600">Matched more than one (please check): {preview.ambiguous.join(', ')}</p>}
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

      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
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
