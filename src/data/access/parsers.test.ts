import { describe, expect, it } from 'vitest';
import { parseQuizAccess, parseSubmitOutcome } from './parsers';

describe('parseQuizAccess', () => {
  it('parses a granted decision with an answer-free quiz payload', () => {
    const access = parseQuizAccess({
      status: 'granted',
      quiz: {
        id: 'quiz-1',
        unitId: 'unit-1',
        timeLimitMinutes: 15,
        shareToken: 'tok-1',
        questions: [{ id: 'q1', text: 'What is HTTP?', options: ['A protocol', 'A language'] }],
      },
    });

    expect(access.status).toBe('granted');
    if (access.status === 'granted') {
      expect(access.quiz.id).toBe('quiz-1');
      expect(access.quiz.timeLimitMinutes).toBe(15);
      expect(access.quiz.questions).toHaveLength(1);
      expect(access.quiz.questions[0]).toEqual({
        id: 'q1',
        text: 'What is HTTP?',
        options: ['A protocol', 'A language'],
      });
      // The payload never carries correct-answer data.
      expect(JSON.stringify(access.quiz)).not.toContain('correctIndex');
    }
  });

  it('parses enrollment-required', () => {
    expect(parseQuizAccess({ status: 'enrollment-required' })).toEqual({
      status: 'enrollment-required',
    });
  });

  it('parses already-attempted with the existing result', () => {
    const access = parseQuizAccess({
      status: 'already-attempted',
      result: { score: 3, totalMarks: 5 },
    });
    expect(access).toEqual({
      status: 'already-attempted',
      result: { score: 3, totalMarks: 5 },
    });
  });

  it('parses denied', () => {
    expect(parseQuizAccess({ status: 'denied', reason: 'not-registered' })).toEqual({
      status: 'denied',
      reason: 'not-registered',
    });
  });

  it('preserves specific quiz access denial reasons', () => {
    for (const reason of [
      'not-authenticated',
      'quiz-not-found',
      'enrollment-not-found',
      'enrollment-already-bound',
      'wrong-section',
      'not-active',
    ] as const) {
      expect(parseQuizAccess({ status: 'denied', reason })).toEqual({
        status: 'denied',
        reason,
      });
    }
  });

  it('defaults an unrecognized or null payload to denied (never grants by accident)', () => {
    expect(parseQuizAccess(null).status).toBe('denied');
    expect(parseQuizAccess({}).status).toBe('denied');
    expect(parseQuizAccess({ status: 'weird' }).status).toBe('denied');
  });

  it('tolerates a malformed granted payload by coercing fields', () => {
    const access = parseQuizAccess({ status: 'granted', quiz: { id: 'q', questions: 'nope' } });
    expect(access.status).toBe('granted');
    if (access.status === 'granted') {
      expect(access.quiz.questions).toEqual([]);
      expect(access.quiz.timeLimitMinutes).toBe(0);
    }
  });
});

describe('parseSubmitOutcome', () => {
  it('parses a recorded result', () => {
    expect(parseSubmitOutcome({ status: 'recorded', result: { score: 2, totalMarks: 4 } })).toEqual(
      { status: 'recorded', result: { score: 2, totalMarks: 4 } },
    );
  });

  it('parses an already-attempted result preserving the first score', () => {
    expect(
      parseSubmitOutcome({ status: 'already-attempted', result: { score: 1, totalMarks: 4 } }),
    ).toEqual({ status: 'already-attempted', result: { score: 1, totalMarks: 4 } });
  });

  it('defaults a malformed payload to denied (never fabricates a score)', () => {
    expect(parseSubmitOutcome(undefined)).toEqual({ status: 'denied', reason: 'not-registered' });
    expect(parseSubmitOutcome({ status: 'recorded' })).toEqual({
      status: 'recorded',
      result: { score: 0, totalMarks: 0 },
    });
  });

  it('preserves the specific denial reason instead of collapsing to a generic one', () => {
    expect(parseSubmitOutcome({ status: 'denied', reason: 'quiz-not-found' })).toEqual({
      status: 'denied',
      reason: 'quiz-not-found',
    });
    expect(parseSubmitOutcome({ status: 'denied', reason: 'teacher-account' })).toEqual({
      status: 'denied',
      reason: 'teacher-account',
    });
    expect(parseSubmitOutcome({ status: 'denied', reason: 'not-authenticated' })).toEqual({
      status: 'denied',
      reason: 'not-authenticated',
    });
  });

  it('falls back to not-registered for an unrecognized reason value', () => {
    expect(parseSubmitOutcome({ status: 'denied', reason: 'something-unexpected' })).toEqual({
      status: 'denied',
      reason: 'not-registered',
    });
    expect(parseSubmitOutcome({ status: 'denied' })).toEqual({
      status: 'denied',
      reason: 'not-registered',
    });
  });
});
