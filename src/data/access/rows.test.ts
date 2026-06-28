import { describe, expect, it } from 'vitest';
import {
  toRosterEntry,
  fromRosterEntry,
  toAttendanceMark,
  fromAttendanceMark,
  toTopic,
  toUnit,
  toMarkComponent,
  toMarkValue,
  toTimetableEntry,
  toLeaderboardWeights,
  toSubmissionStatus,
  toSection,
  type TopicRow,
} from './rows';
import type { PeriodKey, AttendanceMark } from '../../domain/services/attendanceService';

describe('section row mappers', () => {
  it('maps a section row to a domain section, preserving descriptors', () => {
    expect(
      toSection({
        id: 'aa1',
        name: 'CSE-5A',
        batch: '2024-2028',
        semester: '5th Semester',
        department: 'CSE',
      }),
    ).toEqual({
      id: 'aa1',
      name: 'CSE-5A',
      batch: '2024-2028',
      semester: '5th Semester',
      department: 'CSE',
    });
  });

  it('preserves null descriptors for legacy rows', () => {
    expect(
      toSection({ id: 's1', name: 'Section A', batch: null, semester: null, department: null }),
    ).toEqual({ id: 's1', name: 'Section A', batch: null, semester: null, department: null });
  });
});

describe('roster row mappers', () => {
  it('maps a row to a domain entry and back, dropping a null name', () => {
    const entry = toRosterEntry({ enrollment_number: '0131CS241000', email: 'a@x.com', name: null });
    expect(entry).toEqual({ enrollmentNumber: '0131CS241000', email: 'a@x.com' });
    expect('name' in entry).toBe(false);

    expect(fromRosterEntry({ enrollmentNumber: '0131CS241000', email: 'a@x.com' })).toEqual({
      enrollment_number: '0131CS241000',
      email: 'a@x.com',
      name: null,
    });
  });

  it('preserves a present name in both directions', () => {
    const entry = toRosterEntry({ enrollment_number: '0131CS241000', email: 'a@x.com', name: 'Aarav' });
    expect(entry.name).toBe('Aarav');
    expect(fromRosterEntry(entry).name).toBe('Aarav');
  });
});

describe('attendance row mappers', () => {
  const key: PeriodKey = { sectionId: 's1', subjectId: 'sub1', date: '2024-05-01', timeSlot: '09:00' };

  it('projects a row to a mark', () => {
    expect(
      toAttendanceMark({
        student_id: 'st1',
        section_id: 's1',
        subject_id: 'sub1',
        date: '2024-05-01',
        time_slot: '09:00',
        present: true,
      }),
    ).toEqual({ studentId: 'st1', present: true });
  });

  it('builds a full upsert row from a key and a mark', () => {
    const mark: AttendanceMark = { studentId: 'st1', present: false };
    expect(fromAttendanceMark(key, mark)).toEqual({
      student_id: 'st1',
      section_id: 's1',
      subject_id: 'sub1',
      date: '2024-05-01',
      time_slot: '09:00',
      present: false,
    });
  });
});

describe('syllabus row mappers', () => {
  it('maps a topic row to a domain topic', () => {
    expect(
      toTopic({ id: 't1', unit_id: 'u1', name: 'Intro', complete: true, planned_date: null }),
    ).toEqual({ id: 't1', name: 'Intro', complete: true });
  });

  it('attaches only the unit\'s own topics and includes a planned date when present', () => {
    const topicRows: TopicRow[] = [
      { id: 't1', unit_id: 'u1', name: 'A', complete: false, planned_date: null },
      { id: 't2', unit_id: 'u2', name: 'B', complete: true, planned_date: null },
      { id: 't3', unit_id: 'u1', name: 'C', complete: true, planned_date: null },
    ];
    const unit = toUnit({ id: 'u1', subject_id: 's1', name: 'Unit 1', planned_date: '2024-06-01' }, topicRows);
    expect(unit.topics.map((t) => t.id)).toEqual(['t1', 't3']);
    expect(unit.plannedDate).toBe('2024-06-01');
  });
});

describe('marks row mappers', () => {
  it('maps a component row', () => {
    expect(
      toMarkComponent({ id: 'c1', subject_id: 's1', name: 'Quiz', max_value: 10, weightage: 20 }),
    ).toEqual({ id: 'c1', name: 'Quiz', maxValue: 10, weightage: 20 });
  });

  it('maps a value row', () => {
    expect(toMarkValue({ student_id: 'st1', component_id: 'c1', value: 8 })).toEqual({
      componentId: 'c1',
      value: 8,
    });
  });
});

describe('timetable + leaderboard + submission mappers', () => {
  it('maps a timetable row', () => {
    expect(
      toTimetableEntry({
        id: 'e1',
        section_id: 's1',
        subject_id: 'sub1',
        day_of_week: 'monday',
        time_slot: '09:00',
      }),
    ).toEqual({ id: 'e1', sectionId: 's1', subjectId: 'sub1', dayOfWeek: 'monday', timeSlot: '09:00' });
  });

  it('maps leaderboard config to weights', () => {
    expect(
      toLeaderboardWeights({
        enabled: true,
        weight_internal: 1,
        weight_quiz: 2,
        weight_attendance: 3,
      }),
    ).toEqual({ internalMarks: 1, quizScores: 2, attendance: 3 });
  });

  it('normalizes submission status with not-submitted as the default', () => {
    expect(toSubmissionStatus('submitted')).toBe('submitted');
    expect(toSubmissionStatus('not-submitted')).toBe('not-submitted');
    expect(toSubmissionStatus(null)).toBe('not-submitted');
    expect(toSubmissionStatus(undefined)).toBe('not-submitted');
    expect(toSubmissionStatus('anything-else')).toBe('not-submitted');
  });
});
