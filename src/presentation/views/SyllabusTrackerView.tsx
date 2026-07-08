/**
 * Syllabus Tracker view — tracking-only.
 *
 * Shows the SHARED master syllabus (units + topics) for the globally-selected
 * subject and lets the teacher tick off the topics they have taught. Completion
 * is per-teacher (see teacher_topic_progress). There is no unit/topic authoring
 * here — the curriculum is fixed master content; the teacher only tracks it.
 *
 * Design: matches the app's shared UI kit (Card/SectionHeader/Badge/ProgressBar,
 * design tokens) instead of ad-hoc markup, so it looks consistent with the rest
 * of the app (Roster, Reports, Quizzes).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { progressPercent, type Topic, type Unit } from '@domain/services/syllabusService';
import type { SyllabusTrackerAccess } from '@data/access/syllabusTrackerAccess';
import { messages } from '@domain/shared/messages';
import { FormSkeleton } from '@presentation/components/skeletons';
import { Card, SectionHeader, Badge, Button, SearchInput, ProgressBar } from '@presentation/components/ui';
import type { ComponentTone } from '@presentation/components/ui/utils';

/** A subject the teacher can track syllabus progress for. */
export interface SyllabusSubject {
  readonly id: string;
  readonly name: string;
}

export interface SyllabusTrackerViewProps {
  /** The globally-selected subject(s). The first one is tracked. */
  subjects: SyllabusSubject[];
  /**
   * The globally-selected section's id. Progress is tracked per
   * (teacher, section, topic) — see migration 0026 — so marking a topic taught
   * in one section never shows as taught in another.
   */
  sectionId: string | null;
  /** Master + per-teacher, per-section progress access. */
  access: SyllabusTrackerAccess;
}

function allTopicsOf(units: Unit[]): Topic[] {
  return units.flatMap((u) => u.topics);
}

/** Progress tone: red when badly behind, amber when partial, green when done. */
function progressTone(percent: number): ComponentTone {
  if (percent >= 100) return 'success';
  if (percent >= 40) return 'warning';
  if (percent > 0) return 'danger';
  return 'neutral';
}

/** True if a topic's name matches the (already-lowercased) search query. */
function matchesQuery(topic: Topic, query: string): boolean {
  return query === '' || topic.name.toLowerCase().includes(query);
}

/** One topic row with a completion checkbox; completed rows get a check icon too
 * (not just strikethrough) so status reads clearly for colorblind users. */
