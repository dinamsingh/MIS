/**
 * Timetable module view (task 18.1).
 *
 * Renders the teacher's weekly class schedule as a grid organized by day of
 * week (columns) and time slot (rows), and lets the teacher add or edit a class
 * session entry that is persisted with its Section and subject and then shown in
 * the corresponding day/time-slot cell (Requirements 14.1, 14.2).
 *
 * Like the other presentation views, this component performs no I/O of its own:
 * persistence is delegated to an injected {@link TimetableAccess} slice (the
 * Supabase-backed `timetableAccess` wrapper in production) and the selectable
 * Sections/subjects are supplied as props. Keeping the data dependencies
 * injected leaves the grid/derivation logic fully testable without a live
 * database.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  DayOfWeek,
  TimetableEntry,
} from '@domain/services/timetableService';
import type {
  TimetableAccess,
  TimetableEntryInput,
} from '@data/access/timetableAccess';
import { messages } from '@domain/shared/messages';

/** A selectable Section option (id + human label) for the section picker. */
export interface SectionOption {
  readonly id: string;
  readonly name: string;
}

/** A selectable subject option (id + human label) for the entry editor. */
export interface SubjectOption {
  readonly id: string;
  readonly name: string;
}

/** The persistence slice this view needs from the timetable data-access layer. */
export type TimetableViewAccess = Pick<
  TimetableAccess,
  'listEntries' | 'upsertEntry' | 'deleteEntry'
>;

export interface TimetableViewProps {
  /** Timetable persistence (defaults to the Supabase-backed wrapper in prod). */
  access: TimetableViewAccess;
  /** Sections the teacher can view/schedule; the first is selected initially. */
  sections: readonly SectionOption[];
  /** Subjects selectable when adding/editing an entry. */
  subjects: readonly SubjectOption[];
  /** Time slots forming the grid rows; entries' own slots are merged in too. */
  timeSlots?: readonly string[];
  /** Optional initial section selection (defaults to the first section). */
  initialSectionId?: string;
}

/** The six weekdays the weekly grid shows, in display order (Req 14.1). */
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

/** Default grid rows when no `timeSlots` prop is supplied. */
const DEFAULT_TIME_SLOTS: readonly string[] = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '14:00',
  '15:00',
  '16:00',
];

/** Editor state for the add/edit class-session dialog. */
interface EditorState {
  /** `add` creates a new entry; `edit` updates the entry identified by `id`. */
  readonly mode: 'add' | 'edit';
  readonly id?: string;
  readonly dayOfWeek: DayOfWeek;
  readonly timeSlot: string;
  readonly subjectId: string;
}

const inputClass =
  'w-full rounded-button border border-border bg-surface px-3 py-2 text-sm text-text ' +
  'placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

/**
 * Weekly timetable grid with an add/edit class-session editor.
 *
 * The grid renders one column per day and one row per time slot; each cell
 * lists the entries whose day and slot match it. Saving an entry upserts it
 * through the injected access layer and reloads the section's entries so the
 * session appears in its correct cell (Requirement 14.2).
 */
