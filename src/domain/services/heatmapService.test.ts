import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  attendancePercent,
  defaulters,
  dayHeatLevel,
  DEFAULTER_THRESHOLD,
  type StudentAttendance,
} from './heatmapService';
import type { AttendanceMark } from './attendanceService';

const student = (over: Partial<StudentAttendance> = {}): StudentAttendance => ({
  studentId: 's1',
  attendedPeriods: 0,
  totalHeldPeriods: 0,
  ...over,
});

const mark = (present: boolean, id = 's'): AttendanceMark => ({
  studentId: id,
  present,
});

describe('DEFAULTER_THRESHOLD', () => {
  it('is 75 percent', () => {
    expect(DEFAULTER_THRESHOLD).toBe(75);
  });
});

describe('attendancePercent', () => {
  it('returns 0 for a zero total (zero-division guard)', () => {
    expect(attendancePercent(0, 0)).toBe(0);
  });

  it('returns 0 for a zero total even when attended is positive', () => {
    // Documents the guard: a positive attended with no held periods is impossible
    // in practice, but the function short-circuits on total === 0.
    expect(attendancePercent(5, 0)).toBe(0);
  });

  it('returns 0 when nothing was attended', () => {
    expect(attendancePercent(0, 40)).toBe(0);
  });

  it('returns 100 when every held period was attended', () => {
    expect(attendancePercent(40, 40)).toBe(100);
  });

  it('computes attended / total * 100', () => {
    expect(attendancePercent(30, 40)).toBe(75);
    expect(attendancePercent(1, 8)).toBeCloseTo(12.5, 10);
  });

  it('exceeds 100 when attended exceeds total (no clamping)', () => {
    // Per the doc contract the [0,100] bound only holds when attended <= total.
    expect(attendancePercent(10, 5)).toBe(200);
  });

  it('goes negative for a negative attended count (no clamping)', () => {
    expect(attendancePercent(-5, 10)).toBe(-50);
  });

  it('property: stays within [0, 100] when 0 <= attended <= total and total > 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (total, raw) => {
          const attended = raw % (total + 1); // constrain to [0, total]
          const pct = attendancePercent(attended, total);
          expect(pct).toBeGreaterThanOrEqual(0);
          expect(pct).toBeLessThanOrEqual(100);
        },
      ),
    );
  });
});

describe('dayHeatLevel', () => {
  it('returns 0 for a day with no recorded marks (empty-input guard)', () => {
    expect(dayHeatLevel([])).toBe(0);
  });

  it('returns 100 when every mark is present', () => {
    expect(dayHeatLevel([mark(true), mark(true), mark(true)])).toBe(100);
  });

  it('returns 0 when every mark is absent', () => {
    expect(dayHeatLevel([mark(false), mark(false)])).toBe(0);
  });

  it('returns 50 when half the marks are present', () => {
    expect(dayHeatLevel([mark(true), mark(false)])).toBe(50);
  });

  it('computes present / total * 100 for a mixed day', () => {
    expect(dayHeatLevel([mark(true), mark(false), mark(false), mark(false)])).toBe(25);
  });

  it('property: equals present/total*100 and stays within [0, 100]', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean()), (flags) => {
        const marks = flags.map((present, i) => mark(present, `s${i}`));
        const level = dayHeatLevel(marks);
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(100);
        const present = flags.filter(Boolean).length;
        const expected = flags.length === 0 ? 0 : (present / flags.length) * 100;
        expect(level).toBeCloseTo(expected, 10);
      }),
    );
  });
});

describe('defaulters', () => {
  it('returns an empty list for no students', () => {
    expect(defaulters([])).toEqual([]);
  });

  it('excludes a student sitting exactly on the 75 percent threshold', () => {
    // Strictly-below rule: exactly 75% is not a defaulter.
    expect(defaulters([student({ attendedPeriods: 3, totalHeldPeriods: 4 })])).toEqual([]);
    expect(defaulters([student({ attendedPeriods: 75, totalHeldPeriods: 100 })])).toEqual([]);
  });

  it('includes a student just below the threshold', () => {
    expect(
      defaulters([student({ studentId: 'x', attendedPeriods: 74, totalHeldPeriods: 100 })]),
    ).toEqual(['x']);
  });

  it('treats a student with no held periods as a defaulter (0 percent)', () => {
    expect(
      defaulters([student({ studentId: 'zero', attendedPeriods: 0, totalHeldPeriods: 0 })]),
    ).toEqual(['zero']);
  });

  it('excludes a student with perfect attendance', () => {
    expect(
      defaulters([student({ attendedPeriods: 40, totalHeldPeriods: 40 })]),
    ).toEqual([]);
  });

  it('excludes a student above 100 percent (attended exceeds total)', () => {
    expect(
      defaulters([student({ attendedPeriods: 10, totalHeldPeriods: 5 })]),
    ).toEqual([]);
  });

  it('returns only the defaulter ids, preserving input order', () => {
    const students: StudentAttendance[] = [
      student({ studentId: 'a', attendedPeriods: 90, totalHeldPeriods: 100 }), // 90% ok
      student({ studentId: 'b', attendedPeriods: 50, totalHeldPeriods: 100 }), // 50% defaulter
      student({ studentId: 'c', attendedPeriods: 74, totalHeldPeriods: 100 }), // 74% defaulter
      student({ studentId: 'd', attendedPeriods: 75, totalHeldPeriods: 100 }), // 75% ok
    ];
    expect(defaulters(students)).toEqual(['b', 'c']);
  });

  it('recomputes purely from the supplied records on each call (Req 13.4)', () => {
    const before = defaulters([
      student({ studentId: 'p', attendedPeriods: 10, totalHeldPeriods: 100 }),
    ]);
    const after = defaulters([
      student({ studentId: 'p', attendedPeriods: 95, totalHeldPeriods: 100 }),
    ]);
    expect(before).toEqual(['p']);
    expect(after).toEqual([]);
  });

  it('property: a student is returned iff their attendance percent is strictly below 75', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            attendedPeriods: fc.integer({ min: 0, max: 500 }),
            totalHeldPeriods: fc.integer({ min: 0, max: 500 }),
          }),
          { maxLength: 20 },
        ),
        (rows) => {
          const students = rows.map((r, i) => student({ studentId: `s${i}`, ...r }));
          const ids = defaulters(students);
          students.forEach((s) => {
            const pct = attendancePercent(s.attendedPeriods, s.totalHeldPeriods);
            expect(ids.includes(s.studentId)).toBe(pct < DEFAULTER_THRESHOLD);
          });
        },
      ),
    );
  });
});
