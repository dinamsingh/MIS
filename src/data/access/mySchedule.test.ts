import { describe, expect, it } from 'vitest';
import {
  formatScheduleCellLabel,
  truncateSubjectName,
  MAX_SUBJECT_NAME_LENGTH,
} from './mySchedule';

describe('truncateSubjectName', () => {
  it('returns short names unchanged', () => {
    expect(truncateSubjectName('DBMS')).toBe('DBMS');
    expect(truncateSubjectName('Operating Systems')).toBe('Operating Systems');
  });

  it('returns names exactly at the limit unchanged', () => {
    const exactLength = 'A'.repeat(MAX_SUBJECT_NAME_LENGTH);
    expect(truncateSubjectName(exactLength)).toBe(exactLength);
  });

  it('truncates names exceeding the limit with an ellipsis', () => {
    const longName = 'Database Management Systems And More';
    const result = truncateSubjectName(longName);
    expect(result.length).toBe(MAX_SUBJECT_NAME_LENGTH);
    expect(result.endsWith('…')).toBe(true);
    expect(result).toBe(`${longName.slice(0, MAX_SUBJECT_NAME_LENGTH - 1)}…`);
  });

  it('is idempotent — re-truncating an already-truncated name is a no-op', () => {
    const longName = 'A'.repeat(MAX_SUBJECT_NAME_LENGTH + 10);
    const once = truncateSubjectName(longName);
    const twice = truncateSubjectName(once);
    expect(twice).toBe(once);
  });

  it('handles empty string', () => {
    expect(truncateSubjectName('')).toBe('');
  });
});

describe('formatScheduleCellLabel', () => {
  it('formats a typical label correctly', () => {
    expect(formatScheduleCellLabel(5, 'A', 'DBMS')).toBe('SEM 5(A) DBMS');
  });

  it('includes the section letter in parentheses', () => {
    expect(formatScheduleCellLabel(3, 'B', 'Data Structure')).toBe('SEM 3(B) Data Structure');
  });

  it('truncates long subject names in the label', () => {
    const longSubject = 'Object Oriented Programming & Methodology';
    const result = formatScheduleCellLabel(4, 'C', longSubject);
    expect(result).toBe(`SEM 4(C) ${truncateSubjectName(longSubject)}`);
    expect(result.startsWith('SEM 4(C) ')).toBe(true);
  });

  it('handles semester 1 and single-char subjects', () => {
    expect(formatScheduleCellLabel(1, 'A', 'Mathematics-I')).toBe('SEM 1(A) Mathematics-I');
  });
});
