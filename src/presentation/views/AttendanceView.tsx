/**
 * Attendance module UI (task 19.1).
 *
 * The teacher-facing surface for period-wise attendance marking. It composes
 * the pure attendance domain (`liveCounts`, `PeriodKey`, `AttendanceMark`) with
 * an injected persistence port so the view performs no I/O of its own and stays
 * unit/snapshot testable:
 *
 *  - **Selection** — the teacher picks a Section, a subject, a date, and a
 *    Period time slot. Together these form the {@link PeriodKey} that identifies
 *    a single scheduled slot. Because the time slot (and subject/date) are free
 *    selections, the same date can hold multiple Periods — including multiple
 *    Periods of the same subject and lab sessions (Req 5.1, 5.2).
 *  - **Roster + controls** — once a Section is chosen the enrolled roster loads
 *    and each student gets present/absent controls (Req 5.1).
 *  - **Live counts** — every toggle recomputes the present/absent tally with the
 *    shared pure `liveCounts`, so the header updates immediately (Req 5.3).
 *  - **Save** — saving persists one mark per student for the selected period via
 *    the injected `savePeriod` (upsert, one row per student) (Req 5.4).
 *  - **Reopen** — selecting a period that was already saved reloads its stored
 *    present/absent values; switching between periods/lab sessions reloads each
 *    period's own saved state (Req 5.5, 5.2).
 *
 * Data dependencies (the section/subject lists, the roster loader, and the
 * persistence port) are injected so the production wiring supplies the
 * Supabase-backed `attendanceAccess` while tests supply in-memory fakes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  liveCounts,
  type AttendanceMark,
  type PeriodKey,
} from '@domain/services/attendanceService';
import { messages } from '@domain/shared/messages';

/** A selectable option (Section or subject) rendered in a dropdown. */
export interface AttendanceOption {
  readonly id: string;
  readonly name: string;
}

/** A roster member shown with present/absent controls. */
export interface RosterStudent {
  readonly id: string;
  readonly name: string;
  /** Optional enrollment number shown as a secondary label. */
  readonly enrollmentNumber?: string;
}

/** Loads the enrolled roster for a Section. */
export type LoadRoster = (sectionId: string) => Promise<RosterStudent[]>;

/**
 * The persistence port the view depends on. Structurally compatible with the
 * Supabase-backed `AttendanceAccess`, so production passes that wrapper while
 * tests pass an in-memory fake.
 */
export interface AttendancePersistence {
  loadPeriod(key: PeriodKey): Promise<AttendanceMark[]>;
  savePeriod(key: PeriodKey, marks: AttendanceMark[]): Promise<void>;
}

export interface AttendanceViewProps {
  /** Sections the teacher can mark attendance for (Req 5.2). */
  sections: readonly AttendanceOption[];
  /** Subjects available for selection (Req 5.2). */
  subjects: readonly AttendanceOption[];
  /** Period time slots available for selection (multiple per day, incl. labs). */
  timeSlots: readonly string[];
  /** Loads the enrolled roster for the chosen Section. */
  loadRoster: LoadRoster;
  /** Period load/save persistence port (Supabase wrapper in production). */
  attendance: AttendancePersistence;
  /** Optional initial date (ISO `YYYY-MM-DD`); defaults to today. */
  initialDate?: string;
}

