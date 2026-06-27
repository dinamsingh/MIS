/**
 * Leaderboard domain service (`leaderboardService`).
 *
 * Pure functions backing the optional Leaderboard_Module: computing a combined
 * performance score per student from the teacher-defined weightages, and
 * ranking students by that score in descending order with a deterministic
 * tie-break on student name in ascending order.
 *
 * These functions hold no state and perform no I/O; enabling/disabling the
 * leaderboard, persisting weightages, and reloading underlying data are handled
 * by the data-access and UI layers.
 *
 * _Requirements: 11.3, 11.4, 11.6_
 */

/**
 * The teacher-controlled weightages for the contributing factors
 * (Requirement 11.3): internal marks, quiz scores, and attendance percentage.
 * Each weight scales the corresponding student metric in the combined score.
 */
export interface LeaderboardWeights {
  readonly internalMarks: number;
  readonly quizScores: number;
  readonly attendance: number;
}

/**
 * The per-student inputs to the leaderboard computation. `name` is used for the
 * deterministic tie-break; the three numeric metrics are weighted to form the
 * combined performance score.
 */
export interface StudentMetrics {
  readonly studentId: string;
  readonly name: string;
  readonly internalMarks: number;
  readonly quizScore: number;
  readonly attendancePercent: number;
}

/**
 * Compute a student's combined performance score (Requirement 11.4) as the
 * deterministic weighted sum of the contributing factors using the
 * teacher-defined weightages (Requirement 11.3):
 *
 *   internalMarks * w.internalMarks
 *   + quizScore * w.quizScores
 *   + attendancePercent * w.attendance
 *
 * Non-finite metric or weight inputs contribute zero so the score is always a
 * finite number; the computation is order-independent and deterministic.
 */
export function combinedScore(m: StudentMetrics, w: LeaderboardWeights): number {
  const term = (metric: number, weight: number): number => {
    if (!Number.isFinite(metric) || !Number.isFinite(weight)) {
      return 0;
    }
    return metric * weight;
  };

  return (
    term(m.internalMarks, w.internalMarks) +
    term(m.quizScore, w.quizScores) +
    term(m.attendancePercent, w.attendance)
  );
}

/**
 * Rank students by combined performance score in descending order
 * (Requirement 11.4). When two students have an equal combined score, the tie
 * is broken deterministically by student name in ascending order
 * (Requirement 11.6).
 *
 * The returned array is a permutation of the input (no students added or
 * dropped); the input array is not mutated. The name tie-break uses a stable
 * locale-independent comparison so the ordering is reproducible across runs.
 */
export function rankStudents(
  metrics: StudentMetrics[],
  w: LeaderboardWeights,
): StudentMetrics[] {
  const scored = metrics.map((m) => ({ metrics: m, score: combinedScore(m, w) }));

  scored.sort((a, b) => {
    if (a.score !== b.score) {
      // Descending by combined score.
      return b.score - a.score;
    }
    // Deterministic tie-break: student name ascending.
    if (a.metrics.name < b.metrics.name) return -1;
    if (a.metrics.name > b.metrics.name) return 1;
    return 0;
  });

  return scored.map((entry) => entry.metrics);
}