function TopicRow({
  topic,
  onToggle,
}: {
  topic: Topic;
  onToggle: (topicId: string, complete: boolean) => void;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0 hover:bg-surface-muted/60 transition-colors">
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 rounded border-border text-accent focus:ring-2 focus:ring-accent/30"
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
      {topic.complete && (
        <svg className="h-4 w-4 shrink-0 text-status-green" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M16.704 5.29a1 1 0 010 1.415l-7.09 7.09a1 1 0 01-1.415 0L4.296 9.89a1 1 0 111.415-1.415l3.09 3.09 6.383-6.382a1 1 0 011.415 0z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </li>
  );
}

/** A collapsible unit card: header (name + progress) + its topics. */
function UnitCard({
  unit,
  expanded,
  onToggleExpanded,
  onToggleTopic,
  onMarkAll,
  searchQuery,
}: {
  unit: Unit;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleTopic: (topicId: string, complete: boolean) => void;
  onMarkAll: (unitId: string, complete: boolean) => void;
  searchQuery: string;
}) {
  const percent = progressPercent(unit.topics);
  const completedCount = unit.topics.filter((t) => t.complete).length;
  const totalCount = unit.topics.length;
  const allDone = totalCount > 0 && completedCount === totalCount;
  const visibleTopics = unit.topics.filter((t) => matchesQuery(t, searchQuery));
  const bodyId = `unit-panel-${unit.id}`;

  return (
    <Card padded={false} className="overflow-hidden">
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-surface-muted/50"
      >
        <svg
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.17 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>

        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{unit.name}</span>

        <Badge tone={progressTone(percent)} size="sm">
          {completedCount}/{totalCount} taught
        </Badge>

        <span className="hidden w-28 shrink-0 sm:block">
          <ProgressBar value={percent} tone={progressTone(percent)} />
        </span>
      </button>

      {expanded && (
        <div id={bodyId} className="border-t border-border">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-surface-muted/30 px-5 py-2">
            <span className="text-xs text-muted">{Math.round(percent)}% complete</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onMarkAll(unit.id, !allDone)}
              disabled={totalCount === 0}
            >
              {allDone ? 'Mark all not taught' : 'Mark all taught'}
            </Button>
          </div>

          {unit.topics.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">{messages.emptyState.noTopics}</p>
          ) : visibleTopics.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No topics match your search in this unit.</p>
          ) : (
            <ul className="flex flex-col">
              {visibleTopics.map((topic) => (
                <TopicRow key={topic.id} topic={topic} onToggle={onToggleTopic} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

/** Teacher-facing syllabus tracker for the globally-selected subject + section. */
export default function SyllabusTrackerView({ subjects, sectionId, access }: SyllabusTrackerViewProps) {
  const subject = subjects[0] ?? null;
  const subjectId = subject?.id ?? '';
  const effectiveSectionId = sectionId ?? '';

  const [units, setUnits] = useState<Unit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedUnitIds, setExpandedUnitIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkBusyUnitId, setBulkBusyUnitId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (subjectId === '' || effectiveSectionId === '') {
      setUnits([]);
      return;
    }
    try {
      const loaded = await access.listUnits(subjectId, effectiveSectionId);
      setUnits(loaded);
      setError(null);
      // Auto-expand the first not-fully-taught unit so the teacher lands
      // exactly where they need to keep going, instead of a wall of open cards.
      const firstIncomplete = loaded.find((u) => progressPercent(u.topics) < 100);
      setExpandedUnitIds(new Set(firstIncomplete ? [firstIncomplete.id] : loaded[0] ? [loaded[0].id] : []));
    } catch {
      setUnits([]);
      setError(messages.error.generic);
    }
  }, [access, subjectId, effectiveSectionId]);

  useEffect(() => {
    setUnits(null);
    setSearchQuery('');
    void reload();
  }, [reload]);

  // Searching a topic auto-expands every unit containing a match, so results
  // are visible without manual clicking.
  useEffect(() => {
    if (searchQuery.trim() === '' || !units) return;
    const query = searchQuery.trim().toLowerCase();
    const matchingUnitIds = units
      .filter((u) => u.topics.some((t) => matchesQuery(t, query)))
      .map((u) => u.id);
    if (matchingUnitIds.length > 0) {
      setExpandedUnitIds((prev) => new Set([...prev, ...matchingUnitIds]));
    }
  }, [searchQuery, units]);

  const toggleTopic = useCallback(
    (topicId: string, complete: boolean) => {
      if (effectiveSectionId === '') return;
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
          await access.setTopicComplete(topicId, effectiveSectionId, complete);
        } catch {
          setError(messages.error.saveFailed);
          void reload();
        }
      })();
    },
    [access, effectiveSectionId, reload],
  );

  const toggleUnitExpanded = useCallback((unitId: string) => {
    setExpandedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  }, []);

  const markAllInUnit = useCallback(
    (unitId: string, complete: boolean) => {
      if (effectiveSectionId === '') return;
      const unit = units?.find((u) => u.id === unitId);
      if (!unit) return;
      const targets = unit.topics.filter((t) => t.complete !== complete);
      if (targets.length === 0) return;

      // Optimistic update across the whole unit.
      setUnits((prev) =>
        prev
          ? prev.map((u) =>
              u.id === unitId ? { ...u, topics: u.topics.map((t) => ({ ...t, complete })) } : u,
            )
          : prev,
      );
      setBulkBusyUnitId(unitId);
      void (async () => {
        try {
          await Promise.all(
            targets.map((t) => access.setTopicComplete(t.id, effectiveSectionId, complete)),
          );
        } catch {
          setError(messages.error.saveFailed);
          void reload();
        } finally {
          setBulkBusyUnitId(null);
        }
      })();
    },
    [access, effectiveSectionId, reload, units],
  );

  const topics = useMemo(() => (units ? allTopicsOf(units) : []), [units]);
  const subjectProgress = useMemo(() => progressPercent(topics), [topics]);
  const completedCount = topics.filter((t) => t.complete).length;
  const totalCount = topics.length;

  const nextIncomplete = useMemo(() => {
    if (!units) return [];
    const result: Array<{ unitName: string; topic: Topic }> = [];
    for (const unit of units) {
      for (const topic of unit.topics) {
        if (!topic.complete) {
          result.push({ unitName: unit.name, topic });
          if (result.length >= 5) return result;
        }
      }
    }
    return result;
  }, [units]);

  if (subjects.length === 0 || effectiveSectionId === '') {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-lg font-semibold text-text">Syllabus Tracker</h2>
        <p className="mt-2 text-sm text-muted">
          Select a section and a subject from the top bar to track its syllabus.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        eyebrow="Academics"
        title="Syllabus Tracker"
        description={
          subject
            ? `${subject.name} · progress tracked separately for each section.`
            : 'Select a subject'
        }
        actions={
          units && units.length > 0 ? (
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topics…"
              className="w-full sm:w-64"
              aria-label="Search topics"
            />
          ) : undefined
        }
      />

      {error !== null && (
        <p role="alert" className="rounded-control bg-status-red/10 px-4 py-2 text-sm font-medium text-status-red">
          {error}
        </p>
      )}

      {units === null ? (
        <FormSkeleton fields={4} />
      ) : units.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-text">No syllabus loaded for this subject yet.</p>
          <p className="mt-1 text-xs text-muted">
            The department curriculum for this subject hasn't been added yet — contact your admin to seed it.
          </p>
        </Card>
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
                <div key={unit.id} className="relative">
                  <UnitCard
                    unit={unit}
                    expanded={expandedUnitIds.has(unit.id)}
                    onToggleExpanded={() => toggleUnitExpanded(unit.id)}
                    onToggleTopic={toggleTopic}
                    onMarkAll={markAllInUnit}
                    searchQuery={searchQuery.trim().toLowerCase()}
                  />
                  {bulkBusyUnitId === unit.id && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-card bg-surface/60">
                      <span className="text-xs font-medium text-muted">Saving…</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right: overall progress + per-unit breakdown + what's next */}
          <div className="flex flex-col gap-4">
            <Card>
              <h3 className="mb-4 text-base font-semibold text-text">Progress</h3>
              <ProgressBar value={subjectProgress} tone={progressTone(subjectProgress)} label="Syllabus completed" />
              <p className="mt-3 text-xs text-muted">
                {completedCount} of {totalCount} topics marked as taught across {units.length} units.
              </p>
            </Card>

            <Card>
              <h3 className="mb-3 text-sm font-semibold text-text">Per-unit breakdown</h3>
              <ul className="flex flex-col gap-3">
                {units.map((unit) => {
                  const p = progressPercent(unit.topics);
                  return (
                    <li key={unit.id}>
                      <ProgressBar value={p} tone={progressTone(p)} label={unit.name} />
                    </li>
                  );
                })}
              </ul>
            </Card>

            {nextIncomplete.length > 0 && (
              <Card>
                <h3 className="mb-3 text-sm font-semibold text-text">Up next</h3>
                <ul className="flex flex-col gap-2">
                  {nextIncomplete.map(({ unitName, topic }) => (
                    <li key={topic.id} className="text-xs leading-5">
                      <span className="block truncate font-medium text-text">{topic.name}</span>
                      <span className="text-muted">{unitName}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
