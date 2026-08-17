/**
 * Unit tests for the RPC-backed, correctness-critical paths of
 * `createQuizAccess` (`quizAccess.ts`), driven by a mocked Supabase client.
 *
 * The student-facing operations delegate to `SECURITY DEFINER` DB functions via
 * `.rpc(...)` — the answer key never reaches the client and grading happens
 * server-side — so the wrapper's job is narrow but important: pass the right
 * RPC name + params, unwrap the response (throwing a {@link DataAccessError} on
 * a Postgrest error), and parse the untrusted JSON into a typed outcome. These
 * tests exercise exactly that with controlled `{ data, error }` presets, plus
 * the query-builder-backed `listQuizzes` mapping.
 */
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createQuizAccess } from './quizAccess';
import { DataAccessError } from './support';

interface FakeResponse {
  readonly data: unknown;
  readonly error: { message: string; code: string } | null;
}

/**
 * A chainable, awaitable stand-in for the Supabase query builder. Every builder
 * method (`select`, `order`, `eq`, ...) returns the same object, and the object
 * is a thenable that resolves to the preset response — so any real call chain
 * like `.from('quizzes').select(...).order(...)` awaits to `response`.
 */
function makeThenableChain(response: FakeResponse) {
  const chain: Record<string, unknown> = {};
  const builderMethods = [
    'select',
    'eq',
    'order',
    'in',
    'single',
    'maybeSingle',
    'insert',
    'delete',
    'upsert',
    'limit',
  ];
  for (const method of builderMethods) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (value: FakeResponse) => unknown, reject: (reason?: unknown) => unknown) =>
    Promise.resolve(response).then(resolve, reject);
  return chain;
}

/**
 * Build a mock Supabase client. `rpcResponse` is what any `.rpc(...)` resolves
 * to; `fromResponse` is what any query-builder chain resolves to. Both `rpc`
 * and `from` are `vi.fn` spies so the call name/params can be asserted.
 */
function createMockClient(options: { rpcResponse?: FakeResponse; fromResponse?: FakeResponse }) {
  const rpc = vi.fn(async () => options.rpcResponse ?? { data: null, error: null });
  const from = vi.fn(() => makeThenableChain(options.fromResponse ?? { data: [], error: null }));
  const client = { rpc, from } as unknown as SupabaseClient;
  return { client, rpc, from };
}

describe('createQuizAccess.submitAttempt', () => {
  it("calls submit_attempt with the quiz id + answers and parses a 'recorded' outcome", async () => {
    const { client, rpc } = createMockClient({
      rpcResponse: { data: { status: 'recorded', result: { score: 2, totalMarks: 4 } }, error: null },
    });

    const outcome = await createQuizAccess(client).submitAttempt(
      'quiz-1',
      { q1: 0, q2: 1 },
      'student@example.com',
    );

    expect(outcome).toEqual({ status: 'recorded', result: { score: 2, totalMarks: 4 } });
    // The email is intentionally NOT forwarded (server reads the session), only
    // the quiz id and answers are sent to the SECURITY DEFINER function.
    expect(rpc).toHaveBeenCalledWith('submit_attempt', {
      p_quiz_id: 'quiz-1',
      p_answers: { q1: 0, q2: 1 },
    });
  });
});

describe('createQuizAccess.resolveAccess', () => {
  it('calls request_quiz_access and parses a granted decision (answer-free quiz)', async () => {
    const { client, rpc } = createMockClient({
      rpcResponse: {
        data: {
          status: 'granted',
          quiz: {
            id: 'quiz-1',
            unitId: 'unit-1',
            timeLimitMinutes: 15,
            questions: [{ id: 'q1', text: 'What is HTTP?', options: ['A protocol', 'A language'] }],
          },
        },
        error: null,
      },
    });

    const access = await createQuizAccess(client).resolveAccess('quiz-1', 'EN123', 'student@example.com');

    expect(access.status).toBe('granted');
    if (access.status === 'granted') {
      expect(access.quiz.id).toBe('quiz-1');
      expect(access.quiz.questions).toHaveLength(1);
      // Never exposes the answer key to the client.
      expect(JSON.stringify(access.quiz)).not.toContain('correctIndex');
    }
    expect(rpc).toHaveBeenCalledWith('request_quiz_access', {
      p_quiz_id: 'quiz-1',
      p_provided_enrollment: 'EN123',
    });
  });

  it('parses a denied decision, preserving the specific reason', async () => {
    const { client } = createMockClient({
      rpcResponse: { data: { status: 'denied', reason: 'wrong-section' }, error: null },
    });

    const access = await createQuizAccess(client).resolveAccess('quiz-1', null);

    expect(access).toEqual({ status: 'denied', reason: 'wrong-section' });
  });

  it('surfaces a Postgrest error as a thrown DataAccessError (message + code)', async () => {
    const { client } = createMockClient({
      rpcResponse: {
        data: null,
        error: { message: 'permission denied for function request_quiz_access', code: '42501' },
      },
    });

    let caught: unknown;
    try {
      await createQuizAccess(client).resolveAccess('quiz-1', null);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DataAccessError);
    expect((caught as DataAccessError).message).toBe(
      'permission denied for function request_quiz_access',
    );
    expect((caught as DataAccessError).code).toBe('42501');
  });
});

