import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  combinedScore,
  rankStudents,
  type LeaderboardWeights,
  type StudentMetrics,
} from './leaderboardService';

const weights = (over: Partial<LeaderboardWeights> = {}): LeaderboardWeights => ({
  internalMarks: 1,
  quizScores: 1,
  attendance: 1,
  ...over,
});

const metrics = (over: Partial<StudentMetrics> = {}): StudentMetrics => ({
  studentId: 's1',
  name: 'Student',
  internalMarks: 0,
  quizScore: 0,
  attendancePercent: 0,
  ...over,
});

describe('combinedScore', () => {
  it('computes the weighted sum of the three factors', () => {
    const score = combinedScore(
      metrics({ internalMarks: 80, quizScore: 90, attendancePercent: 100 }),
      weights({ internalMarks: 0.5, quizScores: 0.3, attendance: 0.2 }),
    );
    // 80*0.5 + 90*0.3 + 100*0.2 = 40 + 27 + 20
    expect(score).toBeCloseTo(87, 10);
  });

  it('returns 0 when all weights are 0', () => {
    const score = combinedScore(
      metrics({ internalMarks: 80, quizScore: 90, attendancePercent: 100 }),
      weights({ internalMarks: 0, quizScores: 0, attendance: 0 }),
    );
    expect(score).toBe(0);
  });

  it('treats a NaN metric as a zero contribution', () => {
    const score = combinedScore(
      metrics({ internalMarks: NaN, quizScore: 10, attendancePercent: 0 }),
      weights({ internalMarks: 1, quizScores: 1, attendance: 0 }),
    );
    expect(score).toBe(10);
  });

  it('treats an infinite metric as a zero contribution', () => {
    expect(
      combinedScore(
        metrics({ internalMarks: Infinity }),
        weights({ internalMarks: 1, quizScores: 0, attendance: 0 }),
      ),
    ).toBe(0);
    expect(
      combinedScore(
        metrics({ internalMarks: -Infinity }),
        weights({ internalMarks: 1, quizScores: 0, attendance: 0 }),
      ),
    ).toBe(0);
  });

  it('treats a non-finite weight as a zero contribution', () => {
    const score = combinedScore(
      metrics({ internalMarks: 5, quizScore: 7, attendancePercent: 0 }),
      weights({ internalMarks: Infinity, quizScores: 2, attendance: 0 }),
    );
    // internal term drops out (weight infinite); quiz term = 7*2 = 14
    expect(score).toBe(14);
  });

  it('is deterministic for identical inputs', () => {
    const m = metrics({ internalMarks: 12, quizScore: 34, attendancePercent: 56 });
    const w = weights({ internalMarks: 0.4, quizScores: 0.35, attendance: 0.25 });
    expect(combinedScore(m, w)).toBe(combinedScore(m, w));
  });

  it('SUSPECTED DOC GAP: overflows to Infinity for large finite inputs', () => {
    // The doc states the score is "always a finite number" once non-finite
    // inputs are guarded, but two large *finite* inputs still overflow. This
    // asserts the ACTUAL current behavior rather than the documented contract.
    const score = combinedScore(
      metrics({ internalMarks: 1e308 }),
      weights({ internalMarks: 1e308, quizScores: 0, attendance: 0 }),
    );
    expect(score).toBe(Infinity);
    expect(Number.isFinite(score)).toBe(false);
  });

  it('property: is finite when all inputs are finite and bounded', () => {
    const bounded = fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true });
    const boundedWeight = fc.double({ min: -1e3, max: 1e3, noNaN: true, noDefaultInfinity: true });
    fc.assert(
      fc.property(bounded, bounded, bounded, boundedWeight, boundedWeight, boundedWeight,
        (im, qs, ap, wi, wq, wa) => {
          const score = combinedScore(
            metrics({ internalMarks: im, quizScore: qs, attendancePercent: ap }),
            weights({ internalMarks: wi, quizScores: wq, attendance: wa }),
          );
          expect(Number.isFinite(score)).toBe(true);
        },
      ),
    );
  });

  it('property: non-finite metrics never leak into the score (contribute 0)', () => {
    const maybeNonFinite = fc.oneof(
      fc.constant(NaN),
      fc.constant(Infinity),
      fc.constant(-Infinity),
      fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
    );
    const boundedWeight = fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true });
    fc.assert(
      fc.property(maybeNonFinite, maybeNonFinite, maybeNonFinite, boundedWeight, boundedWeight, boundedWeight,
        (im, qs, ap, wi, wq, wa) => {
          const score = combinedScore(
            metrics({ internalMarks: im, quizScore: qs, attendancePercent: ap }),
            weights({ internalMarks: wi, quizScores: wq, attendance: wa }),
          );
          expect(Number.isFinite(score)).toBe(true);
        },
      ),
    );
  });
});

