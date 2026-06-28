import { describe, expect, it } from 'vitest';
import {
  isValidEnrollmentNumber,
  upsertEntry,
  createRosterService,
  resolveQuizAccess,
  ENROLLMENT_NUMBER_INVALID_CODE,
  type RosterEntry,
  type QuizAccessContext,
  type QuizPayloadNoAnswers,
} from './rosterService';
import type { AttemptResult } from './quizService';
import { isOk, isErr } from '../shared/result';
import { messages } from '../shared/messages';

describe('isValidEnrollmentNumber', () => {
  it('accepts a conforming enrollment number (4 digits, 2 uppercase letters, 6 alphanumeric)', () => {
    expect(isValidEnrollmentNumber('0131CS241000')).toBe(true);
    expect(isValidEnrollmentNumber('9999ZZ000000')).toBe(true);
    expect(isValidEnrollmentNumber('0000AA999999')).toBe(true);
  });

  it('accepts back-semester enrollment numbers whose trailing segment has a letter', () => {
    expect(isValidEnrollmentNumber('0131CS243D01')).toBe(true);
    expect(isValidEnrollmentNumber('0131CS243D03')).toBe(true);
  });

  it('rejects lowercase letters in the letter segment', () => {
    expect(isValidEnrollmentNumber('0131cs241000')).toBe(false);
  });

  it('rejects wrong segment lengths', () => {
    expect(isValidEnrollmentNumber('013CS241000')).toBe(false); // 3 leading digits
    expect(isValidEnrollmentNumber('0131C241000')).toBe(false); // 1 letter
    expect(isValidEnrollmentNumber('0131CSE241000')).toBe(false); // 3 letters
    expect(isValidEnrollmentNumber('0131CS24100')).toBe(false); // 5 trailing digits
    expect(isValidEnrollmentNumber('0131CS2410000')).toBe(false); // 7 trailing digits
  });

  it('rejects extra leading/trailing characters and whitespace', () => {
    expect(isValidEnrollmentNumber(' 0131CS241000')).toBe(false);
    expect(isValidEnrollmentNumber('0131CS241000 ')).toBe(false);
    expect(isValidEnrollmentNumber('X0131CS241000')).toBe(false);
    expect(isValidEnrollmentNumber('0131CS241000X')).toBe(false);
  });

  it('rejects empty and non-pattern strings', () => {
    expect(isValidEnrollmentNumber('')).toBe(false);
    expect(isValidEnrollmentNumber('not-an-enrollment')).toBe(false);
  });
});

describe('upsertEntry', () => {
  const valid: RosterEntry = {
    enrollmentNumber: '0131CS241000',
    email: 'aarav.mehta@example.com',
    name: 'Aarav Mehta',
  };

  it('accepts a conforming entry and stores it', () => {
    const store = new Map<string, RosterEntry>();
    const result = upsertEntry(store, valid);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual(valid);
    }
    expect(store.size).toBe(1);
    expect(store.get('aarav.mehta@example.com')).toEqual(valid);
  });

  it('rejects a non-conforming entry with an English validation message and leaves the store unchanged', () => {
    const store = new Map<string, RosterEntry>();
    const result = upsertEntry(store, { ...valid, enrollmentNumber: 'BADVALUE' });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe(ENROLLMENT_NUMBER_INVALID_CODE);
      expect(result.error.field).toBe('enrollmentNumber');
      expect(result.error.message).toBe(messages.validation.enrollmentNumberInvalid);
    }
    expect(store.size).toBe(0);
  });

  it('upserts by email (case-insensitive) without creating duplicates', () => {
    const store = new Map<string, RosterEntry>();
    upsertEntry(store, valid);
    const updated = upsertEntry(store, {
      enrollmentNumber: '0131CS241001',
      email: 'AARAV.MEHTA@EXAMPLE.COM',
      name: 'Aarav M.',
    });

    expect(isOk(updated)).toBe(true);
    expect(store.size).toBe(1);
    expect(store.get('aarav.mehta@example.com')?.enrollmentNumber).toBe('0131CS241001');
  });

  it('omits name when not provided', () => {
    const store = new Map<string, RosterEntry>();
    const result = upsertEntry(store, {
      enrollmentNumber: '0131CS241000',
      email: 'no.name@example.com',
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect('name' in result.value).toBe(false);
    }
  });
});

