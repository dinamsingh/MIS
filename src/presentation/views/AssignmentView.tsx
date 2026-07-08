/**
 * Assignment module — Excel-style grid view (redesigned).
 *
 * Matches the teacher's real classroom workflow:
 *   • Teacher distributes assignment/lab-file PDF via WhatsApp
 *   • Students physically submit; teacher signs
 *   • Teacher opens this page, selects subject → sees full student grid
 *   • Clicks a cell → toggles DONE / blank (persisted immediately)
 *
 * Grid layout (mirrors the reference Excel sheet):
 *   SN | Enrollment | Name | A1 | A2 | A3 | A4 | A5 | Lab File
 *
 * Rules:
 *   • Max 5 assignment slots per subject (numbered, not named)
 *   • Lab File = one DONE checkbox per student per subject (not unit-wise)
 *   • No file upload; WhatsApp sharing stays on WhatsApp
 *   • Export button generates a CSV that opens in Excel
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { SubmissionStatus } from '@domain/shared/types';
import { useToast } from '@presentation/components/ToastProvider';

// ---------------------------------------------------------------------------
// Public types (injected from AssignmentPage)
// ---------------------------------------------------------------------------

export interface GridSubject {
  readonly id: string;
  readonly name: string;
}

export interface GridStudent {
  readonly id: string;
  readonly name: string;
  readonly enrollmentNumber?: string;
  readonly sectionLabel?: string;
}

export interface GridSlot {
  /** DB assignment id */
  readonly id: string;
  /** 1 – 5 */
  readonly slotNumber: number;
}

export interface AssignmentGridAccess {
  /** Fetch existing slots for a subject (sparse – only touched slots). */
  listSlotsForSubject(subjectId: string): Promise<GridSlot[]>;

  /** Find-or-create slot; returns assignment id. */
  getOrCreateSlot(subjectId: string, slotNumber: 1 | 2 | 3 | 4 | 5): Promise<string>;

  /** Batch-fetch submissions for one slot across all students. */
  getSlotSubmissions(
    assignmentId: string,
    studentIds: string[],
  ): Promise<Record<string, SubmissionStatus>>;

  /** Toggle one cell in the assignment grid. */
  setSlotSubmission(
    assignmentId: string,
    studentId: string,
    status: SubmissionStatus,
  ): Promise<void>;

  /** Batch-fetch lab-file statuses (subject-level). */
  getLabManualsBySubject(
    studentIds: string[],
    subjectId: string,
  ): Promise<Record<string, SubmissionStatus>>;

  /** Toggle lab-file for one student. */
  setLabManualBySubject(
    studentId: string,
    subjectId: string,
    status: SubmissionStatus,
  ): Promise<void>;
}

export interface AssignmentGridViewProps {
  subjects: readonly GridSubject[];
  students: readonly GridStudent[];
  access: AssignmentGridAccess;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLOT_NUMBERS = [1, 2, 3, 4, 5] as const;

// ---------------------------------------------------------------------------
// CSV Export utility
// ---------------------------------------------------------------------------

function buildCsv(
  students: readonly GridStudent[],
  slots: readonly GridSlot[],
  slotMap: Record<string, Record<number, SubmissionStatus>>,
  labMap: Record<string, SubmissionStatus>,
  subjectName: string,
): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;

  const headers = [
    'SN',
    'Enrollment',
    'Name',
    ...slots.map((s) => `Assignment ${s.slotNumber}`),
    'Lab File',
  ];

  const rows = students.map((student, idx) => {
    const assignCols = slots.map((slot) => {
      const st = slotMap[student.id]?.[slot.slotNumber] ?? 'not-submitted';
      return st === 'submitted' ? 'DONE' : '';
    });
    const labCol = labMap[student.id] === 'submitted' ? 'DONE' : '';
    return [
      String(idx + 1),
      student.enrollmentNumber ?? '',
      student.name,
      ...assignCols,
      labCol,
    ];
  });

