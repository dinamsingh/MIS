import { describe, expect, it } from 'vitest';
import { buildAssignments, deriveBatchesForSession } from './onboarding';
import type { Batch, SelectionState, SyllabusSubject } from '../types';

const subjects: readonly SyllabusSubject[] = [
  {
    id: 'sub-theory',
    sem: 4,
    code: 'CS-404',
    name: 'Computer Organization & Architecture',
    kind: 'theory',
    labName: 'COA Lab',
    electiveGroup: null,
  },
];

const batches: readonly Batch[] = [
  { id: '2024-28', startYear: 2024, currentSem: 5, status: 'classes' },
  { id: '2026-30', startYear: 2026, currentSem: 1, status: 'classes' },
  { id: '2023-27', startYear: 2023, currentSem: 7, status: 'classes' },
  { id: '2025-29', startYear: 2025, currentSem: 3, status: 'classes' },
];

describe('deriveBatchesForSession', () => {
  it('maps active batches to odd semesters by latest start year first', () => {
    expect(deriveBatchesForSession(batches, 'odd').map((batch) => [batch.id, batch.currentSem])).toEqual([
      ['2026-30', 1],
      ['2025-29', 3],
      ['2024-28', 5],
      ['2023-27', 7],
    ]);
  });

  it('maps active batches to even semesters by latest start year first', () => {
    expect(deriveBatchesForSession(batches, 'even').map((batch) => [batch.id, batch.currentSem])).toEqual([
      ['2026-30', 2],
      ['2025-29', 4],
      ['2024-28', 6],
      ['2023-27', 8],
    ]);
  });
});

describe('buildAssignments', () => {
  it('adds a lab row for lab-backed theory sections that keep lab included', () => {
    const selection: SelectionState = {
      '2024-28': {
        'sub-theory': { sections: ['A'], labSections: ['A'] },
      },
    };

    expect(buildAssignments(selection, subjects)).toEqual([
      { subjectId: 'sub-theory', batchId: '2024-28', section: 'A', isLab: false, semester: 4 },
      { subjectId: 'sub-theory', batchId: '2024-28', section: 'A', isLab: true, semester: 4 },
    ]);
  });

  it('does not add a lab row when the teacher removes the attached lab for a section', () => {
    const selection: SelectionState = {
      '2024-28': {
        'sub-theory': { sections: ['A'], labSections: [] },
      },
    };

    expect(buildAssignments(selection, subjects)).toEqual([
      { subjectId: 'sub-theory', batchId: '2024-28', section: 'A', isLab: false, semester: 4 },
    ]);
  });

  it('can keep lab for one selected section while removing it for another', () => {
    const selection: SelectionState = {
      '2024-28': {
        'sub-theory': { sections: ['A', 'B'], labSections: ['A'] },
      },
    };

    expect(buildAssignments(selection, subjects)).toEqual([
      { subjectId: 'sub-theory', batchId: '2024-28', section: 'A', isLab: false, semester: 4 },
      { subjectId: 'sub-theory', batchId: '2024-28', section: 'A', isLab: true, semester: 4 },
      { subjectId: 'sub-theory', batchId: '2024-28', section: 'B', isLab: false, semester: 4 },
    ]);
  });
});