describe('createRosterService', () => {
  it('upserts a valid entry asynchronously', async () => {
    const service = createRosterService();
    const result = await service.upsertEntry({
      enrollmentNumber: '0131CS241000',
      email: 'student@example.com',
      name: 'Test Student',
    });

    expect(isOk(result)).toBe(true);
  });

  it('rejects an invalid entry asynchronously', async () => {
    const service = createRosterService();
    const result = await service.upsertEntry({
      enrollmentNumber: 'invalid',
      email: 'student@example.com',
    });

    expect(isErr(result)).toBe(true);
  });
});

describe('resolveQuizAccess', () => {
  const ENROLLMENT = '0131CS241000';
  const EMAIL = 'aarav.mehta@example.com';

  const quiz: QuizPayloadNoAnswers = {
    id: 'quiz-1',
    unitId: 'unit-1',
    timeLimitMinutes: 15,
    shareToken: 'tok-1',
    questions: [{ id: 'q1', text: 'What is HTTP?', options: ['A protocol', 'A language'] }],
  };

  const attempt: AttemptResult = { score: 1, totalMarks: 1 };

  function rosterWith(entry: RosterEntry): Map<string, RosterEntry> {
    const store = new Map<string, RosterEntry>();
    upsertEntry(store, entry);
    return store;
  }

  function baseContext(overrides: Partial<QuizAccessContext> = {}): QuizAccessContext {
    return {
      roster: rosterWith({ enrollmentNumber: ENROLLMENT, email: EMAIL, name: 'Aarav Mehta' }),
      email: EMAIL,
      providedEnrollment: ENROLLMENT,
      storedEnrollment: null,
      existingAttempt: null,
      quiz,
      ...overrides,
    };
  }

  it('grants access when the email is rostered and the provided enrollment matches (Req 2.5, 8.5)', () => {
    const access = resolveQuizAccess(baseContext());

    expect(access.status).toBe('granted');
    if (access.status === 'granted') {
      expect(access.quiz).toBe(quiz);
    }
  });

  it('grants access by matching the email case-insensitively', () => {
    const access = resolveQuizAccess(baseContext({ email: 'AARAV.MEHTA@EXAMPLE.COM' }));
    expect(access.status).toBe('granted');
  });

  it('denies a non-rostered email with not-registered (Req 2.6, 8.6)', () => {
    const access = resolveQuizAccess(baseContext({ email: 'stranger@example.com' }));

    expect(access.status).toBe('denied');
    if (access.status === 'denied') {
      expect(access.reason).toBe('not-registered');
    }
  });

  it('denies a rostered email when the provided enrollment does not match (Req 2.5)', () => {
    const access = resolveQuizAccess(baseContext({ providedEnrollment: '9999ZZ000000' }));

    expect(access.status).toBe('denied');
    if (access.status === 'denied') {
      expect(access.reason).toBe('not-registered');
    }
  });

  it('requires enrollment on first sign-in when none is provided or stored (Req 2.7)', () => {
    const access = resolveQuizAccess(
      baseContext({ providedEnrollment: null, storedEnrollment: null }),
    );
    expect(access.status).toBe('enrollment-required');
  });

  it('uses the stored enrollment and skips the prompt for a returning student (Req 2.8)', () => {
    const access = resolveQuizAccess(
      baseContext({ providedEnrollment: null, storedEnrollment: ENROLLMENT }),
    );
    expect(access.status).toBe('granted');
  });

  it('prefers the stored enrollment over a mismatched provided value for a returning student (Req 2.8)', () => {
    const access = resolveQuizAccess(
      baseContext({ providedEnrollment: 'whatever', storedEnrollment: ENROLLMENT }),
    );
    expect(access.status).toBe('granted');
  });

  it('denies a returning student whose stored enrollment no longer matches the roster', () => {
    const access = resolveQuizAccess(
      baseContext({ providedEnrollment: null, storedEnrollment: '9999ZZ000000' }),
    );

    expect(access.status).toBe('denied');
    if (access.status === 'denied') {
      expect(access.reason).toBe('not-registered');
    }
  });

  it('surfaces the already-attempted path with the existing result (Req 8.10)', () => {
    const access = resolveQuizAccess(baseContext({ existingAttempt: attempt }));

    expect(access.status).toBe('already-attempted');
    if (access.status === 'already-attempted') {
      expect(access.result).toBe(attempt);
    }
  });

  it('denies before reporting already-attempted when the email is not rostered', () => {
    const access = resolveQuizAccess(
      baseContext({ email: 'stranger@example.com', existingAttempt: attempt }),
    );
    expect(access.status).toBe('denied');
  });

  it('has an English not-registered message available for the denial path (Req 2.6, 8.6)', () => {
    expect(typeof messages.auth.notRegistered).toBe('string');
    expect(messages.auth.notRegistered.length).toBeGreaterThan(0);
  });
});
