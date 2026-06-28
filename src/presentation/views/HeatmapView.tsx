/**
 * Heatmap module UI (task 19.2).
 *
 * The teacher-facing surface for the attendance heatmap and defaulter list.
 * It renders two sections:
 *
 *  - **Calendar-style grid** — a month grid where each day cell is colored by
 *    its aggregated attendance level across that day's periods (Req 13.1).
 *    Coloring uses a green gradient:
 *      • darker green (≥ 75 %) — high attendance
 *      • medium green (50–74 %) — moderate attendance
 *      • light green (< 50 %) — low attendance
 *      • transparent — no data for that day
 *  - **Defaulter list** — students whose attendance percentage is strictly
 *    below 75 % (Req 13.3), recomputed on load (Req 13.4).
 *
 * Domain logic is sourced from the pure `heatmapService` functions (via the
 * `HeatmapAccess` port). The view's persistence port matches the data-access
 * layer so production wires the Supabase-backed `createHeatmapAccess` while
 * tests supply an in-memory fake.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  attendancePercent,
  DEFAULTER_THRESHOLD,
  type StudentAttendance,
} from '@domain/services/heatmapService';
import { messages } from '@domain/shared/messages';
import { CalendarSkeleton } from '@presentation/components/skeletons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A selectable section option rendered in the dropdown. */
export interface HeatmapSectionOption {
  readonly id: string;
  readonly name: string;
}

/** A student entry to display in the defaulter list. */
export interface HeatmapStudent {
  readonly id: string;
  readonly name: string;
  readonly enrollmentNumber?: string;
}

/**
 * Persistence port: the contract the view depends on. Structurally compatible
 * with `HeatmapAccess` from the data layer.
 */
export interface HeatmapPersistence {
  loadStudentAttendance(sectionId: string): Promise<StudentAttendance[]>;
  loadDefaulters(sectionId: string): Promise<string[]>;
  loadDayHeatLevels(sectionId: string): Promise<Record<string, number>>;
}

/** Loads student info for display in the defaulter list. */
export type LoadStudents = (sectionId: string) => Promise<HeatmapStudent[]>;

export interface HeatmapViewProps {
  /** Sections the teacher can view heatmap for. */
  sections: readonly HeatmapSectionOption[];
  /** Loads student info (name, enrollment) for the selected section. */
  loadStudents: LoadStudents;
  /** The heatmap persistence port. */
  heatmap: HeatmapPersistence;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Day-of-week headers (Sun–Sat). */
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Get all calendar days in a month grid including leading/trailing blanks. */
function calendarGrid(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }
  return cells;
}

