import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeDemoValue } from '@data/demo/localDemoMode';
import { buildAssignments, deriveBatchesForSession, DEMO_STORAGE_KEY, fetchOnboardedSections } from './onboarding';
import type { Batch, OnboardingRecord, SelectionState, SyllabusSubject } from '../types';

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

describe('fetchOnboardedSections', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
  });

  afterEach(() => {
    window.localStorage.removeItem(DEMO_STORAGE_KEY);
    vi.unstubAllEnvs();
  });

  it('excludes a stale assignment (subject sem behind the batch current sem) from the derived sections', async () => {
    // Batch '2024-28' is currently at sem 5 (see MOCK_BATCHES). An assignment
    // made for sem 3 of that batch is now stale (Requirement 11.1/11.2) and
    // must not produce a selectable section, while a current sem-5
    // assignment on the same batch still does.
    const record: OnboardingRecord = {
      onboarded: true,
      profile: { name: 'Demo Teacher', email: 'teacher@example.com', mustResetPassword: false },
      assignments: [
        { subjectId: 'sub-stale', batchId: '2024-28', section: 'A', isLab: false, semester: 3 },
        { subjectId: 'sub-current', batchId: '2024-28', section: 'B', isLab: false, semester: 5 },
      ],
    };
    writeDemoValue<OnboardingRecord>(DEMO_STORAGE_KEY, record);

    const sections = await fetchOnboardedSections();

    expect(sections.some((s) => s.id === '2024-28-A')).toBe(false);
    expect(sections.some((s) => s.id === '2024-28-B')).toBe(true);
  });

  it('keeps every non-stale assignment producing a section (no regression)', async () => {
    const record: OnboardingRecord = {
      onboarded: true,
      profile: { name: 'Demo Teacher', email: 'teacher@example.com', mustResetPassword: false },
      assignments: [
        { subjectId: 'sub-current-a', batchId: '2024-28', section: 'A', isLab: false, semester: 5 },
        { subjectId: 'sub-current-b', batchId: '2025-29', section: 'C', isLab: false, semester: 3 },
      ],
    };
    writeDemoValue<OnboardingRecord>(DEMO_STORAGE_KEY, record);

    const sections = await fetchOnboardedSections();

    expect(sections.map((s) => s.id).sort()).toEqual(['2024-28-A', '2025-29-C']);
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
