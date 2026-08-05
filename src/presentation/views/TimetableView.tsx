/**
 * Timetable module view (task 18.1, updated task 23.1).
 *
 * Renders the teacher's weekly class schedule as a grid organized by day of
 * week (columns) and time slot (rows), and lets the teacher add or edit a class
 * session entry that is persisted with its Section and subject and then shown in
 * the corresponding day/time-slot cell (Requirements 14.1, 14.2).
 *
 * Phase 4 additions: Period_Catalog-driven period selection (Req 13.4/13.5),
 * room, isTutorial, specialActivity fields (Req 15.1-15.3), and consecutive-
 * span validation (Req 14.3).
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
  SpecialActivity,
} from '@domain/services/timetableService';
import { isConsecutiveSpan } from '@domain/services/timetableService';
import type {
  TimetableAccess,
  TimetableEntryInput,
  PeriodOption,
  ConfirmResult,
  UnlockResult,
} from '@data/access/timetableAccess';
import { messages } from '@domain/shared/messages';
import { formatSectionLabel } from '@presentation/format/sectionLabel';

/** A selectable Section option (id + label + optional descriptors) for the picker. */
export interface SectionOption {
  readonly id: string;
  readonly name: string;
  readonly batch?: string | null;
  readonly semester?: string | null;
  readonly department?: string | null;
}

/** A selectable subject option (id + human label) for the entry editor. */
export interface SubjectOption {
  readonly id: string;
  readonly name: string;
}

/** The persistence slice this view needs from the timetable data-access layer. */
export type TimetableViewAccess = Pick<
  TimetableAccess,
  'listEntries' | 'upsertEntry' | 'deleteEntry' | 'listPeriods' | 'confirmTimetable' | 'unlockTimetable' | 'getTimetableStatus'
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

/** The five allowed special_activity values per the CHECK constraint in 0050. */
const SPECIAL_ACTIVITIES: readonly { value: SpecialActivity; label: string }[] = [
  { value: 'library', label: 'Library' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'club_activities', label: 'Club Activities' },
  { value: 'sports', label: 'Sports' },
  { value: 'ncc_nss', label: 'NCC/NSS' },
];

/** Editor state for the add/edit class-session dialog. */
interface EditorState {
  /** `add` creates a new entry; `edit` updates the entry identified by `id`. */
  readonly mode: 'add' | 'edit';
  readonly id?: string;
  readonly dayOfWeek: DayOfWeek;
  readonly timeSlot: string;
  readonly subjectId: string;
  /** Period_Catalog-driven period selection (Requirement 13.4/13.5). */
  readonly periodId: string;
  /** For multi-period lab spans (Requirement 14.1). */
  readonly spanPeriods: number;
  /** Room/location (Requirement 15.1). */
  readonly room: string;
  /** Tutorial marker (Requirement 15.2). */
  readonly isTutorial: boolean;
  /** Special non-subject activity (Requirement 15.3). */
  readonly specialActivity: SpecialActivity | '';
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
  const [periods, setPeriods] = useState<readonly PeriodOption[]>([]);
  const [timetableStatus, setTimetableStatus] = useState<'draft' | 'confirmed'>('draft');
  const [isConfirming, setIsConfirming] = useState(false);

  /** Whether add/edit/delete controls should be disabled (section is confirmed). */
  const isLocked = timetableStatus === 'confirmed';

  // Current day for column highlighting
  const today: DayOfWeek | undefined = DAY_INDEX_MAP[new Date().getDay()];
  const [selectedMobileDay, setSelectedMobileDay] = useState<DayOfWeek>(today ?? 'monday');

  // Load the Period_Catalog once on mount.
  useEffect(() => {
    void access.listPeriods().then(setPeriods).catch(() => setPeriods([]));
  }, [access]);