export default function TimetableView({
  access,
  sections,
  subjects,
  timeSlots = DEFAULT_TIME_SLOTS,
  initialSectionId,
}: TimetableViewProps) {
  const [sectionId, setSectionId] = useState<string>(
    initialSectionId ?? sections[0]?.id ?? '',
  );
  const [entries, setEntries] = useState<readonly TimetableEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Current day for column highlighting
  const today: DayOfWeek | undefined = DAY_INDEX_MAP[new Date().getDay()];

  // Resolve a subject id to its display name, falling back to the raw id.
  const subjectName = useCallback(
    (id: string) => subjects.find((s) => s.id === id)?.name ?? id,
    [subjects],
  );

  // Resolve section name for display in cells
  const sectionName = useCallback(
    (id: string) => sections.find((s) => s.id === id)?.name ?? '',
    [sections],
  );

  // Load (or reload) the selected section's weekly entries.
  const reload = useCallback(async () => {
    if (sectionId === '') {
      setEntries([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setEntries(await access.listEntries(sectionId));
    } catch {
      setError(messages.error.generic);
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, [access, sectionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Grid rows: the configured slots unioned with any slot present in the data,
  // so every persisted entry has a row to render in. Sorted for a stable grid.
  const rowSlots = useMemo(() => {
    const slots = new Set<string>(timeSlots);
    for (const entry of entries) {
      slots.add(entry.timeSlot);
    }
    return [...slots].sort();
  }, [timeSlots, entries]);

  // Index entries by `${day}|${slot}` for O(1) cell lookup.
  const entriesByCell = useMemo(() => {
    const map = new Map<string, TimetableEntry[]>();
    for (const entry of entries) {
      const key = `${entry.dayOfWeek}|${entry.timeSlot}`;
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(entry);
      } else {
        map.set(key, [entry]);
      }
    }
    return map;
  }, [entries]);

  function openAdd(dayOfWeek: DayOfWeek, timeSlot: string) {
    setEditor({
      mode: 'add',
      dayOfWeek,
      timeSlot,
      subjectId: subjects[0]?.id ?? '',
    });
  }

  function openEdit(entry: TimetableEntry) {
    setEditor({
      mode: 'edit',
      id: entry.id,
      dayOfWeek: entry.dayOfWeek,
      timeSlot: entry.timeSlot,
      subjectId: entry.subjectId,
    });
  }

  function closeEditor() {
    setEditor(null);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editor === null || sectionId === '') {
      return;
    }
    if (editor.subjectId === '' || editor.timeSlot.trim() === '') {
      setError(messages.error.generic);
      return;
    }
    const input: TimetableEntryInput = {
      ...(editor.id !== undefined ? { id: editor.id } : {}),
      sectionId,
      subjectId: editor.subjectId,
      dayOfWeek: editor.dayOfWeek,
      timeSlot: editor.timeSlot.trim(),
    };
    setIsSaving(true);
    setError(null);
    try {
      await access.upsertEntry(input);
      closeEditor();
      await reload();
    } catch {
      setError(messages.error.generic);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (editor?.id === undefined) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await access.deleteEntry(editor.id);
      closeEditor();
      await reload();
    } catch {
      setError(messages.error.generic);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="card px-6 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-text">
              Timetable 🕛{' '}
              <span className="ml-1 inline-block rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">
                NEW
              </span>
            </h2>
            <p className="mt-1 text-sm text-soft">
              Tumhari weekly classes — ek nazar me.
            </p>
          </div>

          {/* Section selector */}
          {sections.length > 0 && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="timetable-section"
                className="text-sm font-medium text-soft"
              >
                Section:
              </label>
              <select
                id="timetable-section"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className={inputClass + ' w-auto min-w-[140px]'}
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {error !== null && (
        <p role="alert" className="rounded-lg bg-status-red/10 px-4 py-2 text-sm font-medium text-status-red">
          {error}
        </p>
      )}

      {/* Grid */}
      {sections.length === 0 ? (
        <div className="card px-6 py-10 text-center">
          <p className="text-sm text-soft">No sections available to schedule.</p>
        </div>
      ) : (
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
                      const cellEntries =
                        entriesByCell.get(`${day.value}|${slot}`) ?? [];
                      const isToday = today === day.value;
                      return (
                        <td
                          key={day.value}
                          className={`border-b border-border/50 px-2 py-2 ${
                            isToday ? 'bg-accent/[0.03]' : ''
                          }`}
                        >
                          <div className="flex flex-col gap-1.5 min-h-[40px]">
                            {cellEntries.map((entry) => (
                              <button
                                key={entry.id}
                                type="button"
                                onClick={() => openEdit(entry)}
                                className="group w-full rounded-lg bg-accent/10 px-2.5 py-1.5 text-left transition-colors hover:bg-accent/20"
                              >
                                <span className="block text-xs font-semibold text-accent">
                                  {subjectName(entry.subjectId)}
                                </span>
                                <span className="block text-[10px] text-soft group-hover:text-text">
                                  {sectionName(entry.sectionId)}
                                </span>
                              </button>
                            ))}
                            {cellEntries.length === 0 && (
                              <button
                                type="button"
                                onClick={() => openAdd(day.value, slot)}
                                aria-label={`Add class on ${day.label} at ${slot}`}
                                className="flex h-full min-h-[40px] w-full items-center justify-center rounded-lg border border-dashed border-transparent text-xs text-muted opacity-0 transition-all hover:border-accent/40 hover:text-accent hover:opacity-100 focus:opacity-100"
                              >
                                +
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Loading indicator */}
          {isLoading && (
            <div className="border-t border-border px-4 py-3">
              <p className="text-center text-xs text-muted animate-pulse">
                Loading timetable…
              </p>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {editor !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-text/40 backdrop-blur-sm"
            aria-hidden="true"
            onClick={closeEditor}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editor.mode === 'add' ? 'Add class session' : 'Edit class session'}
            className="card relative z-50 w-full max-w-sm p-6 shadow-xl"
          >
            <h3 className="text-base font-semibold text-text">
              {editor.mode === 'add' ? 'Add class session' : 'Edit class session'}
            </h3>
            <form className="mt-4 flex flex-col gap-4" onSubmit={handleSave}>
              <div className="flex flex-col gap-1">
                <label htmlFor="entry-day" className="text-sm font-medium text-text">
                  Day
                </label>
                <select
                  id="entry-day"
                  value={editor.dayOfWeek}
                  onChange={(e) =>
                    setEditor({ ...editor, dayOfWeek: e.target.value as DayOfWeek })
                  }
                  className={inputClass}
                >
                  {DAYS.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="entry-slot" className="text-sm font-medium text-text">
                  Time slot
                </label>
                <input
                  id="entry-slot"
                  type="text"
                  value={editor.timeSlot}
                  onChange={(e) => setEditor({ ...editor, timeSlot: e.target.value })}
                  className={inputClass}
                  placeholder="09:00"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="entry-subject" className="text-sm font-medium text-text">
                  Subject
                </label>
                <select
                  id="entry-subject"
                  value={editor.subjectId}
                  onChange={(e) => setEditor({ ...editor, subjectId: e.target.value })}
                  className={inputClass}
                >
                  {subjects.length === 0 && <option value="">No subjects</option>}
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                {editor.mode === 'edit' ? (
                  <button
                    type="button"
                    className="btn-secondary text-status-red hover:bg-status-red/10"
                    onClick={() => void handleDelete()}
                    disabled={isSaving}
                  >
                    Delete
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={closeEditor}
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={isSaving}>
                    {isSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
