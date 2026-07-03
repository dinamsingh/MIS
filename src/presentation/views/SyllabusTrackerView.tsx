/**
 * Syllabus Tracker view (task 20.1).
 *
 * Mockup-aligned two-column layout:
 * - Header with subject selector, subtitle, and "+ Add topic" action
 * - Left column: Topics list with checkboxes (completed ones struck through)
 * - Right column: Progress section with syllabus % bar, time elapsed % bar,
 *   and a behind-schedule warning badge when applicable
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import {
  progressPercent,
  scheduleStatus,
  type Topic,
  type Unit,
} from '@domain/services/syllabusService';
import type { SyllabusAccess } from '@data/access/syllabusAccess';
import { messages } from '@domain/shared/messages';
import { FormSkeleton } from '@presentation/components/skeletons';

/** A subject the teacher can track syllabus progress for. */
export interface SyllabusSubject {
  readonly id: string;
  readonly name: string;
}

export interface SyllabusTrackerViewProps {
  /** Subjects available to track; the first is selected by default. */
  subjects: SyllabusSubject[];
  /** Persistence wrapper for units/topics (the Supabase-backed access). */
  access: SyllabusAccess;
  /**
   * The current date used to evaluate planned progress (Req 6.6). Injectable
   * so schedule status is deterministic in tests; defaults to "now".
   */
  today?: Date;
}

/** All topics across a subject's units, used for subject-level progress. */
function subjectTopics(units: Unit[]): Topic[] {
  return units.flatMap((unit) => unit.topics);
}

/** Normalize a date to the start of its day for plan comparisons. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Planned progress for a single unit at `today`: a unit planned to be complete
 * on or before today contributes its full weight (100%), otherwise nothing.
 */
function unitPlannedPercent(unit: Unit, today: Date): number {
  if (unit.plannedDate === undefined) {
    return 0;
  }
  const planned = startOfDay(new Date(unit.plannedDate));
  return planned <= startOfDay(today) ? 100 : 0;
}

/**
 * Planned progress for the whole subject at `today`: the share of topics that
 * live in units whose planned date has arrived (Req 6.6).
 */
function subjectPlannedPercent(units: Unit[], today: Date): number {
  const total = subjectTopics(units).length;
  if (total === 0) {
    return 0;
  }
  const due = units.reduce(
    (count, unit) =>
      unitPlannedPercent(unit, today) >= 100 ? count + unit.topics.length : count,
    0,
  );
  return (due / total) * 100;
}

