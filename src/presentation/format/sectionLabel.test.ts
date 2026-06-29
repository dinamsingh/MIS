import { describe, expect, it } from 'vitest';
import { formatSectionLabel } from './sectionLabel';

describe('formatSectionLabel', () => {
  it('composes department · batch · semester · section token for a full section', () => {
    expect(
      formatSectionLabel({
        name: 'CSE-5A',
        batch: '2024-2028',
        semester: '5th Semester',
        department: 'CSE',
      }),
    ).toBe('CSE · 2024-2028 · 5th Sem · Sec A');
  });

  it('abbreviates the semester descriptor', () => {
    expect(
      formatSectionLabel({
        name: 'CSE-5B',
        batch: '2024-2028',
        semester: '5th Semester',
        department: 'CSE',
      }),
    ).toBe('CSE · 2024-2028 · 5th Sem · Sec B');
  });

  it('falls back to the bare name when no descriptors are present', () => {
    expect(
      formatSectionLabel({ name: 'CSE-5A', batch: null, semester: null, department: null }),
    ).toBe('CSE-5A');
    expect(formatSectionLabel({ name: 'Section A' })).toBe('Section A');
  });

  it('omits missing descriptors but still includes the section token', () => {
    expect(
      formatSectionLabel({ name: 'CSE-5C', department: 'CSE', batch: null, semester: null }),
    ).toBe('CSE · Sec C');
  });

  it('keeps the full name when it has no trailing letter token', () => {
    expect(
      formatSectionLabel({ name: 'Section 1', department: 'ECE', batch: '2023-2027' }),
    ).toBe('ECE · 2023-2027 · Section 1');
  });
});
