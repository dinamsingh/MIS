import { describe, expect, it } from 'vitest';
import {
  gradeAttempt,
  gradeAttemptResult,
  totalAvailableMarks,
  submitAttempt,
  createInMemoryQuizAttemptStore,
  type Question,
  type AttemptResult,
} from './quizService';

const q = (over: Partial<Question> = {}): Question => ({
  id: 'q1',
  text: 'What is HTTP?',
  options: ['A', 'B', 'C', 'D'],
  correctIndex: 0,
  marks: 1,
  ...over,
});

describe('gradeAttempt', () => {
  it('returns zero when there are no questions', () => {
    expect(gradeAttempt([], {})).toBe(0);
  });

  it('returns zero when no answers are submitted', () => {
    expect(gradeAttempt([q(), q({ id: 'q2' })], {})).toBe(0);
  });

  it('awards a question marks only when the submitted answer matches correctIndex', () => {
    const questions = [q({ id: 'q1', correctIndex: 2, marks: 3 })];
    expect(gradeAttempt(questions, { q1: 2 })).toBe(3);
    expect(gradeAttempt(questions, { q1: 1 })).toBe(0);
  });

  it('sums marks across multiple correct answers', () => {
    const questions = [
      q({ id: 'q1', correctIndex: 0, marks: 2 }),
      q({ id: 'q2', correctIndex: 1, marks: 5 }),
      q({ id: 'q3', correctIndex: 3, marks: 1 }),
    ];
    expect(gradeAttempt(questions, { q1: 0, q2: 1, q3: 3 })).toBe(8);
  });

  it('applies no negative marking for wrong answers', () => {
    const questions = [
      q({ id: 'q1', correctIndex: 0, marks: 2 }),
      q({ id: 'q2', correctIndex: 1, marks: 5 }),
    ];
    // q1 correct (+2), q2 wrong (+0) => 2, never below the correct-only sum
    expect(gradeAttempt(questions, { q1: 0, q2: 3 })).toBe(2);
  });

  it('never exceeds the total available marks', () => {
    const questions = [
      q({ id: 'q1', correctIndex: 0, marks: 2 }),
      q({ id: 'q2', correctIndex: 1, marks: 5 }),
    ];
    const score = gradeAttempt(questions, { q1: 0, q2: 1 });
    expect(score).toBe(totalAvailableMarks(questions));
    expect(score).toBeLessThanOrEqual(totalAvailableMarks(questions));
  });

  it('ignores out-of-range and unknown answer keys without deducting', () => {
    const questions = [q({ id: 'q1', correctIndex: 0, marks: 4 })];
    expect(gradeAttempt(questions, { q1: 99, qZ: 0 })).toBe(0);
  });

  it('treats non-finite or non-positive marks as zero contribution', () => {
    const questions = [
      q({ id: 'q1', correctIndex: 0, marks: Number.NaN }),
      q({ id: 'q2', correctIndex: 0, marks: -5 }),
      q({ id: 'q3', correctIndex: 0, marks: 0 }),
    ];
    expect(gradeAttempt(questions, { q1: 0, q2: 0, q3: 0 })).toBe(0);
    expect(totalAvailableMarks(questions)).toBe(0);
  });
});

describe('gradeAttemptResult', () => {
  it('packages score alongside the total available marks', () => {
    const questions = [
      q({ id: 'q1', correctIndex: 0, marks: 2 }),
      q({ id: 'q2', correctIndex: 1, marks: 5 }),
    ];
    expect(gradeAttemptResult(questions, { q1: 0 })).toEqual({
      score: 2,
      totalMarks: 7,
    });
  });
});

const result = (over: Partial<AttemptResult> = {}): AttemptResult => ({
  score: 5,
  totalMarks: 10,
  ...over,
});

describe('submitAttempt (single-attempt store)', () => {
  it('records the first attempt for a (quiz, student) pair', () => {
    const store = new Map<string, AttemptResult>();
    const outcome = submitAttempt(store, 'quiz-1', 'student-1', result({ score: 7 }));
    expect(outcome.status).toBe('recorded');
    expect(outcome.result.score).toBe(7);
  });

  it('rejects a second attempt and preserves the first result', () => {
    const store = new Map<string, AttemptResult>();
    submitAttempt(store, 'quiz-1', 'student-1', result({ score: 7 }));
    const second = submitAttempt(store, 'quiz-1', 'student-1', result({ score: 10 }));
    expect(second.status).toBe('already-attempted');
    expect(second.result.score).toBe(7);
  });

  it('stores exactly one record per (quiz, student) pair', () => {
    const store = new Map<string, AttemptResult>();
    submitAttempt(store, 'quiz-1', 'student-1', result());
    submitAttempt(store, 'quiz-1', 'student-1', result({ score: 9 }));
    submitAttempt(store, 'quiz-1', 'student-1', result({ score: 1 }));
    expect(store.size).toBe(1);
  });

  it('keeps attempts for different students and quizzes independent', () => {
    const store = new Map<string, AttemptResult>();
    expect(submitAttempt(store, 'quiz-1', 'student-1', result({ score: 1 })).status).toBe('recorded');
    expect(submitAttempt(store, 'quiz-1', 'student-2', result({ score: 2 })).status).toBe('recorded');
    expect(submitAttempt(store, 'quiz-2', 'student-1', result({ score: 3 })).status).toBe('recorded');
    expect(store.size).toBe(3);
  });
});

describe('createInMemoryQuizAttemptStore', () => {
  it('records then rejects a repeat attempt, returning the preserved result', async () => {
    const svc = createInMemoryQuizAttemptStore();
    const first = await svc.submitAttempt('quiz-1', 'student-1', result({ score: 4 }));
    expect(first.status).toBe('recorded');

    const repeat = await svc.submitAttempt('quiz-1', 'student-1', result({ score: 8 }));
    expect(repeat.status).toBe('already-attempted');
    expect(repeat.result.score).toBe(4);
  });

  it('returns the stored attempt via getAttempt, or null when absent', async () => {
    const svc = createInMemoryQuizAttemptStore();
    expect(await svc.getAttempt('quiz-1', 'student-1')).toBeNull();

    await svc.submitAttempt('quiz-1', 'student-1', result({ score: 6 }));
    const stored = await svc.getAttempt('quiz-1', 'student-1');
    expect(stored?.score).toBe(6);
  });
});
