/**
 * My Schedule — pure presentational weekly grid (task 26.2).
 *
 * Renders the teacher's unified weekly schedule across ALL of their
 * `teacher_assignments` as a read-only grid: days as columns (Mon–Sat),
 * periods/time slots as rows. Each cell shows the formatted label via
 * `formatScheduleCellLabel` (Requirement 17.2) plus the optional room.
 *
 * This component is intentionally disconnected from `SelectedSectionContext`
 * (Requirement 17.4) — it renders the aggregated multi-section schedule
 * fetched by `fetchMySchedule`.
 *
 * Grid/table styling follows the same card + table conventions established
 * in `TimetableView.tsx`.
 */

import { useMemo } from 'react';
import type { DayOfWeek } from '@domain/services/timetableService';
import { formatScheduleCellLabel, type MyScheduleCell } from '@data/access/mySchedule';

export interface MyScheduleViewProps {
  /** All cells for the teacher's unified schedule (from `fetchMySchedule`). */
  readonly cells: readonly MyScheduleCell[];
  /** Whether the data is still loading. */
  readonly loading: boolean;
  /** Whether an error occurred during loading. */
  readonly loadError: boolean;
  /** Retry callback. */
  readonly onRetry: () => void;
}

/** The six weekdays the weekly grid shows, in display order (Mon–Sat). */
const DAYS: readonly { value: DayOfWeek; label: string }[] = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
];

/** Map JS getDay() to our DayOfWeek for current-day highlighting. */
const DAY_INDEX_MAP: Record<number, DayOfWeek> = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

export default function MyScheduleView({
  cells,
  loading,
  loadError,
  onRetry,
}: MyScheduleViewProps) {
  const today: DayOfWeek | undefined = DAY_INDEX_MAP[new Date().getDay()];

  // Derive sorted row slots from the cells' time slots.
  const rowSlots = useMemo(() => {
    const slots = new Set<string>();
    for (const cell of cells) {
      slots.add(cell.entry.timeSlot);
    }
    return [...slots].sort();
  }, [cells]);

  // Index cells by `${day}|${slot}` for O(1) cell lookup.
  const cellsByKey = useMemo(() => {
    const map = new Map<string, MyScheduleCell[]>();
    for (const cell of cells) {
      const key = `${cell.entry.dayOfWeek}|${cell.entry.timeSlot}`;
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(cell);
      } else {
        map.set(key, [cell]);
      }
    }
    return map;
  }, [cells]);

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="card px-6 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-text">
              My Schedule 📅{' '}
              <span className="ml-1 inline-block rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">
                NEW
              </span>
            </h2>
            <p className="mt-1 text-sm text-soft">
              Your complete weekly schedule across all sections.
            </p>
          </div>
        </div>
      </div>

      {/* Error state */}
      {loadError && (
        <div className="card px-6 py-10 text-center">
          <p className="text-sm text-status-red">Failed to load schedule.</p>
          <button
            type="button"
            className="btn-primary mt-4"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !loadError && (
        <div className="card px-6 py-10 text-center">
          <p className="text-sm text-muted animate-pulse">Loading schedule…</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !loadError && cells.length === 0 && (
        <div className="card px-6 py-10 text-center">
          <p className="text-sm text-soft">
            No scheduled classes found. Your timetable entries will appear here once added.
          </p>
        </div>
      )}

      {/* Grid */}
      {!loading && !loadError && cells.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-sm">
              <thead>
                <tr className="bg-surface">
                  <th className="w-20 border-b border-border px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-soft">
                    Time
                  </th>
                  {DAYS.map((day) => (
                    <th
                      key={day.value}
                      className={`border-b border-border px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider ${
                        today === day.value
                          ? 'bg-accent/5 text-accent'
                          : 'text-text'
                      }`}
                    >
                      {day.label}
                      {today === day.value && (
                        <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowSlots.map((slot, idx) => (
                  <tr
                    key={slot}
                    className={idx % 2 === 0 ? 'bg-surface' : 'bg-surface/50'}
                  >
                    <th
                      scope="row"
                      className="border-b border-border/50 px-3 py-3 text-left text-xs font-semibold text-soft"
                    >
                      {slot}
                    </th>
                    {DAYS.map((day) => {
                      const dayCells =
                        cellsByKey.get(`${day.value}|${slot}`) ?? [];
                      const isToday = today === day.value;
                      return (
                        <td
                          key={day.value}
                          className={`border-b border-border/50 px-2 py-2 ${
                            isToday ? 'bg-accent/[0.03]' : ''
                          }`}
                        >
                          <div className="flex flex-col gap-1.5 min-h-[40px]">
                            {dayCells.map((cell) => (
                              <div
                                key={cell.entry.id}
                                className="w-full rounded-lg bg-accent/10 px-2.5 py-1.5 text-left"
                              >
                                <span className="block text-xs font-semibold text-accent">
                                  {formatScheduleCellLabel(cell.sem, cell.section, cell.subjectName)}
                                </span>
                                {cell.entry.room && (
                                  <span className="block text-[10px] text-soft">
                                    {cell.entry.room}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
