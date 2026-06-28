import { describe, expect, it } from 'vitest';
import {
  sectionIdsForSubject,
  todaysClasses,
  type TimetableEntry,
} from './timetableService';

const entry = (
  id: string,
  sectionId: string,
  subjectId: string,
  dayOfWeek: TimetableEntry['dayOfWeek'] = 'monday',
  timeSlot = '09:00',
): TimetableEntry => ({ id, sectionId, subjectId, dayOfWeek, timeSlot });

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
