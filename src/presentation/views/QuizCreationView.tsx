/**
 * Teacher quiz creation view (task 21.1).
 *
 * The teacher-facing surface of the Quiz_Module. It composes a single screen
 * that lets the teacher author a multiple-choice quiz, publish it, and review
 * who has attempted it:
 *
 *  - **Author** an MCQ quiz linked to a syllabus unit. Every question carries
 *    its options, exactly one correct option, and a marks value defaulting to 1
 *    (Req 8.1). The quiz is linked to a specific unit and given a configurable
 *    time limit that defaults to 15 minutes (Req 8.2, 8.3).
 *  - **Publish** the quiz: on save a unique share token is generated and the
 *    resulting shareable link is shown for the teacher to distribute (Req 8.2).
 *  - **Review attempts**: once a quiz exists, the teacher can load the list of
 *    student attempts with their scores (Req 8.12).
 *
 * All persistence is delegated to an injected {@link QuizCreationDeps.quizAccess}
 * wrapper (the Supabase-backed `quizAccess` repository in production), so this
 * view performs no I/O of its own. Token generation and link building are also
 * injectable for deterministic testing.
 *
 * Grading, the answer key, and single-attempt enforcement live server-side
 * (`quizService` / the `submit_attempt` DB function); this view never sees or
 * needs them.
 *
 * _Requirements: 8.1, 8.2, 8.3, 8.12_
 */

import { useCallback, useState, type FormEvent } from 'react';
import type {
  AttemptSummary,
  QuestionInput,
  QuizAccessRepository,
} from '@data/access/quizAccess';
import { messages } from '@domain/shared/messages';

/** The default quiz time limit in minutes (Req 8.3). */
export const DEFAULT_TIME_LIMIT_MINUTES = 15;
/** The default marks awarded for a correct answer (Req 8.1). */
export const DEFAULT_QUESTION_MARKS = 1;
/** The number of option fields a fresh question starts with. */
const DEFAULT_OPTION_COUNT = 4;

/** A unit the quiz can be linked to (Req 8.2). */
export interface QuizUnitOption {
  readonly id: string;
  readonly name: string;
}

/** Operations this view needs from the quiz data-access wrapper. */
export type QuizCreationRepository = Pick<
  QuizAccessRepository,
  'createQuiz' | 'addQuestion' | 'listAttempts'
>;

export interface QuizCreationViewProps {
  /** Persists quizzes/questions and reads attempts (defaults to the Supabase wrapper). */
  quizAccess: QuizCreationRepository;
  /** The syllabus units a quiz may be linked to (Req 8.2). */
  units: ReadonlyArray<QuizUnitOption>;
  /** Generates a unique share token (defaults to a crypto-based generator). */
  generateShareToken?: () => string;
  /** Builds the shareable link shown after publishing from a share token. */
  buildShareLink?: (shareToken: string) => string;
}

/** Editable state for a single question in the form. */
interface QuestionDraft {
  readonly key: string;
  text: string;
  options: string[];
  correctIndex: number;
  marks: number;
}

/** Outcome of a successful publish, used to render the link + attempts panel. */
interface PublishedQuiz {
  readonly quizId: string;
  readonly title: string;
  readonly shareToken: string;
  readonly shareLink: string;
}

