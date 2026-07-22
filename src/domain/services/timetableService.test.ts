import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  isConsecutiveSpan,
  sectionIdsForSubject,
  spannedPeriodIds,
  todaysClasses,
  type TimetableEntry,
} from './timetableService';

const entry = (
  id: string,
  sectionId: string,
  subjectId: string,
  dayOfWeek: TimetableEntry['dayOfWeek'] = 'monday',
  timeSlot = '09:00',
): TimetableEntry => ({ id, sectionId, subjectId, dayOfWeek, timeSlot, periodId: null, spanPeriods: 1, room: null, isTutorial: false, specialActivity: null });

describe('todaysClasses', () => {
  it('returns only the entries for the requested day, preserving order', () => {
    const entries = [
      entry('1', 'secA', 'iwt', 'monday'),
      entry('2', 'secA', 'os', 'tuesday'),
      entry('3', 'secB', 'iwt', 'monday'),
    ];
    expect(todaysClasses(entries, 'monday').map((e) => e.id)).toEqual(['1', '3']);
  });

  it('is empty when no entry matches the day', () => {
    expect(todaysClasses([entry('1', 'secA', 'iwt', 'monday')], 'friday')).toEqual([]);
  });
});

describe('sectionIdsForSubject', () => {
  it('returns the distinct sections that are taught the subject', () => {
    const entries = [
      entry('1', 'secA', 'iwt'),
      entry('2', 'secB', 'iwt'),
      entry('3', 'secC', 'os'),
    ];
    expect(sectionIdsForSubject(entries, 'iwt')).toEqual(['secA', 'secB']);
  });

  it('collapses several weekly periods of the same section to one id', () => {
    const entries = [
      entry('1', 'secA', 'iwt', 'monday', '09:00'),
      entry('2', 'secA', 'iwt', 'wednesday', '11:00'),
      entry('3', 'secB', 'iwt', 'friday', '10:00'),
    ];
    expect(sectionIdsForSubject(entries, 'iwt')).toEqual(['secA', 'secB']);
  });

  it('preserves first-seen (timetable) order of the sections', () => {
    const entries = [
      entry('1', 'secB', 'iwt'),
      entry('2', 'secA', 'iwt'),
      entry('3', 'secB', 'iwt'),
    ];
    expect(sectionIdsForSubject(entries, 'iwt')).toEqual(['secB', 'secA']);
  });

  it('is empty when no section teaches the subject', () => {
    const entries = [entry('1', 'secA', 'os')];
    expect(sectionIdsForSubject(entries, 'iwt')).toEqual([]);
  });
});

describe('isConsecutiveSpan', () => {
  it('is false for an empty selection', () => {
    expect(isConsecutiveSpan([])).toBe(false);
  });

  it('is true for a single period', () => {
    expect(isConsecutiveSpan([{ sortOrder: 5 }])).toBe(true);
  });

  it('is true for consecutive periods given out of order', () => {
    expect(isConsecutiveSpan([{ sortOrder: 3 }, { sortOrder: 1 }, { sortOrder: 2 }])).toBe(true);
  });

  it('is false when the selection has a gap', () => {
    expect(isConsecutiveSpan([{ sortOrder: 1 }, { sortOrder: 3 }])).toBe(false);
  });

  /**
   * **Property 29: Multi-period lab span validity**
   * **Validates: Requirements 14.1, 14.3**
   * For any set of periods (regardless of the order they were selected in),
   * `isConsecutiveSpan` accepts the selection if and only if the sorted
   * `sortOrder` values form a gapless run of consecutive integers.
   */
  it('property: accepts a selection iff its sorted sortOrder values are gapless and consecutive', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: -50, max: 50 }), { minLength: 1, maxLength: 12 }),
        (sortOrders) => {
          const sorted = [...sortOrders].sort((a, b) => a - b);
          const expected = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
          const periods = sortOrders.map((sortOrder) => ({ sortOrder }));
          expect(isConsecutiveSpan(periods)).toBe(expected);
        },
      ),
    );
  });
});

describe('spannedPeriodIds', () => {
  it('returns an empty array when the entry\'s periodId is not in the catalog', () => {
    const catalog = [
      { id: 'p1', sortOrder: 1, dayType: 'weekday' },
      { id: 'p2', sortOrder: 2, dayType: 'weekday' },
    ];
    expect(spannedPeriodIds({ periodId: 'missing', spanPeriods: 2 }, catalog)).toEqual([]);
  });

  it('expands a single-period entry to just its own id', () => {
    const catalog = [
      { id: 'p1', sortOrder: 1, dayType: 'weekday' },
      { id: 'p2', sortOrder: 2, dayType: 'weekday' },
    ];
    expect(spannedPeriodIds({ periodId: 'p1', spanPeriods: 1 }, catalog)).toEqual(['p1']);
  });

  it('never crosses into a different dayType', () => {
    const catalog = [
      { id: 'p1', sortOrder: 1, dayType: 'weekday' },
      { id: 'p2', sortOrder: 2, dayType: 'weekday' },
      { id: 'sat1', sortOrder: 2, dayType: 'saturday' },
    ];
    expect(spannedPeriodIds({ periodId: 'p1', spanPeriods: 5 }, catalog)).toEqual(['p1', 'p2']);
  });

  /**
   * **Property 29: Multi-period lab span validity**
   * **Validates: Requirements 14.1, 14.2, 14.3**
   * For any catalog (with noise from a different dayType) and any entry
   * within it, `spannedPeriodIds` returns exactly the catalog ids whose
   * `sortOrder` falls in `[start.sortOrder, start.sortOrder + spanPeriods)`
   * within the same `dayType`, in ascending `sortOrder` order — and returns
   * `[]` when the entry's `periodId` is not found in the catalog.
   */
  it('property: returns exactly the same-dayType ids within [start, start+span), ascending', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 30 }), { minLength: 1, maxLength: 15 }),
        fc.uniqueArray(fc.integer({ min: 0, max: 30 }), { minLength: 0, maxLength: 6 }),
        fc.nat(),
        fc.integer({ min: 1, max: 8 }),
        (targetSortOrders, otherSortOrders, startIdxRaw, spanPeriods) => {
          const targetCatalog = targetSortOrders.map((sortOrder, i) => ({
            id: `t${i}`,
            sortOrder,
            dayType: 'weekday',
          }));
          const otherCatalog = otherSortOrders.map((sortOrder, i) => ({
            id: `o${i}`,
            sortOrder,
            dayType: 'saturday',
          }));
          const catalog = [...targetCatalog, ...otherCatalog];
          const start = targetCatalog[startIdxRaw % targetCatalog.length];
          const result = spannedPeriodIds({ periodId: start.id, spanPeriods }, catalog);

          const expected = catalog
            .filter(
              (p) =>
                p.dayType === start.dayType &&
                p.sortOrder >= start.sortOrder &&
                p.sortOrder < start.sortOrder + spanPeriods,
            )
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((p) => p.id);

          expect(result).toEqual(expected);
        },
      ),
    );
  });

  it('property: an unknown periodId always resolves to an empty array', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 4 }).filter((s) => !s.startsWith('__missing__')),
            sortOrder: fc.integer({ min: 0, max: 30 }),
            dayType: fc.constantFrom('weekday', 'saturday'),
          }),
          { maxLength: 10 },
        ),
        fc.integer({ min: 1, max: 8 }),
        (catalog, spanPeriods) => {
          expect(spannedPeriodIds({ periodId: '__missing__', spanPeriods }, catalog)).toEqual([]);
        },
      ),
    );
  });
});
