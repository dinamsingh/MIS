/**
 * Analytics domain service (`analyticsService`) — pure functions.
 *
 * Backs the Analytics_Module charts and the configurable Performance_Threshold.
 * This module holds the correctness-critical, testable math; chart rendering,
 * data fetching, and empty-state messaging are handled by the presentation and
 * data-access layers in later tasks.
 *
 * Covers:
 * - Requirement 12.1: the Performance_Threshold defaults to 60 percent.
 * - Requirement 12.2: class average chart (arithmetic mean of values).
 * - Requirement 12.3: unit-wise quiz score chart highlights the lowest-average unit.
 * - Requirement 12.4: grade distribution chart (partition scores into grade buckets).
 * - Requirement 12.5 / 4.5: at-risk classification respects the threshold.
 *
 * These functions hold no state and perform no I/O.
 */

/** The Performance_Threshold default, in percent (Requirement 12.1). */
export const DEFAULT_PERFORMANCE_THRESHOLD = 60;

/** A unit and its average score, used to find the lowest-scoring unit. */
export interface UnitAverage {
  readonly unitId: string;
  readonly average: number;
}

/**
 * The ordered grade buckets used by {@link gradeDistribution}. Each bucket is
 * defined by an inclusive lower bound on the score (percent). The buckets are
 * mutually exclusive and collectively exhaustive over all finite numbers, so
 * every score falls into exactly one bucket (Requirement 12.4, Property 16).
 */
export const GRADE_BUCKETS = [
  { grade: 'A', min: 90 },
  { grade: 'B', min: 80 },
  { grade: 'C', min: 70 },
  { grade: 'D', min: 60 },
  { grade: 'F', min: -Infinity },
] as const;

/** A grade label produced by {@link gradeDistribution}. */
export type Grade = (typeof GRADE_BUCKETS)[number]['grade'];

/**
 * Arithmetic mean of a list of values (Requirement 12.2).
 *
 * For a non-empty list the result equals the sum of the values divided by the
 * count, and therefore lies between the minimum and maximum input (Property 14).
 * An empty list yields 0 so the chart shows a defined zero rather than NaN; the
 * UI renders the empty-state message in that case (Requirement 12.6).
 */
export function classAverage(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

/**
 * Identify the unit with the lowest average score so the unit-wise chart can
 * highlight it (Requirement 12.3, Property 15).
 *
 * Returns the `unitId` whose `average` is the minimum among all supplied units.
 * On ties the first unit with the minimum average (in input order) is returned
 * for determinism. Returns `null` when the list is empty (nothing to highlight;
 * the UI shows the empty state).
 */
export function lowestScoringUnit(unitAverages: UnitAverage[]): string | null {
  if (unitAverages.length === 0) {
    return null;
  }

  let lowest = unitAverages[0];
  for (let i = 1; i < unitAverages.length; i += 1) {
    if (unitAverages[i].average < lowest.average) {
      lowest = unitAverages[i];
    }
  }
  return lowest.unitId;
}

/**
 * Partition a list of scores into grade buckets for the grade distribution
 * chart (Requirement 12.4).
 *
 * Every grade label in {@link GRADE_BUCKETS} is present in the result (with a
 * count of zero when no score falls in it), and each score is counted in
 * exactly the one bucket whose inclusive lower bound it meets. Consequently the
 * sum of all bucket counts equals the number of scores (Property 16).
 * Non-finite scores (NaN/Infinity) are not counted, since they do not
 * correspond to a real grade.
 */
export function gradeDistribution(scores: number[]): Record<string, number> {
  const distribution: Record<string, number> = {};
  for (const { grade } of GRADE_BUCKETS) {
    distribution[grade] = 0;
  }

  for (const score of scores) {
    if (!Number.isFinite(score)) {
      continue;
    }
    const bucket = GRADE_BUCKETS.find((b) => score >= b.min);
    if (bucket) {
      distribution[bucket.grade] += 1;
    }
  }

  return distribution;
}

/**
 * Classify a performance percentage as at-risk relative to the threshold
 * (Requirements 12.5, 4.5, Property 17).
 *
 * Returns `true` if and only if the performance percentage is strictly below
 * the threshold; meeting or exceeding the threshold is not at-risk. The
 * threshold defaults to {@link DEFAULT_PERFORMANCE_THRESHOLD} (60 percent,
 * Requirement 12.1) when not supplied.
 */
export function isAtRisk(
  performancePercent: number,
  threshold: number = DEFAULT_PERFORMANCE_THRESHOLD,
): boolean {
  return performancePercent < threshold;
}