/** Default share-token generator, preferring the platform crypto UUID. */
function defaultGenerateShareToken(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) {
    return g.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Default link builder: an absolute `/quiz/{token}` URL when an origin exists. */
function defaultBuildShareLink(shareToken: string): string {
  const origin =
    typeof window !== 'undefined' && window.location ? window.location.origin : '';
  return `${origin}/quiz/${shareToken}`;
}

/** A monotonic key source so React list items stay stable across edits. */
let questionKeySeq = 0;
function nextQuestionKey(): string {
  questionKeySeq += 1;
  return `q-${questionKeySeq}`;
}

/** Build a fresh, empty question draft with the default marks and option count. */
function emptyQuestion(): QuestionDraft {
  return {
    key: nextQuestionKey(),
    text: '',
    options: Array.from({ length: DEFAULT_OPTION_COUNT }, () => ''),
    correctIndex: 0,
    marks: DEFAULT_QUESTION_MARKS,
  };
}

const inputClass =
  'w-full rounded-button border border-border bg-surface px-3 py-2 text-sm text-text ' +
  'placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

/**
 * Validate the draft into a persistable shape, returning either the cleaned
 * questions or the first English validation message to surface.
 */
function validateDraft(
  title: string,
  unitId: string,
  timeLimitMinutes: number,
  questions: QuestionDraft[],
): { ok: true; questions: QuestionInput[] } | { ok: false; error: string } {
  if (title.trim() === '') {
    return { ok: false, error: 'Enter a quiz title.' };
  }
  if (unitId === '') {
    return { ok: false, error: 'Select the unit this quiz is linked to.' };
  }
  if (!Number.isFinite(timeLimitMinutes) || timeLimitMinutes <= 0) {
    return { ok: false, error: 'Enter a time limit greater than zero minutes.' };
  }
  if (questions.length === 0) {
    return { ok: false, error: 'Add at least one question.' };
  }

  const cleaned: QuestionInput[] = [];
  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i];
    const position = i + 1;
    if (q.text.trim() === '') {
      return { ok: false, error: `Enter the text for question ${position}.` };
    }
    const options = q.options.map((o) => o.trim());
    const filled = options.filter((o) => o !== '');
    if (filled.length < 2) {
      return {
        ok: false,
        error: `Question ${position} needs at least two options.`,
      };
    }
    if (options.some((o) => o === '')) {
      return {
        ok: false,
        error: `Remove the empty option in question ${position} or fill it in.`,
      };
    }
    if (q.correctIndex < 0 || q.correctIndex >= options.length) {
      return {
        ok: false,
        error: `Select the correct option for question ${position}.`,
      };
    }
    if (!Number.isFinite(q.marks) || q.marks <= 0) {
      return {
        ok: false,
        error: `Enter marks greater than zero for question ${position}.`,
      };
    }
    cleaned.push({
      text: q.text.trim(),
      options,
      correctIndex: q.correctIndex,
      marks: q.marks,
    });
  }
  return { ok: true, questions: cleaned };
}