/** Today's date as an ISO `YYYY-MM-DD` string in the local time zone. */
function todayIso(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

/** Get initials from a student name (up to 2 characters). */
function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Compute a simple term attendance percentage for display (mock based on current marks). */
function termPercent(present: boolean): number {
  // In production this would come from historical data; here we derive a placeholder
  return present ? 88 : 62;
}

/** Teacher attendance marking surface for a single Period. */
export default function AttendanceView({
  sections,
  subjects,
  timeSlots,
  loadRoster,
  attendance,
  initialDate,
}: AttendanceViewProps) {
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState(initialDate ?? todayIso());
  const [timeSlot, setTimeSlot] = useState('');

  const [roster, setRoster] = useState<readonly RosterStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [presentById, setPresentById] = useState<Record<string, boolean>>({});

  const [periodLoading, setPeriodLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [loadError, setLoadError] = useState(false);

  // A complete period key requires all four selections (Req 5.1).
  const periodKey = useMemo<PeriodKey | null>(() => {
    if (!sectionId || !subjectId || !date || !timeSlot) {
      return null;
    }
    return { sectionId, subjectId, date, timeSlot };
  }, [sectionId, subjectId, date, timeSlot]);

  // Load the Section roster whenever the Section changes (Req 5.1).
  useEffect(() => {
    if (!sectionId) {
      setRoster([]);
      return;
    }
    let active = true;
    setRosterLoading(true);
    setLoadError(false);
    void loadRoster(sectionId)
      .then((students) => {
        if (active) {
          setRoster(students);
          setRosterLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setRoster([]);
          setRosterLoading(false);
          setLoadError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [sectionId, loadRoster]);

  // Reopen previously saved values for the selected period (Req 5.5). Switching
  // between periods/lab sessions reloads each period's own saved state (Req 5.2).
  // Students without a saved record default to present, so a fresh period starts
  // fully present and the teacher marks the absentees.
  useEffect(() => {
    if (!periodKey || roster.length === 0) {
      return;
    }
    let active = true;
    setPeriodLoading(true);
    setSaveState('idle');
    setLoadError(false);
    void attendance
      .loadPeriod(periodKey)
      .then((saved) => {
        if (!active) {
          return;
        }
        const savedById = new Map(saved.map((mark) => [mark.studentId, mark.present]));
        const next: Record<string, boolean> = {};
        for (const student of roster) {
          next[student.id] = savedById.get(student.id) ?? true;
        }
        setPresentById(next);
        setPeriodLoading(false);
      })
      .catch(() => {
        if (active) {
          setPeriodLoading(false);
          setLoadError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [periodKey, roster, attendance]);

  // One mark per student for the selected period; the source of truth for both
  // the live counts and the save payload (Req 5.4).
  const marks = useMemo<AttendanceMark[]>(
    () => roster.map((student) => ({ studentId: student.id, present: presentById[student.id] ?? true })),
    [roster, presentById],
  );

  // Live present/absent tally via the shared pure function (Req 5.3).
  const counts = useMemo(() => liveCounts(marks), [marks]);

  const setPresent = useCallback((studentId: string, present: boolean) => {
    setPresentById((prev) => ({ ...prev, [studentId]: present }));
    setSaveState('idle');
  }, []);

  const setAll = useCallback(
    (present: boolean) => {
      setPresentById(() => {
        const next: Record<string, boolean> = {};
        for (const student of roster) {
          next[student.id] = present;
        }
        return next;
      });
      setSaveState('idle');
    },
    [roster],
  );

  const handleSave = useCallback(async () => {
    if (!periodKey) {
      return;
    }
    setSaving(true);
    setSaveState('idle');
    try {
      await attendance.savePeriod(periodKey, marks);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    } finally {
      setSaving(false);
    }
  }, [attendance, marks, periodKey]);

  const busy = rosterLoading || periodLoading;

  // Derive display labels for header subtitle
  const selectedSubject = subjects.find((s) => s.id === subjectId)?.name ?? '—';
  const selectedSection = sections.find((s) => s.id === sectionId)?.name ?? '—';

  // Count students below 75% (placeholder logic based on current marks)
  const belowThreshold = useMemo(() => {
    return roster.filter((s) => {
      const present = presentById[s.id] ?? true;
      return termPercent(present) < 75;
    }).length;
  }, [roster, presentById]);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6">
      {/* Header with title, subtitle, and action buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text">Attendance</h2>
          <p className="mt-0.5 text-sm text-soft">
            Mark today — {selectedSubject} · {selectedSection}
          </p>
        </div>
        {periodKey && roster.length > 0 && !busy && !loadError && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAll(true)}
              className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 transition hover:bg-green-100"
            >
              All present
            </button>
            <button
              type="button"
              onClick={() => setAll(false)}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-100"
            >
              All absent
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* Period selector — compact single row (Req 5.1, 5.2) */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm sm:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <label htmlFor="attendance-section" className="text-xs font-medium text-soft">
            Section
          </label>
          <select
            id="attendance-section"
            className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
          >
            <option value="">Select…</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-0.5">
          <label htmlFor="attendance-subject" className="text-xs font-medium text-soft">
            Subject
          </label>
          <select
            id="attendance-subject"
            className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">Select…</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-0.5">
          <label htmlFor="attendance-date" className="text-xs font-medium text-soft">
            Date
          </label>
          <input
            id="attendance-date"
            type="date"
            className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-0.5">
          <label htmlFor="attendance-timeslot" className="text-xs font-medium text-soft">
            Period
          </label>
          <select
            id="attendance-timeslot"
            className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
            value={timeSlot}
            onChange={(e) => setTimeSlot(e.target.value)}
          >
            <option value="">Select…</option>
            {timeSlots.map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary pills row */}
      {periodKey && roster.length > 0 && !busy && !loadError && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
            <span aria-hidden="true">✓</span> {counts.present} Present
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
            <span aria-hidden="true">✕</span> {counts.absent} Absent
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
            <span aria-hidden="true">⚠</span> {belowThreshold} Below 75%
          </span>
        </div>
      )}

      {/* Save state feedback */}
      {saveState === 'saved' && (
        <div role="status" className="rounded-lg bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
          Attendance saved successfully.
        </div>
      )}
      {saveState === 'error' && (
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
          {messages.error.saveFailed}
        </div>
      )}

      {/* Roster table (Req 5.1, 5.3, 5.4, 5.5) */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {!periodKey ? (
          <div className="px-6 py-10 text-center text-sm text-soft">
            Choose a section, subject, date, and period to load the roster.
          </div>
        ) : busy ? (
          <div className="px-6 py-10 text-center text-sm text-soft">Loading attendance…</div>
        ) : loadError ? (
          <div role="alert" className="px-6 py-10 text-center text-sm font-medium text-red-600">
            {messages.error.generic}
          </div>
        ) : roster.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-soft">
            {messages.emptyState.noStudents}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_80px_90px_120px] items-center border-b border-border bg-gray-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-soft sm:px-6">
              <span>Student</span>
              <span className="text-center">Roll</span>
              <span className="text-center">Term %</span>
              <span className="text-center">Today</span>
            </div>

            {/* Table rows */}
            <ul className="divide-y divide-border">
              {roster.map((student, idx) => {
                const present = presentById[student.id] ?? true;
                const pct = termPercent(present);
                return (
                  <li
                    key={student.id}
                    className={
                      'grid grid-cols-[1fr_80px_90px_120px] items-center px-4 py-3 sm:px-6 ' +
                      (idx % 2 === 1 ? 'bg-gray-50/50' : '')
                    }
                  >
                    {/* Student avatar + name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                        {getInitials(student.name)}
                      </div>
                      <span className="truncate text-sm font-medium text-text">
                        {student.name}
                      </span>
                    </div>

                    {/* Roll number */}
                    <span className="text-center text-sm text-soft">
                      {student.enrollmentNumber ?? '—'}
                    </span>

                    {/* Term attendance % */}
                    <span
                      className={
                        'text-center text-sm font-medium ' +
                        (pct < 75 ? 'text-amber-600' : 'text-green-600')
                      }
                    >
                      {pct}%
                    </span>

                    {/* Today toggle */}
                    <div
                      className="flex items-center justify-center"
                      role="radiogroup"
                      aria-label={`Attendance for ${student.name}`}
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={present}
                        onClick={() => setPresent(student.id, !present)}
                        className={
                          'relative inline-flex h-7 w-14 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-1 ' +
                          (present ? 'bg-green-500' : 'bg-red-400')
                        }
                      >
                        <span
                          className={
                            'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ' +
                            (present ? 'translate-x-8' : 'translate-x-1')
                          }
                        />
                        <span className="sr-only">
                          {present ? 'Present' : 'Absent'}
                        </span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