describe('createQuizAccess.listQuizzes', () => {
  it('maps a quizzes row into a SavedQuizSummary via toSavedQuiz', async () => {
    const row = {
      id: 'quiz-1',
      title: 'Intro Quiz',
      unit_id: 'unit-1',
      section_id: 'sec-1',
      time_limit_minutes: 20,
      share_token: 'tok-1',
      active_from: null,
      active_until: null,
      show_answers_after_close: true,
      shuffle_questions: false,
      created_at: '2026-01-01T00:00:00.000Z',
      syllabus_units: { id: 'unit-1', name: 'Basics', unit_no: 2 },
      questions: [
        { id: 'q1', marks: 3 },
        { id: 'q2', marks: 2 },
      ],
      quiz_attempts: [
        { id: 'a1', score: 4 },
        { id: 'a2', score: 6 },
      ],
      sections: { id: 'sec-1', name: 'CSE-A', batch: '2024', semester: '5', department: 'CSE' },
      quiz_target_sections: [],
    };

    const { client, from } = createMockClient({ fromResponse: { data: [row], error: null } });

    const quizzes = await createQuizAccess(client).listQuizzes();

    expect(from).toHaveBeenCalledWith('quizzes');
    expect(quizzes).toHaveLength(1);
    expect(quizzes[0]).toEqual({
      id: 'quiz-1',
      title: 'Intro Quiz',
      unitId: 'unit-1',
      sectionId: 'sec-1',
      // unit_no present -> "Unit N: name"
      unitName: 'Unit 2: Basics',
      timeLimitMinutes: 20,
      shareToken: 'tok-1',
      activeFrom: null,
      activeUntil: null,
      showAnswersAfterClose: true,
      shuffleQuestions: false,
      questionCount: 2,
      responseCount: 2,
      // 3 + 2
      totalMarks: 5,
      // (4 + 6) / 2
      averageScore: 5,
      // no active_from/active_until bounds -> active
      status: 'active',
      // no quiz_target_sections -> legacy single-section fallback
      sections: [{ id: 'sec-1', name: 'CSE-A', batch: '2024', semester: '5', department: 'CSE' }],
    });
  });

  it('prefers explicit quiz_target_sections over the legacy single section', async () => {
    const row = {
      id: 'quiz-2',
      title: 'Targeted Quiz',
      unit_id: 'unit-1',
      section_id: 'sec-legacy',
      time_limit_minutes: null,
      share_token: 'tok-2',
      active_from: null,
      active_until: null,
      created_at: '2026-01-02T00:00:00.000Z',
      syllabus_units: null,
      questions: [],
      quiz_attempts: [],
      sections: { id: 'sec-legacy', name: 'Legacy', batch: null, semester: null, department: null },
      quiz_target_sections: [
        { sections: { id: 'sec-x', name: 'X', batch: null, semester: null, department: null } },
        { sections: { id: 'sec-y', name: 'Y', batch: null, semester: null, department: null } },
      ],
    };

    const { client } = createMockClient({ fromResponse: { data: [row], error: null } });

    const quizzes = await createQuizAccess(client).listQuizzes();

    expect(quizzes[0].sections.map((section) => section.id)).toEqual(['sec-x', 'sec-y']);
    // No attempts -> null average; missing time limit -> default 15.
    expect(quizzes[0].averageScore).toBeNull();
    expect(quizzes[0].timeLimitMinutes).toBe(15);
  });
});