  // Load the timetable status for the selected section.
  useEffect(() => {
    if (sectionId === '') {
      setTimetableStatus('draft');
      return;
    }
    void access.getTimetableStatus(sectionId).then(setTimetableStatus).catch(() => setTimetableStatus('draft'));
  }, [access, sectionId]);

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
      periodId: periods[0]?.id ?? '',
      spanPeriods: 1,
      room: '',
      isTutorial: false,
      specialActivity: '',
    });
  }

  function openEdit(entry: TimetableEntry) {
    setEditor({
      mode: 'edit',
      id: entry.id,
      dayOfWeek: entry.dayOfWeek,
      timeSlot: entry.timeSlot,
      subjectId: entry.subjectId,
      periodId: entry.periodId ?? periods[0]?.id ?? '',
      spanPeriods: entry.spanPeriods,
      room: entry.room ?? '',
      isTutorial: entry.isTutorial,
      specialActivity: entry.specialActivity ?? '',
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

    // Determine if a subject is required: when specialActivity is not set,
    // subjectId is required (or when isTutorial, subjectId always required).
    const hasSpecialActivity = editor.specialActivity !== '';
    const needsSubject = !hasSpecialActivity || editor.isTutorial;
    if (needsSubject && editor.subjectId === '') {
      setError(messages.error.generic);
      return;
    }
    if (editor.periodId === '') {
      setError(messages.error.generic);
      return;
    }

    // Validate consecutive span (Requirement 14.3): only when spanPeriods > 1.
    if (editor.spanPeriods > 1) {
      const startPeriod = periods.find((p) => p.id === editor.periodId);
      if (startPeriod) {
        const spannedPeriods = periods.filter(
          (p) =>
            p.dayType === startPeriod.dayType &&
            p.sortOrder >= startPeriod.sortOrder &&
            p.sortOrder < startPeriod.sortOrder + editor.spanPeriods,
        );
        if (!isConsecutiveSpan(spannedPeriods)) {
          setError(messages.timetable.periodsNotConsecutive);
          return;
        }
      }
    }

    // Resolve the time slot label from the selected period for storage.
    const selectedPeriod = periods.find((p) => p.id === editor.periodId);
    const resolvedTimeSlot = selectedPeriod
      ? `${selectedPeriod.startTime}-${selectedPeriod.endTime}`
      : editor.timeSlot.trim();

    const input: TimetableEntryInput = {
      ...(editor.id !== undefined ? { id: editor.id } : {}),
      sectionId,
      subjectId: needsSubject ? editor.subjectId : undefined,
      dayOfWeek: editor.dayOfWeek,
      timeSlot: resolvedTimeSlot,
      periodId: editor.periodId,
      spanPeriods: editor.spanPeriods,
      room: editor.room.trim() || undefined,
      isTutorial: editor.isTutorial,
      specialActivity: hasSpecialActivity ? (editor.specialActivity as SpecialActivity) : null,
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

  async function handleConfirm() {
    if (sectionId === '') return;
    setIsConfirming(true);
    setError(null);
    try {
      const result: ConfirmResult = await access.confirmTimetable(sectionId);
      if (result.status === 'confirmed') {
        setTimetableStatus('confirmed');
      } else if (result.status === 'denied' && result.reason === 'conflict') {
        // Surface the conflict detail inline using the message catalog.
        const conflict = result as Extract<ConfirmResult, { reason: 'conflict' }>;
        const conflictMessage = messages.timetable.conflict(
          conflict.conflictingDay,
          conflict.entryB.period,
          conflict.entryB.sectionId,
          conflict.entryB.sectionId,
          conflict.entryB.subjectId,
        );
        setError(conflictMessage);
      } else {
        setError(messages.error.generic);
      }
    } catch {
      setError(messages.error.generic);
    } finally {
      setIsConfirming(false);
    }
  }

  async function handleUnlock() {
    if (sectionId === '') return;
    setIsConfirming(true);
    setError(null);
    try {
      const result: UnlockResult = await access.unlockTimetable(sectionId);
      if (result.status === 'unlocked' || result.status === 'already-draft') {
        setTimetableStatus('draft');
      } else {
        setError(messages.error.generic);
      }
    } catch {
      setError(messages.error.generic);
    } finally {
      setIsConfirming(false);
    }
  }

  /** Display label for an entry in the grid cell. */
  function entryLabel(entry: TimetableEntry): string {
    if (entry.specialActivity) {
      const act = SPECIAL_ACTIVITIES.find((a) => a.value === entry.specialActivity);
      return act?.label ?? entry.specialActivity;
    }
    const name = subjectName(entry.subjectId);
    if (entry.isTutorial) return `${name}-T`;
    return name;
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
              Your weekly classes at a glance.
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
                    {formatSectionLabel(section)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Confirm/Unlock actions (Requirement 16.3-16.6) */}
        {sections.length > 0 && sectionId !== '' && (
          <div className="flex items-center gap-3 border-t border-border/50 pt-4 mt-4 sm:border-t-0 sm:pt-0 sm:mt-0">
            {timetableStatus === 'draft' ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleConfirm()}
                disabled={isConfirming || entries.length === 0}
                aria-label="Confirm Timetable"
              >
                {isConfirming ? 'Confirming…' : 'Confirm Timetable'}
              </button>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-status-green/10 px-3 py-1 text-xs font-semibold text-status-green">
                  <span className="inline-block h-2 w-2 rounded-full bg-status-green" />
                  Confirmed
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void handleUnlock()}
                  disabled={isConfirming}
                  aria-label="Unlock Timetable"
                >
                  {isConfirming ? 'Unlocking…' : 'Unlock Timetable'}
                </button>
              </>
            )}
          </div>
        )}
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
          {/* Mobile Day Selector */}
          <div className="sm:hidden flex overflow-x-auto no-scrollbar border-b border-border/50 bg-surface p-2 gap-2">
            {DAYS.map(day => (
              <button
                key={day.value}
                onClick={() => setSelectedMobileDay(day.value)}
                className={`flex-none px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${selectedMobileDay === day.value ? 'bg-accent text-white shadow-sm' : 'bg-accent/5 text-soft hover:text-text'}`}
              >
                {day.label}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-full sm:min-w-[700px] border-collapse text-sm">
              <thead>
                <tr className="bg-surface">
                  <th className="w-[60px] sm:w-20 border-b border-border px-2 sm:px-3 py-3 text-left text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-soft">
                    Time
                  </th>
                  {DAYS.map((day) => (
                    <th
                      key={day.value}
                      className={`border-b border-border px-2 sm:px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider ${
                        today === day.value
                          ? 'bg-accent/5 text-accent'
                          : 'text-text'
                      } ${day.value === selectedMobileDay ? '' : 'hidden sm:table-cell'}`}
                    >
                      <span className="hidden sm:inline">{day.label}</span>
                      <span className="sm:hidden text-accent">{day.label} Schedule</span>
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
                          } ${day.value === selectedMobileDay ? '' : 'hidden sm:table-cell'}`}
                        >
                          <div className="flex flex-col gap-1.5 min-h-[40px]">
                            {cellEntries.map((entry) => (
                              <button
                                key={entry.id}
                                type="button"
                                onClick={() => !isLocked && openEdit(entry)}
                                disabled={isLocked}
                                className={`group w-full rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                                  isLocked
                                    ? 'bg-accent/10 cursor-not-allowed opacity-75'
                                    : 'bg-accent/10 hover:bg-accent/20'
                                }`}
                              >
                                <span className="block text-xs font-semibold text-accent">
                                  {entryLabel(entry)}
                                </span>
                                <span className="block text-[10px] text-soft group-hover:text-text">
                                  {sectionName(entry.sectionId)}
                                  {entry.room ? ` · ${entry.room}` : ''}
                                </span>
                              </button>
                            ))}
                            {cellEntries.length === 0 && !isLocked && (
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
            className="card relative z-50 w-full max-w-sm p-6 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-base font-semibold text-text">
              {editor.mode === 'add' ? 'Add class session' : 'Edit class session'}
            </h3>
            <form className="mt-4 flex flex-col gap-4" onSubmit={handleSave}>
              {/* Day */}
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

              {/* Period selection (replaces free-text time slot, Req 13.4/13.5) */}
              <div className="flex flex-col gap-1">
                <label htmlFor="entry-period" className="text-sm font-medium text-text">
                  Period
                </label>
                <select
                  id="entry-period"
                  value={editor.periodId}
                  onChange={(e) =>
                    setEditor({ ...editor, periodId: e.target.value })
                  }
                  className={inputClass}
                >
                  {periods.length === 0 && <option value="">No periods available</option>}
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.label} ({period.startTime}–{period.endTime})
                    </option>
                  ))}
                </select>
              </div>

              {/* Span periods (for labs, Req 14.1) */}
              <div className="flex flex-col gap-1">
                <label htmlFor="entry-span" className="text-sm font-medium text-text">
                  Span (periods)
                </label>
                <input
                  id="entry-span"
                  type="number"
                  min={1}
                  max={periods.length || 8}
                  value={editor.spanPeriods}
                  onChange={(e) =>
                    setEditor({ ...editor, spanPeriods: Math.max(1, parseInt(e.target.value, 10) || 1) })
                  }
                  className={inputClass}
                />
              </div>

              {/* Special Activity (Req 15.3) */}
              <div className="flex flex-col gap-1">
                <label htmlFor="entry-activity" className="text-sm font-medium text-text">
                  Special Activity
                </label>
                <select
                  id="entry-activity"
                  value={editor.specialActivity}
                  onChange={(e) =>
                    setEditor({ ...editor, specialActivity: e.target.value as SpecialActivity | '' })
                  }
                  className={inputClass}
                >
                  <option value="">None (regular subject)</option>
                  {SPECIAL_ACTIVITIES.map((act) => (
                    <option key={act.value} value={act.value}>
                      {act.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject (hidden when specialActivity is set and not tutorial) */}
              {(editor.specialActivity === '' || editor.isTutorial) && (
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
              )}

              {/* Room (Req 15.1) */}
              <div className="flex flex-col gap-1">
                <label htmlFor="entry-room" className="text-sm font-medium text-text">
                  Room
                </label>
                <input
                  id="entry-room"
                  type="text"
                  value={editor.room}
                  onChange={(e) => setEditor({ ...editor, room: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. Lab 301"
                />
              </div>

              {/* Tutorial marker (Req 15.2) */}
              <div className="flex items-center gap-2">
                <input
                  id="entry-tutorial"
                  type="checkbox"
                  checked={editor.isTutorial}
                  onChange={(e) => setEditor({ ...editor, isTutorial: e.target.checked })}
                  className="h-4 w-4 rounded border-border text-accent focus:ring-accent/30"
                />
                <label htmlFor="entry-tutorial" className="text-sm font-medium text-text">
                  Tutorial
                </label>
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