/** Teacher quiz authoring + attempts review. */
export default function QuizCreationView({
  quizAccess,
  units,
  generateShareToken = defaultGenerateShareToken,
  buildShareLink = defaultBuildShareLink,
}: QuizCreationViewProps) {
  const [title, setTitle] = useState('');
  const [unitId, setUnitId] = useState('');
  const [timeLimit, setTimeLimit] = useState<number>(DEFAULT_TIME_LIMIT_MINUTES);
  const [questions, setQuestions] = useState<QuestionDraft[]>(() => [emptyQuestion()]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [published, setPublished] = useState<PublishedQuiz | null>(null);

  // Attempts panel state for the published quiz (Req 8.12).
  const [attempts, setAttempts] = useState<AttemptSummary[] | null>(null);
  const [isLoadingAttempts, setIsLoadingAttempts] = useState(false);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);

  const updateQuestion = useCallback(
    (key: string, patch: Partial<QuestionDraft>) => {
      setQuestions((prev) =>
        prev.map((q) => (q.key === key ? { ...q, ...patch } : q)),
      );
    },
    [],
  );

  function addQuestion() {
    setQuestions((prev) => [...prev, emptyQuestion()]);
  }

  function removeQuestion(key: string) {
    setQuestions((prev) =>
      prev.length <= 1 ? prev : prev.filter((q) => q.key !== key),
    );
  }

  function addOption(key: string) {
    setQuestions((prev) =>
      prev.map((q) => (q.key === key ? { ...q, options: [...q.options, ''] } : q)),
    );
  }

  function removeOption(key: string, optionIndex: number) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.key !== key || q.options.length <= 2) {
          return q;
        }
        const options = q.options.filter((_, i) => i !== optionIndex);
        // Keep the correct-option pointer valid after removal.
        let correctIndex = q.correctIndex;
        if (optionIndex === q.correctIndex) {
          correctIndex = 0;
        } else if (optionIndex < q.correctIndex) {
          correctIndex -= 1;
        }
        return { ...q, options, correctIndex };
      }),
    );
  }

  function updateOption(key: string, optionIndex: number, value: string) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.key !== key) {
          return q;
        }
        const options = q.options.map((o, i) => (i === optionIndex ? value : o));
        return { ...q, options };
      }),
    );
  }

  function resetForm() {
    setTitle('');
    setUnitId('');
    setTimeLimit(DEFAULT_TIME_LIMIT_MINUTES);
    setQuestions([emptyQuestion()]);
  }

  async function loadAttempts(quizId: string) {
    setIsLoadingAttempts(true);
    setAttemptsError(null);
    try {
      const rows = await quizAccess.listAttempts(quizId);
      setAttempts(rows);
    } catch {
      setAttemptsError(messages.error.generic);
    } finally {
      setIsLoadingAttempts(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validation = validateDraft(title, unitId, timeLimit, questions);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setIsSaving(true);
    try {
      const shareToken = generateShareToken();
      const quizId = await quizAccess.createQuiz({
        unitId,
        title: title.trim(),
        timeLimitMinutes: timeLimit,
        shareToken,
      });
      // Persist each question against the created quiz (Req 8.1).
      for (const question of validation.questions) {
        await quizAccess.addQuestion(quizId, question);
      }
      const shareLink = buildShareLink(shareToken);
      setPublished({ quizId, title: title.trim(), shareToken, shareLink });
      setAttempts(null);
      setAttemptsError(null);
      resetForm();
    } catch {
      setError(messages.error.saveFailed);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ── Header ── */}
      <header className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text">Quizzes</h2>
          <p className="mt-1 text-sm text-muted">Create and share via link</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:from-purple-600 hover:to-indigo-600 transition-colors"
          onClick={() => {/* placeholder – AI Generate */}}
        >
          ✨ AI Generate
        </button>
      </header>

      {/* ── Published Quizzes Table ── */}
      {published !== null && (
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50 dark:bg-white/5">
                <th className="px-4 py-3 font-medium text-muted">Quiz name</th>
                <th className="px-4 py-3 font-medium text-muted">Q</th>
                <th className="px-4 py-3 font-medium text-muted">Responses</th>
                <th className="px-4 py-3 font-medium text-muted">Avg</th>
                <th className="px-4 py-3 font-medium text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Published quiz row */}
              <tr className="border-b border-border bg-white dark:bg-transparent">
                <td className="px-4 py-3 font-medium text-text">{published.title}</td>
                <td className="px-4 py-3 text-text">{questions.length}</td>
                <td className="px-4 py-3 text-text">{attempts?.length ?? '—'}</td>
                <td className="px-4 py-3 text-text">
                  {attempts && attempts.length > 0
                    ? (attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length).toFixed(1)
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-3">
                    <button
                      type="button"
                      className="text-xs font-medium text-accent hover:underline"
                      onClick={() => {
                        void navigator.clipboard?.writeText(published.shareLink);
                      }}
                    >
                      Copy link
                    </button>
                    <button
                      type="button"
                      className="text-xs font-medium text-accent hover:underline"
                      onClick={() => void loadAttempts(published.quizId)}
                      disabled={isLoadingAttempts}
                    >
                      {isLoadingAttempts ? 'Loading…' : 'Results'}
                    </button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Attempts detail (expanded below table) */}
          {attemptsError !== null && (
            <p role="alert" className="px-4 py-3 text-sm font-medium text-status-red">
              {attemptsError}
            </p>
          )}

          {attempts !== null && attempts.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted">{messages.emptyState.noQuizAttempts}</p>
          )}

          {attempts !== null && attempts.length > 0 && (
            <div className="border-t border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5">
                    <th className="px-4 py-2 font-medium text-muted">Student</th>
                    <th className="px-4 py-2 font-medium text-muted">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((attempt, idx) => (
                    <tr
                      key={attempt.studentId}
                      className={idx % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-gray-50 dark:bg-white/5'}
                    >
                      <td className="px-4 py-2 text-text">{attempt.studentId}</td>
                      <td className="px-4 py-2 text-text">{attempt.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Shareable link row */}
          <div className="flex items-center gap-3 border-t border-border px-4 py-3">
            <span className="text-xs font-medium text-muted">Share link:</span>
            <input
              readOnly
              aria-label="Shareable quiz link"
              value={published.shareLink}
              className="flex-1 rounded-md border border-border bg-gray-50 px-3 py-1.5 text-xs text-text dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent/30"
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        </section>
      )}

      {/* ── Quiz Creation Form Card ── */}
      <form
        className="rounded-xl border border-border bg-surface p-6 shadow-sm flex flex-col gap-6"
        onSubmit={handleSubmit}
        noValidate
      >
        <h3 className="text-base font-semibold text-text">New Quiz</h3>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="quiz-title" className="text-xs font-medium text-muted">
              Quiz title
            </label>
            <input
              id="quiz-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="Unit 1 — HTTP basics"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="quiz-unit" className="text-xs font-medium text-muted">
              Linked unit
            </label>
            <select
              id="quiz-unit"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className={inputClass}
            >
              <option value="">Select a unit</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="quiz-time-limit" className="text-xs font-medium text-muted">
              Time limit (min)
            </label>
            <input
              id="quiz-time-limit"
              type="number"
              min={1}
              value={timeLimit}
              onChange={(e) => setTimeLimit(e.target.valueAsNumber)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Questions */}
        <div className="flex flex-col gap-4">
          {questions.map((question, qIndex) => (
            <fieldset
              key={question.key}
              className="rounded-lg border border-border bg-gray-50/50 p-4 dark:bg-white/[0.02]"
            >
              <legend className="flex items-center gap-3 px-1 text-sm font-semibold text-text">
                <span>Q{qIndex + 1}</span>
                {questions.length > 1 && (
                  <button
                    type="button"
                    className="text-xs font-medium text-status-red hover:underline"
                    onClick={() => removeQuestion(question.key)}
                  >
                    Remove
                  </button>
                )}
              </legend>

              <div className="mt-3 flex flex-col gap-3">
                <input
                  type="text"
                  aria-label={`Question ${qIndex + 1} text`}
                  value={question.text}
                  onChange={(e) => updateQuestion(question.key, { text: e.target.value })}
                  className={inputClass}
                  placeholder="Question text"
                />

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted">
                    Options (select correct)
                  </span>
                  {question.options.map((option, oIndex) => (
                    <div key={oIndex} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${question.key}`}
                        aria-label={`Mark option ${oIndex + 1} of question ${qIndex + 1} correct`}
                        checked={question.correctIndex === oIndex}
                        onChange={() => updateQuestion(question.key, { correctIndex: oIndex })}
                        className="h-4 w-4 accent-accent"
                      />
                      <input
                        type="text"
                        aria-label={`Option ${oIndex + 1} of question ${qIndex + 1}`}
                        value={option}
                        onChange={(e) => updateOption(question.key, oIndex, e.target.value)}
                        className={inputClass}
                        placeholder={`Option ${oIndex + 1}`}
                      />
                      {question.options.length > 2 && (
                        <button
                          type="button"
                          aria-label={`Remove option ${oIndex + 1} of question ${qIndex + 1}`}
                          className="text-sm text-muted hover:text-status-red"
                          onClick={() => removeOption(question.key, oIndex)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="self-start text-xs font-medium text-accent hover:underline"
                    onClick={() => addOption(question.key)}
                  >
                    + Add option
                  </button>
                </div>

                <div className="flex w-28 flex-col gap-1">
                  <label
                    htmlFor={`marks-${question.key}`}
                    className="text-xs font-medium text-muted"
                  >
                    Marks
                  </label>
                  <input
                    id={`marks-${question.key}`}
                    type="number"
                    min={1}
                    value={question.marks}
                    onChange={(e) =>
                      updateQuestion(question.key, { marks: e.target.valueAsNumber })
                    }
                    className={inputClass}
                  />
                </div>
              </div>
            </fieldset>
          ))}

          <button
            type="button"
            className="self-start rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-accent hover:text-accent transition-colors"
            onClick={addQuestion}
          >
            + Add question
          </button>
        </div>

        {error !== null && (
          <p role="alert" className="text-sm font-medium text-status-red">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="self-start rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent/90 disabled:opacity-50 transition-colors"
          disabled={isSaving}
        >
          {isSaving ? 'Publishing…' : 'Publish quiz'}
        </button>
      </form>
    </div>
  );
}