  const csvRows = [headers, ...rows];
  const csvContent = [
    `"Subject: ${subjectName.replace(/"/g, '""')}"`,
    '',
    csvRows.map((row) => row.map(escape).join(',')).join('\r\n'),
  ].join('\r\n');

  return csvContent;
}

function downloadCsv(content: string, filename: string) {
  const bom = '\uFEFF'; // BOM so Excel opens UTF-8 correctly
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function slotKey(studentId: string, slotNumber: number): string {
  return `${studentId}::${slotNumber}`;
}

// ---------------------------------------------------------------------------
// Status toggle button (single cell)
// ---------------------------------------------------------------------------

function StatusCell({
  status,
  saving,
  label,
  onToggle,
  color = 'green',
}: {
  status: SubmissionStatus;
  saving: boolean;
  label: string;
  onToggle: () => void;
  color?: 'green' | 'blue';
}) {
  const isDone = status === 'submitted';
  const greenStyles = isDone
    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200'
    : 'bg-gray-100 text-gray-300 hover:bg-gray-200 hover:text-gray-400';
  const blueStyles = isDone
    ? 'bg-blue-500 text-white shadow-md shadow-blue-200'
    : 'bg-gray-100 text-gray-300 hover:bg-gray-200 hover:text-gray-400';

  return (
    <button
      type="button"
      aria-label={label}
      disabled={saving}
      onClick={onToggle}
      className={[
        'inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold',
        'transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        color === 'green' ? greenStyles : blueStyles,
      ].join(' ')}
    >
      {saving ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
      ) : isDone ? (
        '✓'
      ) : (
        '—'
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function AssignmentGridView({
  subjects,
  students,
  access,
}: AssignmentGridViewProps) {
  const { notify } = useToast();

  // ── Subject selection ────────────────────────────────────────────────────
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    subjects[0]?.id ?? '',
  );
  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId) ?? null;

  // Keep selection valid when subjects list changes
  useEffect(() => {
    if (selectedSubjectId === '' && subjects.length > 0) {
      setSelectedSubjectId(subjects[0].id);
    } else if (selectedSubjectId !== '' && !subjects.some((s) => s.id === selectedSubjectId)) {
      setSelectedSubjectId(subjects[0]?.id ?? '');
    }
  }, [subjects, selectedSubjectId]);

  // ── Slot ids for selected subject (sparse, lazy-created on first toggle) ─
  const [slots, setSlots] = useState<GridSlot[]>([]);

  // slotIdByNumber: cache so we don't hit the DB for already-known slots
  const slotIdByNumber = useRef<Record<string, Record<number, string>>>({});

  useEffect(() => {
    if (!selectedSubjectId) { setSlots([]); return; }
    let cancelled = false;
    void (async () => {
      try {
        const fetched = await access.listSlotsForSubject(selectedSubjectId);
        if (cancelled) return;
        setSlots(fetched);
        // Prime the cache
        slotIdByNumber.current[selectedSubjectId] ??= {};
        for (const slot of fetched) {
          slotIdByNumber.current[selectedSubjectId][slot.slotNumber] = slot.id;
        }
      } catch {
        if (!cancelled) setSlots([]);
      }
    })();
    return () => { cancelled = true; };
  }, [access, selectedSubjectId]);

  // ── Submission grids ─────────────────────────────────────────────────────
  // assignGrid[studentId][slotNumber] = status
  const [assignGrid, setAssignGrid] = useState<Record<string, Record<number, SubmissionStatus>>>({});
  // labGrid[studentId] = status
  const [labGrid, setLabGrid] = useState<Record<string, SubmissionStatus>>({});
  const [gridLoading, setGridLoading] = useState(false);

  // When subject OR students changes, reload all submission data
  useEffect(() => {
    if (!selectedSubjectId || students.length === 0) {
      setAssignGrid({});
      setLabGrid({});
      return;
    }
    let cancelled = false;
    const studentIds = students.map((s) => s.id);

    void (async () => {
      setGridLoading(true);
      try {
        // Load lab file statuses (subject-level)
        const labData = await access.getLabManualsBySubject(studentIds, selectedSubjectId);
        if (cancelled) return;
        setLabGrid(labData);

        // Load assignment slot statuses (one fetch per existing slot)
        const knownSlots = await access.listSlotsForSubject(selectedSubjectId);
        if (cancelled) return;

        // Prime cache
        slotIdByNumber.current[selectedSubjectId] ??= {};
        for (const slot of knownSlots) {
          slotIdByNumber.current[selectedSubjectId][slot.slotNumber] = slot.id;
        }
        setSlots(knownSlots);

        const newAssignGrid: Record<string, Record<number, SubmissionStatus>> = {};
        await Promise.all(
          knownSlots.map(async (slot) => {
            const data = await access.getSlotSubmissions(slot.id, studentIds);
            if (cancelled) return;
            for (const [studentId, status] of Object.entries(data)) {
              newAssignGrid[studentId] ??= {};
              newAssignGrid[studentId][slot.slotNumber] = status;
            }
          }),
        );
        if (!cancelled) setAssignGrid(newAssignGrid);
      } catch {
        // Silent fail — empty grid shown
      } finally {
        if (!cancelled) setGridLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [access, selectedSubjectId, students]);

  // ── Saving cell states ───────────────────────────────────────────────────
  // saving[slotKey(studentId, slotNumber)] = true while in-flight
  const [savingCells, setSavingCells] = useState<Record<string, boolean>>({});
  const [savingLab, setSavingLab] = useState<Record<string, boolean>>({});

  // ── Toggle assignment cell ───────────────────────────────────────────────
  const toggleAssignCell = useCallback(
    async (studentId: string, slotNumber: 1 | 2 | 3 | 4 | 5) => {
      const key = slotKey(studentId, slotNumber);
      setSavingCells((prev) => ({ ...prev, [key]: true }));

      const currentStatus =
        assignGrid[studentId]?.[slotNumber] ?? 'not-submitted';
      const nextStatus: SubmissionStatus =
        currentStatus === 'submitted' ? 'not-submitted' : 'submitted';

      // Optimistic update
      setAssignGrid((prev) => ({
        ...prev,
        [studentId]: { ...(prev[studentId] ?? {}), [slotNumber]: nextStatus },
      }));

      try {
        // Get or create the slot id
        let assignmentId =
          slotIdByNumber.current[selectedSubjectId]?.[slotNumber];
        if (!assignmentId) {
          assignmentId = await access.getOrCreateSlot(
            selectedSubjectId,
            slotNumber,
          );
          slotIdByNumber.current[selectedSubjectId] ??= {};
          slotIdByNumber.current[selectedSubjectId][slotNumber] = assignmentId;
          // Add to slots list if not already there
          setSlots((prev) =>
            prev.some((s) => s.slotNumber === slotNumber)
              ? prev
              : [...prev, { id: assignmentId, slotNumber }].sort(
                  (a, b) => a.slotNumber - b.slotNumber,
                ),
          );
        }
        await access.setSlotSubmission(assignmentId, studentId, nextStatus);
      } catch {
        // Rollback
        setAssignGrid((prev) => ({
          ...prev,
          [studentId]: {
            ...(prev[studentId] ?? {}),
            [slotNumber]: currentStatus,
          },
        }));
        notify({ tone: 'danger', title: 'Save failed', message: 'Dobara try karein.' });
      } finally {
        setSavingCells((prev) => ({ ...prev, [key]: false }));
      }
    },
    [access, assignGrid, notify, selectedSubjectId],
  );

  // ── Toggle lab file cell ─────────────────────────────────────────────────
  const toggleLabCell = useCallback(
    async (studentId: string) => {
      setSavingLab((prev) => ({ ...prev, [studentId]: true }));

      const currentStatus = labGrid[studentId] ?? 'not-submitted';
      const nextStatus: SubmissionStatus =
        currentStatus === 'submitted' ? 'not-submitted' : 'submitted';

      setLabGrid((prev) => ({ ...prev, [studentId]: nextStatus }));

      try {
        await access.setLabManualBySubject(studentId, selectedSubjectId, nextStatus);
      } catch {
        setLabGrid((prev) => ({ ...prev, [studentId]: currentStatus }));
        notify({ tone: 'danger', title: 'Save failed', message: 'Dobara try karein.' });
      } finally {
        setSavingLab((prev) => ({ ...prev, [studentId]: false }));
      }
    },
    [access, labGrid, notify, selectedSubjectId],
  );

  // ── Search ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  useEffect(() => { setSearch(''); }, [selectedSubjectId]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      [s.name, s.enrollmentNumber, s.sectionLabel]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [search, students]);

  // ── Summary counts ───────────────────────────────────────────────────────
  const slotSubmittedCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const n of SLOT_NUMBERS) {
      counts[n] = students.filter(
        (s) => assignGrid[s.id]?.[n] === 'submitted',
      ).length;
    }
    return counts;
  }, [assignGrid, students]);

  const labSubmittedCount = useMemo(
    () => students.filter((s) => labGrid[s.id] === 'submitted').length,
    [labGrid, students],
  );

  // Which slots have at least one interaction (= "active" columns)
  // We always show all 5 columns so teacher can click any slot
  const activeSlotNumbers = SLOT_NUMBERS;

  // ── Bulk mark ────────────────────────────────────────────────────────────
  const [bulkSaving, setBulkSaving] = useState(false);

  const handleBulkMark = useCallback(
    async (status: SubmissionStatus) => {
      if (!selectedSubjectId || filteredStudents.length === 0 || bulkSaving) return;

      const confirmed = window.confirm(
        status === 'submitted'
          ? `${filteredStudents.length} dikhe hue students ko "DONE" mark karein sabhi assignments ke liye?`
          : `${filteredStudents.length} dikhe hue students ko "Pending" mark karein sabhi assignments ke liye?`,
      );
      if (!confirmed) return;

      setBulkSaving(true);

      try {
        // Ensure all slots exist
        const slotIds: Record<number, string> = {};
        for (const n of SLOT_NUMBERS) {
          let id = slotIdByNumber.current[selectedSubjectId]?.[n];
          if (!id) {
            id = await access.getOrCreateSlot(selectedSubjectId, n);
            slotIdByNumber.current[selectedSubjectId] ??= {};
            slotIdByNumber.current[selectedSubjectId][n] = id;
          }
          slotIds[n] = id;
        }

        // Update all slots for all filtered students in parallel
        await Promise.all(
          filteredStudents.flatMap((student) =>
            SLOT_NUMBERS.map((n) =>
              access.setSlotSubmission(slotIds[n], student.id, status),
            ),
          ),
        );

        // Update lab too
        await Promise.all(
          filteredStudents.map((student) =>
            access.setLabManualBySubject(student.id, selectedSubjectId, status),
          ),
        );

        // Sync state
        setAssignGrid((prev) => {
          const next = { ...prev };
          for (const student of filteredStudents) {
            next[student.id] = Object.fromEntries(
              SLOT_NUMBERS.map((n) => [n, status]),
            );
          }
          return next;
        });
        setLabGrid((prev) => {
          const next = { ...prev };
          for (const student of filteredStudents) next[student.id] = status;
          return next;
        });

        // Ensure all 5 slots appear in the slots list
        setSlots(
          SLOT_NUMBERS.map((n) => ({ id: slotIds[n], slotNumber: n })),
        );

        notify({
          tone: 'success',
          title: status === 'submitted' ? 'All marked Done' : 'All marked Pending',
          message: `${filteredStudents.length} students updated.`,
        });
      } catch {
        notify({ tone: 'danger', title: 'Bulk update failed', message: 'Dobara try karein.' });
      } finally {
        setBulkSaving(false);
      }
    },
    [access, bulkSaving, filteredStudents, notify, selectedSubjectId],
  );

  // ── Export CSV ───────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!selectedSubject) return;
    const activeSlots = SLOT_NUMBERS.map((n) => ({
      id: slotIdByNumber.current[selectedSubjectId]?.[n] ?? n.toString(),
      slotNumber: n,
    }));
    const csv = buildCsv(
      filteredStudents,
      activeSlots,
      assignGrid,
      labGrid,
      selectedSubject.name,
    );
    const safeName = selectedSubject.name.replace(/[^a-z0-9]/gi, '_');
    downloadCsv(csv, `${safeName}_assignments.csv`);
  }, [assignGrid, filteredStudents, labGrid, selectedSubject, selectedSubjectId]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">

      {/* ── Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-text">Assignments & Lab File</h2>
          <p className="mt-0.5 text-sm text-muted">
            Subject select karo → student grid mein directly DONE mark karo.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={!selectedSubject || students.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2
                     text-sm font-semibold text-text shadow-soft transition-colors
                     hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg className="h-4 w-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export Excel (CSV)
        </button>
      </header>

      {/* ── Subject selector ── */}
      {subjects.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border bg-surface p-10 text-center">
          <p className="text-sm font-medium text-text">Koi subject nahi mila</p>
          <p className="mt-1 text-sm text-muted">
            Pehle timetable ya onboarding mein subject assign karein.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="subject-select" className="text-sm font-semibold text-muted">
              Subject:
            </label>
            <select
              id="subject-select"
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium
                         text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {students.length > 0 && (
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted">
                {students.length} students
              </span>
            )}
          </div>

          {/* ── Summary stats ── */}
          {students.length > 0 && (
            <section className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {SLOT_NUMBERS.map((n) => (
                <div
                  key={n}
                  className="rounded-lg border border-border bg-surface px-3 py-2.5 shadow-soft"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Assign {n}
                  </p>
                  <p className="mt-1 text-xl font-bold text-text">
                    {slotSubmittedCounts[n]}
                    <span className="text-sm font-normal text-muted">/{students.length}</span>
                  </p>
                </div>
              ))}
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 shadow-soft">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                  Lab File
                </p>
                <p className="mt-1 text-xl font-bold text-text">
                  {labSubmittedCount}
                  <span className="text-sm font-normal text-muted">/{students.length}</span>
                </p>
              </div>
            </section>
          )}

          {/* ── Search + Bulk actions ── */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 max-w-sm">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="search"
                id="student-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Student name, enrollment, section..."
                className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm
                           text-text placeholder:text-muted focus:border-accent focus:outline-none
                           focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <span className="text-xs text-muted">
              Showing {filteredStudents.length}/{students.length}
            </span>
            <button
              type="button"
              disabled={bulkSaving || filteredStudents.length === 0}
              onClick={() => void handleBulkMark('submitted')}
              className="rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-white
                         shadow-soft transition-colors hover:bg-emerald-600
                         disabled:cursor-not-allowed disabled:opacity-40"
            >
              {bulkSaving ? 'Saving…' : 'Mark All Done ✓'}
            </button>
            <button
              type="button"
              disabled={bulkSaving || filteredStudents.length === 0}
              onClick={() => void handleBulkMark('not-submitted')}
              className="rounded-lg border border-border bg-surface px-3.5 py-2 text-xs font-semibold
                         text-text transition-colors hover:bg-secondary
                         disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mark All Pending
            </button>
          </div>

          {/* ── Excel-style grid ── */}
          {students.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-border bg-surface p-10 text-center">
              <p className="text-sm font-medium text-text">Koi student nahi mila</p>
              <p className="mt-1 text-sm text-muted">
                Pehle Roster page mein students import karein.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-soft">
              {gridLoading && (
                <div className="flex items-center gap-2 border-b border-border bg-accent/5 px-5 py-2.5">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  <span className="text-xs text-muted">Loading submissions…</span>
                </div>
              )}
              <table className="w-full text-left text-sm">
                {/* ── Column header ── */}
                <thead>
                  <tr className="border-b border-border bg-gray-50">
                    <th className="py-3 pl-4 pr-2 text-xs font-semibold uppercase tracking-wide text-muted w-10">
                      SN
                    </th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted whitespace-nowrap">
                      Enrollment
                    </th>
                    <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                      Student Name
                    </th>
                    {activeSlotNumbers.map((n) => (
                      <th
                        key={n}
                        className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted whitespace-nowrap"
                      >
                        <span className="inline-flex flex-col items-center gap-0.5">
                          <span
                            className={[
                              'inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold',
                              slots.some((s) => s.slotNumber === n)
                                ? 'bg-accent/10 text-accent'
                                : 'bg-gray-100 text-gray-400',
                            ].join(' ')}
                          >
                            {n}
                          </span>
                          <span className="text-[10px] text-muted">Assign</span>
                        </span>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-blue-600 whitespace-nowrap">
                      <span className="inline-flex flex-col items-center gap-0.5">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-[11px] font-bold">
                          L
                        </span>
                        <span className="text-[10px]">Lab File</span>
                      </span>
                    </th>
                  </tr>
                </thead>

                {/* ── Student rows ── */}
                <tbody className="divide-y divide-border">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3 + activeSlotNumbers.length + 1}
                        className="py-8 text-center text-sm text-muted"
                      >
                        Search se koi student match nahi hua.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((student, idx) => (
                      <tr
                        key={student.id}
                        className="transition-colors hover:bg-gray-50/60"
                      >
                        {/* SN */}
                        <td className="py-2.5 pl-4 pr-2 text-xs font-medium text-muted">
                          {idx + 1}
                        </td>

                        {/* Enrollment */}
                        <td className="px-3 py-2.5 font-mono text-xs text-muted whitespace-nowrap">
                          {student.enrollmentNumber ?? '—'}
                        </td>

                        {/* Name */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 flex-shrink-0 rounded-full bg-accent/10
                                            flex items-center justify-center text-[11px]
                                            font-bold text-accent">
                              {getInitials(student.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-text">
                                {student.name}
                              </p>
                              {student.sectionLabel && (
                                <p className="text-[11px] text-muted">{student.sectionLabel}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Assignment slots (1-5) */}
                        {activeSlotNumbers.map((n) => {
                          const key = slotKey(student.id, n);
                          const status = assignGrid[student.id]?.[n] ?? 'not-submitted';
                          return (
                            <td key={n} className="px-3 py-2.5 text-center">
                              <StatusCell
                                status={status}
                                saving={savingCells[key] === true}
                                label={`${student.name} — Assignment ${n}`}
                                onToggle={() => void toggleAssignCell(student.id, n as 1 | 2 | 3 | 4 | 5)}
                                color="green"
                              />
                            </td>
                          );
                        })}

                        {/* Lab File */}
                        <td className="px-3 py-2.5 text-center">
                          <StatusCell
                            status={labGrid[student.id] ?? 'not-submitted'}
                            saving={savingLab[student.id] === true}
                            label={`${student.name} — Lab File`}
                            onToggle={() => void toggleLabCell(student.id)}
                            color="blue"
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>

                {/* ── Footer totals row ── */}
                {filteredStudents.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-gray-50">
                      <td
                        colSpan={3}
                        className="py-2.5 pl-4 pr-3 text-xs font-semibold text-muted"
                      >
                        Submitted ↓
                      </td>
                      {activeSlotNumbers.map((n) => (
                        <td key={n} className="px-3 py-2.5 text-center">
                          <span
                            className={[
                              'inline-flex items-center justify-center rounded-full px-2 py-0.5',
                              'text-xs font-bold',
                              slotSubmittedCounts[n] > 0
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-gray-100 text-gray-400',
                            ].join(' ')}
                          >
                            {slotSubmittedCounts[n]}/{students.length}
                          </span>
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={[
                            'inline-flex items-center justify-center rounded-full px-2 py-0.5',
                            'text-xs font-bold',
                            labSubmittedCount > 0
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-400',
                          ].join(' ')}
                        >
                          {labSubmittedCount}/{students.length}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
