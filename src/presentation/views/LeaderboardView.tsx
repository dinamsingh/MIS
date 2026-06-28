/**
 * Leaderboard module UI (task 23.1).
 *
 * The teacher-facing surface for the optional Leaderboard_Module. It composes
 * three concerns:
 *
 *  1. **Enable/disable toggle** — the teacher can enable or disable the
 *     leaderboard (Req 11.1). While disabled, the module renders nothing beyond
 *     the enable control (Req 11.2).
 *
 *  2. **Weightage configuration** — the teacher sets the contributing-factor
 *     weightages for internal marks, quiz scores, and attendance percentage
 *     (Req 11.3). Updated weightages are persisted on save.
 *
 *  3. **Ranked display** — when enabled, students are displayed ranked by their
 *     combined performance score in descending order (Req 11.4). The ranking
 *     reflects updated data on next load (Req 11.5): all data is freshly
 *     fetched each time the view mounts or the teacher re-enables the module.
 *
 * All persistence is delegated to the injected {@link LeaderboardPersistence}
 * port so the view stays testable with in-memory fakes. Domain logic
 * (`combinedScore`, `rankStudents`) is sourced from the pure
 * `leaderboardService` module.
 *
 * _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
 */

import { useCallback, useEffect, useState } from 'react';
import {
  combinedScore,
  rankStudents,
  type LeaderboardWeights,
  type StudentMetrics,
} from '@domain/services/leaderboardService';
import { messages } from '@domain/shared/messages';
import { TableSkeleton } from '@presentation/components/skeletons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The persisted leaderboard configuration. */
export interface LeaderboardConfig {
  readonly enabled: boolean;
  readonly weights: LeaderboardWeights;
}

/**
 * Persistence port: the contract the view depends on. Structurally compatible
 * with `LeaderboardAccess` from the data layer so production wires the
 * Supabase-backed implementation while tests supply an in-memory fake.
 */
export interface LeaderboardPersistence {
  /** Load the enable flag and weightages (Req 11.1, 11.3). */
  loadConfig(): Promise<LeaderboardConfig>;
  /** Persist the enable flag and weightages (Req 11.1, 11.3). */
  saveConfig(config: LeaderboardConfig): Promise<void>;
  /** Load all student metrics for computing the leaderboard (Req 11.5). */
  loadStudentMetrics(): Promise<StudentMetrics[]>;
}