/** Format `YYYY-MM-DD` from year, month (0-indexed), day. */
function isoDate(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/** Green gradient background style for a heat-level percentage. */
function heatColorStyle(level: number): string {
  if (level >= 90) return 'bg-green-700';
  if (level >= 75) return 'bg-green-600';
  if (level >= 60) return 'bg-green-500';
  if (level >= 50) return 'bg-green-400';
  if (level >= 25) return 'bg-green-300';
  return 'bg-green-200';
}

/** Month names for display. */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Extract initials from a name (first letter of first and last word). */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HeatmapView({
  sections,
  loadStudents,
  heatmap,
}: HeatmapViewProps) {
  const [sectionId, setSectionId] = useState('');

  // Calendar navigation
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // Data state
  const [dayLevels, setDayLevels] = useState<Record<string, number>>({});
  const [studentAttendance, setStudentAttendance] = useState<StudentAttendance[]>([]);
  const [defaulterIds, setDefaulterIds] = useState<string[]>([]);
  const [students, setStudents] = useState<HeatmapStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Auto-select the first section when the options load or change
  useEffect(() => {
    if (sections.length > 0) {
      if (!sections.some((s) => s.id === sectionId)) {
        setSectionId(sections[0].id);
      }
    } else {
      setSectionId('');
    }
  }, [sections, sectionId]);

  // Load all heatmap data when section changes (Req 13.4: recomputed on load)
  useEffect(() => {
    if (!sectionId) {
      setDayLevels({});
      setStudentAttendance([]);
      setDefaulterIds([]);
      setStudents([]);
      return;
    }
    let active = true;
    setLoading(true);
    setError(false);

    Promise.all([
      heatmap.loadDayHeatLevels(sectionId),
      heatmap.loadStudentAttendance(sectionId),
      heatmap.loadDefaulters(sectionId),
      loadStudents(sectionId),
    ])
      .then(([levels, attendance, dIds, studs]) => {
        if (!active) return;
        setDayLevels(levels);
        setStudentAttendance(attendance);
        setDefaulterIds(dIds);
        setStudents(studs);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
        setError(true);
      });

    return () => { active = false; };
  }, [sectionId, heatmap, loadStudents]);

  // Calendar grid cells for the current view month
  const grid = useMemo(() => calendarGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  // Navigate months
  const goToPreviousMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  // Defaulters with student info
  const defaulterList = useMemo(() => {
    const idSet = new Set(defaulterIds);
    return students
      .filter((s) => idSet.has(s.id))
      .map((s) => {
        const att = studentAttendance.find((a) => a.studentId === s.id);
        const pct = att ? attendancePercent(att.attendedPeriods, att.totalHeldPeriods) : 0;
        return { ...s, attendancePercent: pct };
      })
      .sort((a, b) => a.attendancePercent - b.attendancePercent);
  }, [defaulterIds, students, studentAttendance]);

  // Export defaulter list as CSV
  const handleExport = useCallback(() => {
    if (defaulterList.length === 0) return;
    const header = 'Name,Roll Number,Attendance %';
    const rows = defaulterList.map(
      (s) => `${s.name},${s.enrollmentNumber ?? ''},${s.attendancePercent.toFixed(1)}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'defaulters.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [defaulterList]);

  const FIELD_CLASS =
    'w-full rounded-button border border-border bg-surface px-3 py-2 text-sm text-text ' +
    'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

  return (
    <section className="flex flex-col gap-6">
      {/* Header */}
      <header>
        <h2 className="text-2xl font-bold text-text">
          Attendance Heatmap 🗓️
        </h2>
        <p className="mt-1 text-sm text-text-soft">
          Poore semester ka attendance ek nazar me.
        </p>
      </header>

      {/* Section selection */}
      <div className="max-w-xs">
        <select
          id="heatmap-section"
          className={FIELD_CLASS}
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          aria-label="Section"
        >
          <option value="">Select section</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
      </div>

      {/* Content area */}
      {!sectionId ? (
        <div className="card p-6">
          <p className="text-sm text-text-soft">Choose a section to view the attendance heatmap.</p>
        </div>
      ) : loading ? (
        <CalendarSkeleton />
      ) : error ? (
        <div className="card p-6">
          <p role="alert" className="text-sm font-medium text-status-red">
            {messages.error.generic}
          </p>
        </div>
      ) : (
        /* Two-column layout: Calendar (left, larger) | Defaulters (right) */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column — Daily attendance calendar */}
          <div className="lg:col-span-2 card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-text">Daily attendance</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-accent-tint text-text-soft transition-colors"
                  onClick={goToPreviousMonth}
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <span className="text-sm font-medium text-text min-w-[120px] text-center">
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </span>
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-accent-tint text-text-soft transition-colors"
                  onClick={goToNextMonth}
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
            </div>

            {Object.keys(dayLevels).length === 0 ? (
              <p className="text-sm text-text-soft">{messages.emptyState.noAttendance}</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <div className="grid grid-cols-7 gap-1.5 min-w-[280px]">
                    {/* Weekday headers */}
                    {WEEKDAY_LABELS.map((label) => (
                      <div
                        key={label}
                        className="text-center text-xs font-medium text-text-muted py-1"
                      >
                        {label}
                      </div>
                    ))}

                    {/* Day cells — green gradient */}
                    {grid.map((day, idx) => {
                      if (day === null) {
                        return <div key={`blank-${idx}`} className="aspect-square" />;
                      }
                      const dateKey = isoDate(viewYear, viewMonth, day);
                      const level = dayLevels[dateKey];
                      const hasData = level !== undefined;

                      return (
                        <div
                          key={dateKey}
                          className={
                            'aspect-square flex items-center justify-center rounded-md text-xs font-medium transition-colors ' +
                            (hasData
                              ? `${heatColorStyle(level)} text-white`
                              : 'bg-gray-100 text-text-muted')
                          }
                          title={
                            hasData
                              ? `${dateKey}: ${Math.round(level)}% attendance`
                              : `${dateKey}: No data`
                          }
                          aria-label={
                            hasData
                              ? `${dateKey}: ${Math.round(level)}% attendance`
                              : `${dateKey}: No data`
                          }
                        >
                          {day}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Legend: Less ▓▓▓▓▓ More */}
                <div className="flex items-center gap-2 mt-5 text-xs text-text-soft">
                  <span>Less</span>
                  <span className="inline-block w-4 h-4 rounded-sm bg-green-200" />
                  <span className="inline-block w-4 h-4 rounded-sm bg-green-300" />
                  <span className="inline-block w-4 h-4 rounded-sm bg-green-400" />
                  <span className="inline-block w-4 h-4 rounded-sm bg-green-500" />
                  <span className="inline-block w-4 h-4 rounded-sm bg-green-700" />
                  <span>More</span>
                </div>
              </>
            )}
          </div>

          {/* Right column — Defaulters list */}
          <div className="lg:col-span-1 card p-5 sm:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text">
                Defaulters (&lt;{DEFAULTER_THRESHOLD}%)
              </h3>
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-medium rounded-button bg-accent text-white hover:bg-accent-hover transition-colors"
                onClick={handleExport}
                disabled={defaulterList.length === 0}
              >
                Export
              </button>
            </div>

            {defaulterList.length === 0 ? (
              <p className="text-sm text-text-soft flex-1 flex items-center">
                {messages.emptyState.noDefaulters}
              </p>
            ) : (
              <ul className="flex flex-col gap-3 overflow-y-auto max-h-[420px] pr-1">
                {defaulterList.map((student) => (
                  <li
                    key={student.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-background hover:bg-gray-100 transition-colors"
                  >
                    {/* Avatar with initials */}
                    <div className="w-9 h-9 rounded-full bg-accent-tint text-accent flex items-center justify-center text-xs font-bold shrink-0">
                      {getInitials(student.name)}
                    </div>

                    {/* Name & roll */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">
                        {student.name}
                      </p>
                      {student.enrollmentNumber && (
                        <p className="truncate text-xs text-text-muted">
                          {student.enrollmentNumber}
                        </p>
                      )}
                    </div>

                    {/* Red percentage badge */}
                    <span className="shrink-0 rounded-full bg-red-100 text-status-red px-2.5 py-0.5 text-xs font-semibold">
                      {student.attendancePercent.toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
