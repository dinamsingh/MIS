import { describe, expect, it } from 'vitest';
import { progressPercent, scheduleStatus, type Topic } from './syllabusService';

const topic = (id: string, complete: boolean): Topic => ({ id, name: `Topic ${id}`, complete });

describe('progressPercent', () => {
  it('returns 0 for an empty topic set (Req 6.7)', () => {
    expect(progressPercent([])).toBe(0);
  });

  it('returns 0 when no topics are complete', () => {
    expect(progressPercent([topic('1', false), topic('2', false)])).toBe(0);
  });

  it('returns 100 when all topics are complete', () => {
    expect(progressPercent([topic('1', true), topic('2', true)])).toBe(100);
  });

  it('computes completed/total*100 for a partial set (Req 6.5)', () => {
    expect(progressPercent([topic('1', true), topic('2', false), topic('3', false), topic('4', false)])).toBe(25);
    expect(progressPercent([topic('1', true), topic('2', true), topic('3', false)])).toBeCloseTo(66.666, 2);
  });
});

describe('scheduleStatus', () => {
  it('is behind-schedule when actual is strictly less than planned (Req 6.6)', () => {
    expect(scheduleStatus(40, 50)).toBe('behind-schedule');
  });

  it('is on-schedule when actual equals planned', () => {
    expect(scheduleStatus(50, 50)).toBe('on-schedule');
  });

  it('is on-schedule when actual exceeds planned', () => {
    expect(scheduleStatus(80, 50)).toBe('on-schedule');
  });
});