/** Compute the current academic week number (1-based) from a term start date. */
function currentWeekNumber(today: Date): number {
  // Approximate: assume term starts in January of the current year
  const termStart = new Date(today.getFullYear(), 0, 1);
  const diffMs = today.getTime() - termStart.getTime();
  return Math.max(1, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
}

/** Approximate total weeks in a term. */
const TOTAL_WEEKS = 18;

const inputClass =
  'rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text ' +
  'placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

/** A single topic row: completion checkbox, name, inline edit, delete. */
function TopicRow({
  topic,
  onToggle,
  onRename,
  onDelete,
}: {
  topic: Topic;
  onToggle: (topicId: string, complete: boolean) => void;
  onRename: (topicId: string, name: string) => void;
  onDelete: (topicId: string) => void;
}) {
  const [editingName, setEditingName] = useState<string | null>(null);

  function commitRename() {
    if (editingName === null) return;
    const trimmed = editingName.trim();
    if (trimmed.length > 0 && trimmed !== topic.name) {
      onRename(topic.id, trimmed);
    }
    setEditingName(null);
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-b-0 group hover:bg-surface/60 transition-colors">
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 rounded border-border text-accent focus:ring-accent/30"
        checked={topic.complete}
        aria-label={`Mark ${topic.name} complete`}
        onChange={(e) => onToggle(topic.id, e.target.checked)}
      />
      {editingName !== null ? (
        <div className="flex flex-1 items-center gap-2">
          <input
            aria-label="Topic name"
            className={`${inputClass} min-w-0 flex-1`}
            value={editingName}
            autoFocus
            onChange={(e) => setEditingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setEditingName(null);
            }}
          />
          <button type="button" className="btn-primary text-xs px-2 py-1" onClick={commitRename}>
            Save
          </button>
          <button type="button" className="btn-secondary text-xs px-2 py-1" onClick={() => setEditingName(null)}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          <span
            className={[
              'min-w-0 flex-1 truncate text-sm',
              topic.complete ? 'text-muted line-through' : 'text-text',
            ].join(' ')}
          >
            {topic.name}
          </span>
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              className="text-xs font-medium text-accent hover:underline"
              onClick={() => setEditingName(topic.name)}
            >
              Edit
            </button>
            <button
              type="button"
              className="text-xs font-medium text-status-red hover:underline"
              onClick={() => onDelete(topic.id)}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </li>
  );
}

/** Card listing a unit's topics with completion checkboxes and CRUD controls. */
function UnitCard({
  unit,
  today,
  onAddTopic,
  onRenameUnit,
  onSetUnitPlannedDate,
  onDeleteUnit,
  onToggleTopic,
  onRenameTopic,
  onDeleteTopic,
}: {
  unit: Unit;
  today: Date;
  onAddTopic: (unitId: string, name: string) => void;
  onRenameUnit: (unitId: string, name: string) => void;
  onSetUnitPlannedDate: (unitId: string, plannedDate: string | null) => void;
  onDeleteUnit: (unitId: string) => void;
  onToggleTopic: (topicId: string, complete: boolean) => void;
  onRenameTopic: (topicId: string, name: string) => void;
  onDeleteTopic: (topicId: string) => void;
}) {
  const [topicName, setTopicName] = useState('');
  const [editingName, setEditingName] = useState<string | null>(null);

  const actual = progressPercent(unit.topics);
  const planned = unitPlannedPercent(unit, today);
  const status = scheduleStatus(actual, planned);

  function submitTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = topicName.trim();
    if (trimmed.length === 0) return;
    onAddTopic(unit.id, trimmed);
    setTopicName('');
  }

  function commitRename() {
    if (editingName === null) return;
    const trimmed = editingName.trim();
    if (trimmed.length > 0 && trimmed !== unit.name) {
      onRenameUnit(unit.id, trimmed);
    }
    setEditingName(null);
  }

  const completedCount = unit.topics.filter((t) => t.complete).length;
  const totalCount = unit.topics.length;

  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      {/* Unit header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {editingName !== null ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                aria-label="Unit name"
                className={inputClass}
                value={editingName}
                autoFocus
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditingName(null);
                }}
              />
              <button type="button" className="btn-primary text-xs px-2 py-1" onClick={commitRename}>Save</button>
              <button type="button" className="btn-secondary text-xs px-2 py-1" onClick={() => setEditingName(null)}>Cancel</button>
            </div>
          ) : (
            <>
              <h3 className="truncate text-sm font-semibold text-text">{unit.name}</h3>
              <span className="text-xs text-muted">
                {completedCount} / {totalCount} taught
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {status === 'behind-schedule' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              ⚠ Behind schedule
            </span>
          )}
          {status === 'on-schedule' && unit.topics.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              ✓ On schedule
            </span>
          )}
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <span>Plan:</span>
            <input
              type="date"
              aria-label="Unit planned date"
              className="rounded border border-border bg-background px-2 py-1 text-xs text-text focus:border-accent focus:outline-none"
              value={unit.plannedDate ? unit.plannedDate.slice(0, 10) : ''}
              onChange={(e) =>
                onSetUnitPlannedDate(unit.id, e.target.value === '' ? null : e.target.value)
              }
            />
          </label>
          {editingName === null && (
            <button
              type="button"
              className="text-xs text-accent hover:underline"
              onClick={() => setEditingName(unit.name)}
            >
              Edit
            </button>
          )}
          <button
            type="button"
            className="text-xs text-status-red hover:underline"
            onClick={() => onDeleteUnit(unit.id)}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Progress bar for unit */}
      <div className="px-5 py-3 border-b border-border/30">
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-border/40">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${Math.round(actual)}%` }}
            />
          </div>
          <span className="text-xs font-medium text-muted w-10 text-right">
            {Math.round(actual)}%
          </span>
        </div>
      </div>

      {/* Topics list */}
      <div>
        {unit.topics.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">
            {messages.emptyState.noTopics}
          </p>
        ) : (
          <ul className="flex flex-col">
            {unit.topics.map((topic) => (
              <TopicRow
                key={topic.id}
                topic={topic}
                onToggle={onToggleTopic}
                onRename={onRenameTopic}
                onDelete={onDeleteTopic}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Add topic form */}
      <form className="flex items-center gap-2 px-5 py-3 border-t border-border/30" onSubmit={submitTopic}>
        <input
          aria-label="New topic name"
          className={`${inputClass} min-w-0 flex-1 text-xs`}
          placeholder="Add a topic…"
          value={topicName}
          onChange={(e) => setTopicName(e.target.value)}
        />
        <button
          type="submit"
          className="btn-primary text-xs px-3 py-1.5"
          disabled={topicName.trim().length === 0}
        >
          + Add
        </button>
      </form>
    </section>
  );
}

/** Teacher-facing syllabus tracker for the selected subject. */
export default function SyllabusTrackerView({
  subjects,
  access,
  today = new Date(),
}: SyllabusTrackerViewProps) {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    subjects[0]?.id ?? '',
  );
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unitName, setUnitName] = useState('');

  useEffect(() => {
    if (subjects.length === 0) {
      setSelectedSubjectId('');
      return;
    }
    if (!subjects.some((subject) => subject.id === selectedSubjectId)) {
      setSelectedSubjectId(subjects[0].id);
    }
  }, [selectedSubjectId, subjects]);

  const reload = useCallback(
    async (subjectId: string) => {
      if (subjectId === '') {
        setUnits([]);
        return;
      }
      try {
        const loaded = await access.listUnits(subjectId);
        setUnits(loaded);
        setError(null);
      } catch {
        setUnits([]);
        setError(messages.error.generic);
      }
    },
    [access],
  );

  useEffect(() => {
    setUnits(null);
    void reload(selectedSubjectId);
  }, [selectedSubjectId, reload]);

  const mutate = useCallback(
    async (op: () => Promise<unknown>) => {
      try {
        await op();
        await reload(selectedSubjectId);
      } catch {
        setError(messages.error.saveFailed);
      }
    },
    [reload, selectedSubjectId],
  );

  const addUnit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = unitName.trim();
      if (trimmed.length === 0 || selectedSubjectId === '') return;
      setUnitName('');
      void mutate(() => access.upsertUnit({ subjectId: selectedSubjectId, name: trimmed }));
    },
    [access, mutate, selectedSubjectId, unitName],
  );

  const renameUnit = useCallback(
    (unitId: string, name: string) => {
      const existing = units?.find((u) => u.id === unitId);
      void mutate(() =>
        access.upsertUnit({
          id: unitId,
          subjectId: selectedSubjectId,
          name,
          plannedDate: existing?.plannedDate ?? null,
        }),
      );
    },
    [access, mutate, selectedSubjectId, units],
  );

  const setUnitPlannedDate = useCallback(
    (unitId: string, plannedDate: string | null) => {
      const existing = units?.find((u) => u.id === unitId);
      if (existing === undefined) return;
      void mutate(() =>
        access.upsertUnit({
          id: unitId,
          subjectId: selectedSubjectId,
          name: existing.name,
          plannedDate,
        }),
      );
    },
    [access, mutate, selectedSubjectId, units],
  );

  const deleteUnit = useCallback(
    (unitId: string) => {
      void mutate(() => access.deleteUnit(unitId));
    },
    [access, mutate],
  );

  const addTopic = useCallback(
    (unitId: string, name: string) => {
      void mutate(() => access.upsertTopic({ unitId, name }));
    },
    [access, mutate],
  );

  const renameTopic = useCallback(
    (topicId: string, name: string) => {
      const unit = units?.find((u) => u.topics.some((t) => t.id === topicId));
      if (unit === undefined) return;
      const topic = unit.topics.find((t) => t.id === topicId);
      void mutate(() =>
        access.upsertTopic({
          id: topicId,
          unitId: unit.id,
          name,
          complete: topic?.complete ?? false,
        }),
      );
    },
    [access, mutate, units],
  );

  const deleteTopic = useCallback(
    (topicId: string) => {
      void mutate(() => access.deleteTopic(topicId));
    },
    [access, mutate],
  );

  const toggleTopic = useCallback(
    (topicId: string, complete: boolean) => {
      void mutate(() => access.setTopicComplete(topicId, complete));
    },
    [access, mutate],
  );

  const allTopics = useMemo(() => (units ? subjectTopics(units) : []), [units]);
  const subjectProgress = useMemo(() => progressPercent(allTopics), [allTopics]);
  const subjectPlanned = useMemo(
    () => (units ? subjectPlannedPercent(units, today) : 0),
    [units, today],
  );

  const completedTopicCount = allTopics.filter((t) => t.complete).length;
  const totalTopicCount = allTopics.length;
  const weekNumber = currentWeekNumber(today);
  const timeElapsedPercent = Math.min(100, Math.round((weekNumber / TOTAL_WEEKS) * 100));
  const status = scheduleStatus(subjectProgress, subjectPlanned);
  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);

  if (subjects.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-surface p-8 text-center">
        <h2 className="text-lg font-semibold text-text">Syllabus Tracker</h2>
        <p className="mt-2 text-sm text-muted">
          No subjects yet. Add a subject to start tracking syllabus progress.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header section */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-text">Syllabus Tracker</h2>
          <p className="mt-0.5 text-sm text-muted">
            {selectedSubject?.name ?? 'Select a subject'} · Week {weekNumber} of {TOTAL_WEEKS}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Subject selector dropdown */}
          <select
            aria-label="Subject"
            className={`${inputClass} text-sm`}
            value={selectedSubjectId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
          >
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error !== null && (
        <p role="alert" className="rounded-lg bg-status-red/10 px-4 py-2 text-sm font-medium text-status-red">
          {error}
        </p>
      )}

      {units === null ? (
        <FormSkeleton fields={4} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Topics list */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* Topics header with count */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold text-text">Topics</h3>
                <span className="text-sm text-muted">
                  {completedTopicCount} / {totalTopicCount} taught
                </span>
              </div>
            </div>

            {/* Add unit form */}
            <form className="flex gap-2" onSubmit={addUnit}>
              <input
                aria-label="New unit name"
                className={`${inputClass} min-w-0 flex-1`}
                placeholder="Add a unit…"
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
              />
              <button
                type="submit"
                className="btn-primary text-sm px-4 py-2"
                disabled={unitName.trim().length === 0}
              >
                + Add unit
              </button>
            </form>

            {/* Unit cards */}
            {units.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface p-8 text-center">
                <p className="text-sm text-muted">{messages.emptyState.noTopics}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {units.map((unit) => (
                  <UnitCard
                    key={unit.id}
                    unit={unit}
                    today={today}
                    onAddTopic={addTopic}
                    onRenameUnit={renameUnit}
                    onSetUnitPlannedDate={setUnitPlannedDate}
                    onDeleteUnit={deleteUnit}
                    onToggleTopic={toggleTopic}
                    onRenameTopic={renameTopic}
                    onDeleteTopic={deleteTopic}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right column: Progress section */}
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="text-base font-semibold text-text mb-5">Progress</h3>

              {/* Syllabus completed bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-text">Syllabus completed</span>
                  <span className="text-sm font-semibold text-accent">
                    {Math.round(subjectProgress)}%
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-border/40">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-300"
                    style={{ width: `${Math.round(subjectProgress)}%` }}
                  />
                </div>
              </div>

              {/* Time elapsed bar */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-text">Time elapsed</span>
                  <span className="text-sm font-semibold text-amber-600">
                    {timeElapsedPercent}%
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-border/40">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-[width] duration-300"
                    style={{ width: `${timeElapsedPercent}%` }}
                  />
                </div>
              </div>

              {/* Schedule status badge */}
              {allTopics.length > 0 && status === 'behind-schedule' && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <span className="text-amber-600">⚠</span>
                  <span className="text-sm font-medium text-amber-700">Behind schedule</span>
                </div>
              )}
              {allTopics.length > 0 && status === 'on-schedule' && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                  <span className="text-emerald-600">✓</span>
                  <span className="text-sm font-medium text-emerald-700">On schedule</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
