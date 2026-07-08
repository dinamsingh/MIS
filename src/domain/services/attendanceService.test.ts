import { describe, expect, it } from 'vitest';
import { aggregateRangeTallies } from './attendanceService';

describe('aggregateRangeTallies', () => {
  it('counts only present and absent rows toward student totals', () => {
    const result = aggregateRangeTallies([
      { studentId: 'a', date: '2024-05-01', status: 'present' },
      { studentId: 'a', date: '2024-05-02', status: 'leave' },
      { studentId: 'a', date: '2024-05-03', status: 'not-applicable' },
      { studentId: 'a', date: '2024-05-04', status: 'absent' },
      { studentId: 'b', date: '2024-05-01', status: 'absent' },
    ]);

    expect(result.tallies).toEqual([
      { studentId: 'a', present: 1, total: 2 },
      { studentId: 'b', present: 0, total: 1 },
    ]);
    expect(result.heldDates).toEqual(['2024-05-01', '2024-05-04']);
  });

  it('returns no held date for a date that only has leave or not-applicable rows', () => {
    expect(
      aggregateRangeTallies([
        { studentId: 'a', date: '2024-05-02', status: 'leave' },
        { studentId: 'b', date: '2024-05-02', status: 'not-applicable' },
      ]),
    ).toEqual({ tallies: [], heldDates: [] });
  });
});
