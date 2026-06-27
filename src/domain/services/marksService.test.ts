import { describe, expect, it } from 'vitest';
import {
  validateMarkValue,
  computeInternalMarks,
  type MarkComponent,
} from './marksService';
import { isOk, isErr } from '../shared/result';

const component = (over: Partial<MarkComponent> = {}): MarkComponent => ({
  id: 'c1',
  name: 'Mid-term',
  maxValue: 50,
  weightage: 20,
  ...over,
});

describe('validateMarkValue', () => {
  it('accepts values within [0, maxValue]', () => {
    const c = component({ maxValue: 50 });
    for (const v of [0, 1, 25, 49, 50]) {
      const r = validateMarkValue(v, c);
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value).toBe(v);
    }
  });

  it('rejects values below zero', () => {
    const r = validateMarkValue(-1, component({ maxValue: 50 }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.code).toBe('mark-value-out-of-range');
      expect(r.error.message).toContain('50');
      expect(r.error.field).toBe('c1');
    }
  });

  it('rejects values above the configured maximum', () => {
    const r = validateMarkValue(51, component({ maxValue: 50 }));
    expect(isErr(r)).toBe(true);
  });

  it('rejects non-finite values', () => {
    expect(isErr(validateMarkValue(NaN, component()))).toBe(true);
    expect(isErr(validateMarkValue(Infinity, component()))).toBe(true);
  });

  it('embeds the configured maximum in the English message', () => {
    const r = validateMarkValue(999, component({ maxValue: 30 }));
    if (isErr(r)) expect(r.error.message).toBe('Enter a value between 0 and 30.');
  });
});

describe('computeInternalMarks', () => {
  it('returns zero when there are no components', () => {
    expect(computeInternalMarks([], [{ componentId: 'c1', value: 10 }])).toBe(0);
  });

  it('returns zero when no values are supplied', () => {
    expect(computeInternalMarks([component()], [])).toBe(0);
  });

  it('returns the full weightage when a value is at the component maximum', () => {
    const c = component({ maxValue: 50, weightage: 20 });
    expect(computeInternalMarks([c], [{ componentId: 'c1', value: 50 }])).toBe(20);
  });

  it('scales contribution linearly by value/maxValue', () => {
    const c = component({ maxValue: 50, weightage: 20 });
    expect(computeInternalMarks([c], [{ componentId: 'c1', value: 25 }])).toBe(10);
  });

  it('sums weighted contributions across multiple components', () => {
    const comps: MarkComponent[] = [
      { id: 'a', name: 'Mid', maxValue: 50, weightage: 20 },
      { id: 'b', name: 'Quiz', maxValue: 10, weightage: 10 },
      { id: 'c', name: 'Assignment', maxValue: 20, weightage: 5 },
    ];
    // 25/50*20=10, 5/10*10=5, 20/20*5=5 => 20
    const total = computeInternalMarks(comps, [
      { componentId: 'a', value: 25 },
      { componentId: 'b', value: 5 },
      { componentId: 'c', value: 20 },
    ]);
    expect(total).toBeCloseTo(20, 10);
  });

  it('is bounded by the sum of weightages when all values are maxed', () => {
    const comps: MarkComponent[] = [
      { id: 'a', name: 'Mid', maxValue: 50, weightage: 20 },
      { id: 'b', name: 'Quiz', maxValue: 10, weightage: 10 },
    ];
    expect(
      computeInternalMarks(comps, [
        { componentId: 'a', value: 50 },
        { componentId: 'b', value: 10 },
      ]),
    ).toBe(30);
  });

  it('ignores values for unknown components', () => {
    const c = component({ id: 'a', maxValue: 50, weightage: 20 });
    expect(
      computeInternalMarks([c], [{ componentId: 'zzz', value: 50 }]),
    ).toBe(0);
  });

  it('treats components with non-positive maxValue as zero contribution', () => {
    const c = component({ maxValue: 0, weightage: 20 });
    expect(computeInternalMarks([c], [{ componentId: 'c1', value: 5 }])).toBe(0);
  });

  it('is order-independent and deterministic', () => {
    const comps: MarkComponent[] = [
      { id: 'a', name: 'Mid', maxValue: 50, weightage: 20 },
      { id: 'b', name: 'Quiz', maxValue: 10, weightage: 10 },
    ];
    const values = [
      { componentId: 'b', value: 7 },
      { componentId: 'a', value: 33 },
    ];
    const reversed = [...values].reverse();
    expect(computeInternalMarks(comps, values)).toBe(
      computeInternalMarks(comps, reversed),
    );
  });

  it('clamps values exceeding maxValue to the component maximum contribution', () => {
    const c = component({ maxValue: 50, weightage: 20 });
    expect(computeInternalMarks([c], [{ componentId: 'c1', value: 999 }])).toBe(20);
  });
});
