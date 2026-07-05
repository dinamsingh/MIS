/**
 * Syllabus Tracker view — tracking-only.
 *
 * Shows the SHARED master syllabus (units + topics) for the globally-selected
 * subject and lets the teacher tick off the topics they have taught. Completion
 * is per-teacher (see teacher_topic_progress). There is no unit/topic authoring
 * here — the curriculum is fixed master content; the teacher only tracks it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { progressPercent, type Topic, type Unit } from '@domain/services/syllabusService';
import type { SyllabusTrackerAccess } from '@data/access/syllabusTrackerAccess';
import { messages } from '@domain/shared/messages';
import { FormSkeleton } from '@presentation/components/skeletons';

/** A subject the teacher can track syllabus progress for. */
export interface SyllabusSubject {
  readonly id: string;
  readonly name: string;
}

export interface SyllabusTrackerViewProps {
  /** The globally-selected subject(s). The first one is tracked. */
  subjects: SyllabusSubject[];
  /** Master + per-teacher progress access. */
  access: SyllabusTrackerAccess;
}

function allTopicsOf(units: Unit[]): Topic[] {
  return units.flatMap((u) => u.topics);
}

/** One topic row with a completion checkbox. */
function TopicRow({
  topic,
  onToggle,
}: {
  topic: Topic;
  onToggle: (topicId: string, complete: boolean) => void;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-border/50 px-4 py-2.5 last:border-b-0 hover:bg-surface/60 transition-colors">
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 rounded border-border text-accent focus:ring-accent/30"
        checked={topic.complete}
        aria-label={`Mark ${topic.name} taught`}
        onChange={(e) => onToggle(topic.id, e.target.checked)}
      />
      <span
        className={[
          'min-w-0 flex-1 text-sm',
          topic.complete ? 'text-muted line-through' : 'text-text',
        ].join(' ')}
      >
        {topic.name}
      </span>
    </li>
  );
}

/** A unit card: its topics as checkboxes + a small progress bar. */
function UnitCard({
  unit,
  onToggleTopic,
}: {
  unit: Unit;
  onToggleTopic: (topicId: string, complete: boolean) => void;
}) {
  const actual = progressPercent(unit.topics);
  const completedCount = unit.topics.filter((t) => t.complete).length;

  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
        <h3 className="truncate text-sm font-semibold text-text">{unit.name}</h3>
        <span className="shrink-0 text-xs text-muted">
          {completedCount} / {unit.topics.length} taught
        </span>
      </div>

      <div className="flex items-center gap-3 border-b border-border/30 px-5 py-2.5">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-border/40">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${Math.round(actual)}%` }}
          />
        </div>
        <span className="w-10 text-right text-xs font-medium text-muted">{Math.round(actual)}%</span>
      </div>

      {unit.topics.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">{messages.emptyState.noTopics}</p>
      ) : (
        <ul className="flex flex-col">
          {unit.topics.map((topic) => (
            <TopicRow key={topic.id} topic={topic} onToggle={onToggleTopic} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Teacher-facing syllabus tracker for the globally-selected subject. */
export default function SyllabusTrackerView({ subjects, access }: SyllabusTrackerViewProps) {
  const subject = subjects[0] ?? null;
  const subjectId = subject?.id ?? '';

  const [units, setUnits] = useState<Unit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (subjectId === '') {
      setUnits([]);
      return;
    }
    try {
      setUnits(await access.listUnits(subjectId));
      setError(null);
    } catch {
      setUnits([]);
      setError(messages.error.generic);
    }
  }, [access, subjectId]);

  useEffect(() => {
    setUnits(null);
    void reload();
  }, [reload]);

  const toggleTopic = useCallback(
    (topicId: string, complete: boolean) => {
      // Optimistic update so the checkbox feels instant.
      setUnits((prev) =>
        prev
          ? prev.map((u) => ({
              ...u,
              topics: u.topics.map((t) => (t.id === topicId ? { ...t, complete } : t)),
            }))
          : prev,
      );
      void (async () => {
        try {
          await access.setTopicComplete(topicId, complete);
        } catch {
          setError(messages.error.saveFailed);
          void reload();
        }
      })();
    },
    [access, reload],
  );

  const topics = useMemo(() => (units ? allTopicsOf(units) : []), [units]);
  const subjectProgress = useMemo(() => progressPercent(topics), [topics]);
  const completedCount = topics.filter((t) => t.complete).length;
  const totalCount = topics.length;

  if (subjects.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-surface p-8 text-center">
        <h2 className="text-lg font-semibold text-text">Syllabus Tracker</h2>
        <p className="mt-2 text-sm text-muted">
          Select a subject from the top bar to track its syllabus.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-text">Syllabus Tracker</h2>
          <p className="mt-0.5 text-sm text-muted">{subject?.name ?? 'Select a subject'}</p>
        </div>
      </div>

      {error !== null && (
        <p role="alert" className="rounded-lg bg-status-red/10 px-4 py-2 text-sm font-medium text-status-red">
          {error}
        </p>
      )}

      {units === null ? (
        <FormSkeleton fields={4} />
      ) : units.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">
            No syllabus loaded for this subject yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: units + topics */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold text-text">Topics</h3>
              <span className="text-sm text-muted">{completedCount} / {totalCount} taught</span>
            </div>
            <div className="flex flex-col gap-4">
              {units.map((unit) => (
                <UnitCard key={unit.id} unit={unit} onToggleTopic={toggleTopic} />
              ))}
            </div>
          </div>

          {/* Right: overall progress */}
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="mb-5 text-base font-semibold text-text">Progress</h3>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-text">Syllabus completed</span>
                <span className="text-sm font-semibold text-accent">{Math.round(subjectProgress)}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-border/40">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300"
                  style={{ width: `${Math.round(subjectProgress)}%` }}
                />
              </div>
              <p className="mt-4 text-xs text-muted">
                {completedCount} of {totalCount} topics marked as taught.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