describe('rankStudents', () => {
  it('returns an empty array for no students', () => {
    expect(rankStudents([], weights())).toEqual([]);
  });

  it('returns a single student unchanged', () => {
    const only = [metrics({ studentId: 'only' })];
    expect(rankStudents(only, weights()).map((m) => m.studentId)).toEqual(['only']);
  });

  it('orders students by combined score, highest first', () => {
    const list: StudentMetrics[] = [
      metrics({ studentId: 'low', name: 'A', internalMarks: 10 }),
      metrics({ studentId: 'high', name: 'B', internalMarks: 90 }),
      metrics({ studentId: 'mid', name: 'C', internalMarks: 50 }),
    ];
    expect(rankStudents(list, weights({ internalMarks: 1, quizScores: 0, attendance: 0 })).map((m) => m.studentId)).toEqual([
      'high',
      'mid',
      'low',
    ]);
  });

  it('breaks ties on equal score by student name ascending', () => {
    const list: StudentMetrics[] = [
      metrics({ studentId: 'bob', name: 'Bob', internalMarks: 10, quizScore: 10, attendancePercent: 10 }),
      metrics({ studentId: 'alice', name: 'Alice', internalMarks: 5, quizScore: 15, attendancePercent: 10 }),
      metrics({ studentId: 'carol', name: 'Carol', internalMarks: 20, quizScore: 5, attendancePercent: 5 }),
    ];
    // All three have combined score 30 with unit weights → tie-break by name.
    expect(rankStudents(list, weights()).map((m) => m.name)).toEqual(['Alice', 'Bob', 'Carol']);
  });

  it('does not mutate the input array', () => {
    const list: StudentMetrics[] = [
      metrics({ studentId: 'a', name: 'A', internalMarks: 1 }),
      metrics({ studentId: 'b', name: 'B', internalMarks: 99 }),
    ];
    const before = list.map((m) => m.studentId);
    rankStudents(list, weights());
    expect(list.map((m) => m.studentId)).toEqual(before);
  });

  it('returns a permutation of the input (no students added or dropped)', () => {
    const list: StudentMetrics[] = [
      metrics({ studentId: 'a', name: 'A', internalMarks: 30 }),
      metrics({ studentId: 'b', name: 'B', internalMarks: 10 }),
      metrics({ studentId: 'c', name: 'C', internalMarks: 20 }),
    ];
    const ranked = rankStudents(list, weights());
    expect(ranked.map((m) => m.studentId).sort()).toEqual(['a', 'b', 'c']);
    expect(ranked.length).toBe(list.length);
  });

  it('property: output is a permutation ordered by non-increasing score', () => {
    const metricArb = fc.record({
      studentId: fc.string(),
      name: fc.string(),
      internalMarks: fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
      quizScore: fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
      attendancePercent: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
    });
    const weightArb = fc.record({
      internalMarks: fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }),
      quizScores: fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }),
      attendance: fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }),
    });
    fc.assert(
      fc.property(fc.array(metricArb, { maxLength: 15 }), weightArb, (list, w) => {
        const ranked = rankStudents(list, w);
        // Same length and same multiset of studentIds.
        expect(ranked.length).toBe(list.length);
        expect([...ranked].map((m) => m.studentId).sort()).toEqual(
          [...list].map((m) => m.studentId).sort(),
        );
        // Scores are non-increasing.
        for (let i = 1; i < ranked.length; i += 1) {
          expect(combinedScore(ranked[i - 1], w)).toBeGreaterThanOrEqual(
            combinedScore(ranked[i], w),
          );
        }
      }),
    );
  });
});
