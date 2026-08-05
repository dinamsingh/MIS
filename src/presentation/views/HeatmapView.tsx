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
import { messages } from '@domain/shared/messages';
import { formatSectionLabel } from '@presentation/format/sectionLabel';
import { CalendarSkeleton } from '@presentation/components/skeletons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A selectable section option rendered in the dropdown. */
export interface HeatmapSectionOption {
  readonly id: string;
  readonly name: string;
  readonly batch?: string | null;
  readonly semester?: string | null;
  readonly department?: string | null;
}



/**
 * Persistence port: the contract the view depends on. Structurally compatible
 * with `HeatmapAccess` from the data layer.
 */
export interface HeatmapPersistence {
  loadDayHeatLevels(sectionId: string): Promise<Record<string, number>>;
}



export interface HeatmapViewProps {
  /** Sections the teacher can view heatmap for. */
  sections: readonly HeatmapSectionOption[];

  /** The heatmap persistence port. */
  heatmap: HeatmapPersistence;
  /** Render as an embedded panel inside another report page. */
  compact?: boolean;
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



// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HeatmapView({
  sections,

  heatmap,
  compact = false,
}: HeatmapViewProps) {
  const [sectionId, setSectionId] = useState('');

  // Calendar navigation
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // Data state
  const [dayLevels, setDayLevels] = useState<Record<string, number>>({});

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
      return;
    }
    let active = true;
    setLoading(true);
    setError(false);

    Promise.all([
      heatmap.loadDayHeatLevels(sectionId),
    ])
      .then(([levels]) => {
        if (!active) return;
        setDayLevels(levels);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
        setError(true);
      });

    return () => { active = false; };
  }, [sectionId, heatmap]);

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



  const FIELD_CLASS =
    'w-full rounded-button border border-border bg-surface px-3 py-2 text-sm text-text ' +
    'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

  return (
    <section className={compact ? 'flex flex-col gap-3' : 'flex flex-col gap-6'}>
      {/* Header */}
      {!compact && <header>
        <h2 className="text-2xl font-bold text-text">
          Attendance Heatmap 🗓️
        </h2>
        <p className="mt-1 text-sm text-text-soft">
          Full-semester attendance at a glance.
        </p>
      </header>}

      {/* Section selection */}
      {!compact && <div className="max-w-xs">
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
              {formatSectionLabel(section)}
            </option>
          ))}
        </select>
      </div>}

      {/* Content area */}
      {!sectionId ? (
        <div className={compact ? 'rounded-control border border-border bg-background p-4' : 'card p-6'}>
          <p className="text-sm text-text-soft">Choose a section to view the attendance heatmap.</p>
        </div>
      ) : loading ? (
        <CalendarSkeleton />
      ) : error ? (
        <div className={compact ? 'rounded-control border border-border bg-background p-4' : 'card p-6'}>
          <p role="alert" className="text-sm font-medium text-status-red">
            {messages.error.generic}
          </p>
        </div>
      ) : (
        <div className={compact ? 'w-full flex flex-col p-2' : 'w-full card p-5 sm:p-6 flex flex-col'}>
          <div className={compact ? 'mb-3 flex items-center justify-between gap-3' : 'flex items-center justify-between mb-5'}>
              <h3 className={compact ? 'text-sm font-black text-text' : 'text-base font-semibold text-text'}>Daily attendance</h3>
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
                  <div className={compact ? 'grid min-w-[260px] grid-cols-7 gap-1' : 'grid grid-cols-7 gap-1.5 min-w-[280px]'}>
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
                            `${compact ? 'aspect-square rounded-[6px] text-[11px]' : 'aspect-square rounded-md text-xs'} flex items-center justify-center font-medium transition-colors ` +
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
                <div className={compact ? 'mt-3 flex items-center gap-1.5 text-[11px] text-text-soft' : 'flex items-center gap-2 mt-5 text-xs text-text-soft'}>
                  <span>Less</span>
                  <span className="inline-block h-3.5 w-3.5 rounded-sm bg-green-200" />
                  <span className="inline-block h-3.5 w-3.5 rounded-sm bg-green-300" />
                  <span className="inline-block h-3.5 w-3.5 rounded-sm bg-green-400" />
                  <span className="inline-block h-3.5 w-3.5 rounded-sm bg-green-500" />
                  <span className="inline-block h-3.5 w-3.5 rounded-sm bg-green-700" />
                  <span>More</span>
                </div>
              </>
            )}
          </div>
      )}
    </section>
  );
}