export interface LeaderboardViewProps {
  /** The leaderboard persistence port. */
  persistence: LeaderboardPersistence;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive a badge label based on rank position and score thresholds. */
function getBadge(
  rank: number,
  student: StudentMetrics,
  total: number,
): { label: string; color: string } | null {
  if (rank === 1) {
    return { label: 'Top Performer', color: 'bg-yellow-100 text-yellow-800' };
  }
  if (rank === 2) {
    return { label: 'Top Performer', color: 'bg-yellow-50 text-yellow-700' };
  }
  if (rank === 3) {
    return { label: 'Top Performer', color: 'bg-orange-50 text-orange-700' };
  }
  // "Most Active" badge for high attendance
  if (student.attendancePercent >= 90 && total > 3) {
    return { label: 'Most Active', color: 'bg-green-50 text-green-700' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LeaderboardView({ persistence }: LeaderboardViewProps) {
  // Configuration state
  const [enabled, setEnabled] = useState(false);
  const [weights, setWeights] = useState<LeaderboardWeights>({
    internalMarks: 0,
    quizScores: 0,
    attendance: 0,
  });

  // Ranked students
  const [rankedStudents, setRankedStudents] = useState<StudentMetrics[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // Load config and (if enabled) student metrics on mount (Req 11.5)
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    persistence
      .loadConfig()
      .then(async (config) => {
        if (!active) return;
        setEnabled(config.enabled);
        setWeights(config.weights);

        if (config.enabled) {
          const metrics = await persistence.loadStudentMetrics();
          if (!active) return;
          setRankedStudents(rankStudents(metrics, config.weights));
        } else {
          setRankedStudents([]);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
        setError(true);
      });

    return () => {
      active = false;
    };
  }, [persistence]);

  // Toggle enable/disable (Req 11.1)
  const handleToggle = useCallback(async () => {
    const newEnabled = !enabled;
    setEnabled(newEnabled);
    setSaving(true);
    setError(false);

    try {
      const newConfig: LeaderboardConfig = { enabled: newEnabled, weights };
      await persistence.saveConfig(newConfig);

      if (newEnabled) {
        // Reload metrics to reflect current data (Req 11.5)
        const metrics = await persistence.loadStudentMetrics();
        setRankedStudents(rankStudents(metrics, weights));
      } else {
        setRankedStudents([]);
      }
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }, [enabled, weights, persistence]);

  // Save weightages (Req 11.3)
  const handleSaveWeights = useCallback(async () => {
    setSaving(true);
    setError(false);

    try {
      const newConfig: LeaderboardConfig = { enabled, weights };
      await persistence.saveConfig(newConfig);

      // Recompute rankings with new weights (Req 11.5)
      if (enabled) {
        const metrics = await persistence.loadStudentMetrics();
        setRankedStudents(rankStudents(metrics, weights));
      }
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }, [enabled, weights, persistence]);

  // Weight field change handler
  const handleWeightChange = useCallback(
    (field: keyof LeaderboardWeights, value: string) => {
      const parsed = parseFloat(value);
      if (Number.isNaN(parsed) || parsed < 0) return;
      setWeights((prev) => ({ ...prev, [field]: parsed }));
    },
    [],
  );

  const FIELD_CLASS =
    'w-full rounded-button border border-border bg-surface px-3 py-2 text-sm text-text ' +
    'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

  if (loading) {
    return (
      <section className="flex flex-col gap-6">
        <header>
          <h2 className="text-2xl font-bold text-text">Leaderboard 🏆</h2>
          <p className="mt-1 text-sm text-soft">
            Quiz performance + timeliness
          </p>
        </header>
        <div className="card p-6">
          <TableSkeleton rows={6} columns={6} />
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      {/* Header */}
      <header>
        <h2 className="text-2xl font-bold text-text">Leaderboard 🏆</h2>
        <p className="mt-1 text-sm text-soft">
          Quiz performance + timeliness
        </p>
      </header>

      {/* Enable/Disable toggle (Req 11.1) */}
      <div className="card p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text">Enable Leaderboard</p>
            <p className="text-xs text-soft mt-0.5">
              {enabled
                ? 'The leaderboard is visible and ranking students.'
                : 'The leaderboard is currently disabled and hidden.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Toggle leaderboard"
            disabled={saving}
            onClick={handleToggle}
            className={
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ' +
              (enabled ? 'bg-accent' : 'bg-muted/40') +
              (saving ? ' opacity-50 cursor-not-allowed' : '')
            }
          >
            <span
              className={
                'pointer-events-none inline-block h-5 w-5 rounded-full bg-surface shadow-sm transition-transform ' +
                (enabled ? 'translate-x-5' : 'translate-x-0')
              }
            />
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="card p-4 sm:p-6">
          <p role="alert" className="text-sm font-medium text-status-red">
            {messages.error.generic}
          </p>
        </div>
      )}

      {/* When disabled, hide the leaderboard content (Req 11.2) */}
      {!enabled ? null : (
        <>
          {/* Weightage configuration (Req 11.3) */}
          <div className="card p-4 sm:p-6">
            <h3 className="text-sm font-semibold text-text mb-4">
              Weightage Configuration
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="weight-internal-marks"
                  className="text-xs font-medium text-soft"
                >
                  Internal Marks
                </label>
                <input
                  id="weight-internal-marks"
                  type="number"
                  min="0"
                  step="0.1"
                  className={FIELD_CLASS}
                  value={weights.internalMarks}
                  onChange={(e) =>
                    handleWeightChange('internalMarks', e.target.value)
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="weight-quiz-scores"
                  className="text-xs font-medium text-soft"
                >
                  Quiz Scores
                </label>
                <input
                  id="weight-quiz-scores"
                  type="number"
                  min="0"
                  step="0.1"
                  className={FIELD_CLASS}
                  value={weights.quizScores}
                  onChange={(e) =>
                    handleWeightChange('quizScores', e.target.value)
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="weight-attendance"
                  className="text-xs font-medium text-soft"
                >
                  Attendance
                </label>
                <input
                  id="weight-attendance"
                  type="number"
                  min="0"
                  step="0.1"
                  className={FIELD_CLASS}
                  value={weights.attendance}
                  onChange={(e) =>
                    handleWeightChange('attendance', e.target.value)
                  }
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="btn-primary"
                disabled={saving}
                onClick={handleSaveWeights}
              >
                {saving ? 'Saving…' : 'Save Weights'}
              </button>
            </div>
          </div>

          {/* Ranked student table (Req 11.4) */}
          <div className="card p-4 sm:p-6">
            <h3 className="text-sm font-semibold text-text mb-4">
              Student Rankings
            </h3>

            {rankedStudents.length === 0 ? (
              <p className="text-sm text-soft">
                {messages.emptyState.noStudents}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/20">
                      <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                        Rank
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                        Student
                      </th>
                      <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wider text-muted">
                        Quiz avg
                      </th>
                      <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wider text-muted">
                        On-time
                      </th>
                      <th className="py-3 px-4 text-center text-xs font-semibold uppercase tracking-wider text-muted">
                        Badge
                      </th>
                      <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wider text-muted">
                        Pts
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rankedStudents.map((student, idx) => {
                      const rank = idx + 1;
                      const badge = getBadge(rank, student, rankedStudents.length);
                      const isTopThree = rank <= 3;

                      return (
                        <tr
                          key={student.studentId}
                          className={
                            (isTopThree
                              ? 'bg-accent/5 '
                              : idx % 2 === 0
                                ? 'bg-surface '
                                : 'bg-muted/10 ') +
                            'hover:bg-accent/10 transition-colors'
                          }
                        >
                          {/* Rank */}
                          <td className="py-3 px-4">
                            <span
                              className={
                                'inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ' +
                                (rank === 1
                                  ? 'bg-yellow-200 text-yellow-900'
                                  : rank === 2
                                    ? 'bg-gray-200 text-gray-800'
                                    : rank === 3
                                      ? 'bg-orange-200 text-orange-900'
                                      : 'bg-muted/20 text-muted')
                              }
                            >
                              #{rank}
                            </span>
                          </td>

                          {/* Student name */}
                          <td className="py-3 px-4 font-medium text-text">
                            {student.name}
                          </td>

                          {/* Quiz avg */}
                          <td className="py-3 px-4 text-right text-soft">
                            {student.quizScore.toFixed(1)}%
                          </td>

                          {/* On-time (attendance) */}
                          <td className="py-3 px-4 text-right text-soft">
                            {student.attendancePercent.toFixed(1)}%
                          </td>

                          {/* Badge */}
                          <td className="py-3 px-4 text-center">
                            {badge ? (
                              <span
                                className={
                                  'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ' +
                                  badge.color
                                }
                              >
                                {badge.label}
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>

                          {/* Points */}
                          <td className="py-3 px-4 text-right font-semibold text-accent">
                            {combinedScore(student, weights).toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
