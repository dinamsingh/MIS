import { describe, expect, it } from 'vitest';
import {
  classAverage,
  lowestScoringUnit,
  gradeDistribution,
  isAtRisk,
  DEFAULT_PERFORMANCE_THRESHOLD,
  type UnitAverage,
} from './analyticsService';

describe('classAverage', () => {
  it('returns 0 for an empty list', () => {
    expect(classAverage([])).toBe(0);
  });

  it('returns the value itself for a single element', () => {
    expect(classAverage([42])).toBe(42);
  });

  it('computes the arithmetic mean', () => {
    expect(classAverage([10, 20, 30])).toBe(20);
    expect(classAverage([0, 100])).toBe(50);
  });

  it('lies between the minimum and maximum inputs', () => {
    const values = [55, 90, 12, 73];
    const avg = classAverage(values);
    expect(avg).toBeGreaterThanOrEqual(Math.min(...values));
    expect(avg).toBeLessThanOrEqual(Math.max(...values));
  });
});

describe('lowestScoringUnit', () => {
  it('returns null for an empty list', () => {
    expect(lowestScoringUnit([])).toBeNull();
  });

  it('returns the unit with the minimum average', () => {
    const units: UnitAverage[] = [
      { unitId: 'u1', average: 80 },
      { unitId: 'u2', average: 45 },
      { unitId: 'u3', average: 67 },
    ];
    expect(lowestScoringUnit(units)).toBe('u2');
  });

  it('returns the single unit when only one is present', () => {
    expect(lowestScoringUnit([{ unitId: 'only', average: 99 }])).toBe('only');
  });

  it('returns the first unit on a tie for the minimum', () => {
    const units: UnitAverage[] = [
      { unitId: 'a', average: 50 },
      { unitId: 'b', average: 50 },
    ];
    expect(lowestScoringUnit(units)).toBe('a');
  });
});

describe('gradeDistribution', () => {
  it('includes every grade bucket even when empty', () => {
    const dist = gradeDistribution([]);
    expect(dist).toEqual({ A: 0, B: 0, C: 0, D: 0, F: 0 });
  });

  it('places scores into the correct buckets by their value', () => {
    const dist = gradeDistribution([95, 85, 75, 65, 55]);
    expect(dist).toEqual({ A: 1, B: 1, C: 1, D: 1, F: 1 });
  });

  it('uses inclusive lower bounds at bucket boundaries', () => {
    const dist = gradeDistribution([90, 80, 70, 60, 59.99, 0]);
    expect(dist).toEqual({ A: 1, B: 1, C: 1, D: 1, F: 2 });
  });

  it('counts equal scores into the same bucket', () => {
    const dist = gradeDistribution([95, 92, 91]);
    expect(dist.A).toBe(3);
  });

  it('sum of bucket counts equals the number of finite scores', () => {
    const scores = [12, 45, 67, 88, 100, 30, 59];
    const dist = gradeDistribution(scores);
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    expect(total).toBe(scores.length);
  });

  it('ignores non-finite scores', () => {
    const dist = gradeDistribution([NaN, Infinity, -Infinity, 95]);
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    expect(total).toBe(1);
    expect(dist.A).toBe(1);
  });
});

describe('isAtRisk', () => {
  it('defaults the threshold to 60 percent', () => {
    expect(DEFAULT_PERFORMANCE_THRESHOLD).toBe(60);
    expect(isAtRisk(59)).toBe(true);
    expect(isAtRisk(60)).toBe(false);
    expect(isAtRisk(61)).toBe(false);
  });

  it('classifies at-risk only when strictly below the threshold', () => {
    expect(isAtRisk(74, 75)).toBe(true);
    expect(isAtRisk(75, 75)).toBe(false);
    expect(isAtRisk(76, 75)).toBe(false);
  });

  it('treats the threshold boundary as not at-risk', () => {
    expect(isAtRisk(50, 50)).toBe(false);
  });
});
