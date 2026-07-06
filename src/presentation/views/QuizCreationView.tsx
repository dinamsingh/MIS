/**
 * Teacher quiz surface (authoring + saved quizzes + submissions).
 *
 * Scoped to the globally-selected SUBJECT: it lists the saved quizzes for that
 * subject (persisted, so AI-generated quizzes appear too), lets the teacher
 * publish new ones, review who submitted each quiz (name, enrollment, section,
 * score, time), copy the share link, delete a quiz, and remove a single
 * student's attempt so they can re-attempt THAT quiz.
 *
 * Grading, the answer key, and single-attempt enforcement live server-side
 * (`submit_attempt` / `request_quiz_access`); this view never sees them. All
 * persistence is delegated to an injected {@link QuizCreationRepository} so the
 * view does no I/O of its own and stays unit-testable.
 *
 * _Requirements: 8.1, 8.2, 8.3, 8.12_
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  QuestionInput,
  QuizAccessRepository,
  QuizResultRow,
  SavedQuizSummary,
} from '@data/access/quizAccess';
import { messages } from '@domain/shared/messages';
import { formatSectionLabel } from '@presentation/format/sectionLabel';
import {
  SectionHeader,
  Card,
  Button,
  Badge,
  Alert,
  SkeletonLoader,
} from '@presentation/components/ui';

export const DEFAULT_TIME_LIMIT_MINUTES = 15;
export const DEFAULT_QUESTION_MARKS = 1;
const DEFAULT_OPTION_COUNT = 4;

/** A unit the quiz can be linked to. */
export interface QuizUnitOption {
  readonly id: string;
  readonly name: string;
}

/** Operations this view needs from the quiz data-access wrapper. */
export type QuizCreationRepository = Pick<
  QuizAccessRepository,
  'createQuiz' | 'addQuestion' | 'listQuizzes' | 'listQuizResults' | 'deleteQuiz' | 'resetAttempt'
>;

export interface QuizCreationViewProps {
  quizAccess: QuizCreationRepository;
  /** Units of the currently-selected subject (used to scope the saved list). */
  units: ReadonlyArray<QuizUnitOption>;
  /** The currently-selected subject id (reload trigger + scoping). */
  subjectId?: string | null;
  /** The currently-selected subject name (header display). */
  subjectName?: string | null;
  /** The currently-selected section id saved on new quizzes. */
  sectionId?: string | null;
  /** The currently-selected section name for display only. */
  sectionName?: string | null;
  generateShareToken?: () => string;
  buildShareLink?: (shareToken: string) => string;
  onAiGenerate?: () => void;
}

interface QuestionDraft {
  readonly key: string;
  text: string;
  options: string[];
  correctIndex: number;
  marks: number;
}

function defaultGenerateShareToken(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) {
    return g.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultBuildShareLink(shareToken: string): string {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  return `${origin}/quiz/${shareToken}`;
}

let questionKeySeq = 0;
function nextQuestionKey(): string {
  questionKeySeq += 1;
  return `q-${questionKeySeq}`;
}

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

const STATUS_TONE: Record<SavedQuizSummary['status'], 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  scheduled: 'warning',
  closed: 'neutral',
};
const STATUS_LABEL: Record<SavedQuizSummary['status'], string> = {
  active: 'Active',
  scheduled: 'Scheduled',
  closed: 'Closed',
};

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function formatWindow(from: string | null, until: string | null): string {
  if (!from && !until) return 'Always open';
  const f = from ? formatDateTime(from) : 'Now';
  const u = until ? formatDateTime(until) : 'No end';
  return `${f} → ${u}`;
}

function validateDraft(
  unitId: string,
  timeLimitMinutes: number,
  questions: QuestionDraft[],
): { ok: true; questions: QuestionInput[] } | { ok: false; error: string } {
  if (unitId === '') return { ok: false, error: 'Select the unit this quiz is linked to.' };
  if (!Number.isFinite(timeLimitMinutes) || timeLimitMinutes <= 0) {
    return { ok: false, error: 'Enter a time limit greater than zero minutes.' };
  }
  if (questions.length === 0) return { ok: false, error: 'Add at least one question.' };

  const cleaned: QuestionInput[] = [];
  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i];
    const position = i + 1;
    if (q.text.trim() === '') return { ok: false, error: `Enter the text for question ${position}.` };
    const options = q.options.map((o) => o.trim());
    const filled = options.filter((o) => o !== '');
    if (filled.length < 2) return { ok: false, error: `Question ${position} needs at least two options.` };
    if (options.some((o) => o === '')) {
      return { ok: false, error: `Remove the empty option in question ${position} or fill it in.` };
    }
    if (q.correctIndex < 0 || q.correctIndex >= options.length) {
      return { ok: false, error: `Select the correct option for question ${position}.` };
    }
    if (!Number.isFinite(q.marks) || q.marks <= 0) {
      return { ok: false, error: `Enter marks greater than zero for question ${position}.` };
    }
    cleaned.push({ text: q.text.trim(), options, correctIndex: q.correctIndex, marks: q.marks });
  }
  return { ok: true, questions: cleaned };
}

export default function QuizCreationView({
  quizAccess,
  units,
  subjectId,
  subjectName,
  sectionId,
  sectionName,
  generateShareToken = defaultGenerateShareToken,
  buildShareLink = defaultBuildShareLink,
  onAiGenerate,
}: QuizCreationViewProps) {
  // Authoring form state.
  const [unitId, setUnitId] = useState('');
  const [timeLimit, setTimeLimit] = useState<number>(DEFAULT_TIME_LIMIT_MINUTES);
  const [questions, setQuestions] = useState<QuestionDraft[]>(() => [emptyQuestion()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Saved quizzes (subject-scoped).
  const [savedQuizzes, setSavedQuizzes] = useState<SavedQuizSummary[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [quizzesError, setQuizzesError] = useState<string | null>(null);

  // Per-quiz results panel.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resultsByQuiz, setResultsByQuiz] = useState<Record<string, QuizResultRow[]>>({});
  const [loadingResults, setLoadingResults] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const unitIds = useMemo(() => new Set(units.map((u) => u.id)), [units]);
  const selectedUnit = units.find((unit) => unit.id === unitId) ?? null;

  const loadQuizzes = useCallback(async () => {
    setLoadingQuizzes(true);
    setQuizzesError(null);
    try {
      const all = await quizAccess.listQuizzes();
      // Scope to the currently-selected subject via its unit ids.
      setSavedQuizzes(all.filter((q) => unitIds.has(q.unitId)));
    } catch {
      setQuizzesError(messages.error.generic);
    } finally {
      setLoadingQuizzes(false);
    }
  }, [quizAccess, unitIds]);

  useEffect(() => {
    void loadQuizzes();
  }, [loadQuizzes, subjectId]);

  const updateQuestion = useCallback((key: string, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  }, []);

  const resetForm = () => {
    setUnitId('');
    setTimeLimit(DEFAULT_TIME_LIMIT_MINUTES);
    setQuestions([emptyQuestion()]);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const validation = validateDraft(unitId, timeLimit, questions);
    if (!validation.ok) {
      setFormError(validation.error);
      return;
    }
    const quizTitle = selectedUnit?.name ?? 'Unit quiz';
    setIsSaving(true);
    try {
      const shareToken = generateShareToken();
      const quizId = await quizAccess.createQuiz({
        unitId,
        title: quizTitle,
        sectionId: sectionId ?? null,
        timeLimitMinutes: timeLimit,
        shareToken,
      });
      for (const question of validation.questions) {
        await quizAccess.addQuestion(quizId, question);
      }
      resetForm();
      setShowForm(false);
      setNotice('Quiz publish ho gaya ✓');
      await loadQuizzes();
    } catch {
      setFormError(messages.error.saveFailed);
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleResults(quizId: string) {
    if (expandedId === quizId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(quizId);
    if (!resultsByQuiz[quizId]) {
      setLoadingResults(true);
      try {
        const rows = await quizAccess.listQuizResults(quizId);
        setResultsByQuiz((prev) => ({ ...prev, [quizId]: rows }));
      } catch {
        setResultsByQuiz((prev) => ({ ...prev, [quizId]: [] }));
      } finally {
        setLoadingResults(false);
      }
    }
  }

  async function handleCopyLink(shareToken: string) {
    try {
      await navigator.clipboard?.writeText(buildShareLink(shareToken));
      setNotice('Share link copy ho gaya ✓');
    } catch {
      setNotice(null);
    }
  }

  async function handleDeleteQuiz(quiz: SavedQuizSummary) {
    const ok = window.confirm(
      `Delete "${quiz.unitName}"?\n\nIska quiz, uske questions aur saare submissions delete ho jaayenge. Ye wapas nahi aayega.`,
    );
    if (!ok) return;
    setBusyKey(`del-${quiz.id}`);
    try {
      await quizAccess.deleteQuiz(quiz.id);
      if (expandedId === quiz.id) setExpandedId(null);
      await loadQuizzes();
    } catch {
      setQuizzesError(messages.error.generic);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRemoveAttempt(quizId: string, row: QuizResultRow) {
    const ok = window.confirm(
      `Remove ${row.studentName}'s attempt?\n\nSirf iss quiz ka unka attempt hatega, taaki wo dobara de sakein. Baaki subjects/quizzes pe koi asar nahi.`,
    );
    if (!ok) return;
    setBusyKey(`att-${quizId}-${row.studentId}`);
    try {
      await quizAccess.resetAttempt(quizId, row.studentId);
      const rows = await quizAccess.listQuizResults(quizId);
      setResultsByQuiz((prev) => ({ ...prev, [quizId]: rows }));
      await loadQuizzes();
    } catch {
      setQuizzesError(messages.error.generic);
    } finally {
      setBusyKey(null);
    }
  }

  const hasSubject = (subjectId ?? '') !== '' && units.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <SectionHeader
        eyebrow="Assessments"
        title="Quizzes"
        description={
          subjectName
            ? `Saved quizzes and submissions for ${subjectName}.`
            : 'Select a subject from the top bar to manage its quizzes.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => onAiGenerate?.()}>
              ✨ AI Generate
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setShowForm((v) => !v);
                setNotice(null);
              }}
              disabled={!hasSubject}
            >
              {showForm ? 'Close form' : 'New quiz'}
            </Button>
          </div>
        }
      />

      {notice && <Alert tone="success" title="Done">{notice}</Alert>}

      {/* ── Saved Quizzes ── */}
      <Card padded={false} className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-text">Saved quizzes</h3>
          <Badge tone="info" size="sm">{savedQuizzes.length} total</Badge>
        </div>

        {quizzesError && (
          <div className="px-5 py-3">
            <Alert tone="danger" title="Error">{quizzesError}</Alert>
          </div>
        )}

        {loadingQuizzes ? (
          <div className="space-y-3 p-5">
            <SkeletonLoader variant="block" className="h-10 w-full" />
            <SkeletonLoader variant="block" className="h-10 w-full" />
            <SkeletonLoader variant="block" className="h-10 w-full" />
          </div>
        ) : !hasSubject ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            Top bar se ek subject select karo — us subject ke quizzes yahan dikhenge.
          </p>
        ) : savedQuizzes.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            Is subject me abhi koi quiz nahi. "New quiz" ya "AI Generate" se banao.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted/40">
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase text-muted">Quiz</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase text-muted">Status</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase text-muted">Questions</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase text-muted">Responses</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase text-muted">Avg</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {savedQuizzes.map((quiz) => {
                  const isOpen = expandedId === quiz.id;
                  const results = resultsByQuiz[quiz.id] ?? [];
                  return (
                    <>
                      <tr key={quiz.id} className="align-top">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-text">{quiz.unitName}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {formatWindow(quiz.activeFrom, quiz.activeUntil)} · {quiz.timeLimitMinutes} min
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={STATUS_TONE[quiz.status]} size="sm">
                            {STATUS_LABEL[quiz.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-text">{quiz.questionCount}</td>
                        <td className="px-4 py-3 text-text">{quiz.responseCount}</td>
                        <td className="px-4 py-3 text-text">
                          {quiz.averageScore !== null
                            ? `${quiz.averageScore.toFixed(1)} / ${quiz.totalMarks}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => void handleCopyLink(quiz.shareToken)}>
                              Copy link
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void toggleResults(quiz.id)}>
                              {isOpen ? 'Hide' : 'Results'}
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              loading={busyKey === `del-${quiz.id}`}
                              onClick={() => void handleDeleteQuiz(quiz)}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${quiz.id}-results`}>
                          <td colSpan={6} className="bg-surface-muted/30 px-4 py-4">
                            {loadingResults && !resultsByQuiz[quiz.id] ? (
                              <p className="text-sm text-muted">Loading submissions…</p>
                            ) : results.length === 0 ? (
                              <p className="text-sm text-muted">{messages.emptyState.noQuizAttempts}</p>
                            ) : (
                              <div className="overflow-hidden rounded-control border border-border bg-surface">
                                <table className="w-full text-left text-sm">
                                  <thead>
                                    <tr className="border-b border-border bg-surface-muted/40">
                                      <th className="px-3 py-2 text-[11px] font-bold uppercase text-muted">Student</th>
                                      <th className="px-3 py-2 text-[11px] font-bold uppercase text-muted">Enrollment</th>
                                      <th className="px-3 py-2 text-[11px] font-bold uppercase text-muted">Section</th>
                                      <th className="px-3 py-2 text-[11px] font-bold uppercase text-muted">Score</th>
                                      <th className="px-3 py-2 text-[11px] font-bold uppercase text-muted">Submitted</th>
                                      <th className="px-3 py-2 text-right text-[11px] font-bold uppercase text-muted">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border">
                                    {results.map((r) => (
                                      <tr key={r.studentId}>
                                        <td className="px-3 py-2 font-medium text-text">{r.studentName}</td>
                                        <td className="px-3 py-2 font-mono text-xs text-muted">
                                          {r.enrollmentNumber ?? '—'}
                                        </td>
                                        <td className="px-3 py-2 text-muted">
                                          {r.section ? formatSectionLabel(r.section) : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-text">
                                          {r.score} / {r.totalMarks}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-muted">
                                          {formatDateTime(r.submittedAt)}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            loading={busyKey === `att-${quiz.id}-${r.studentId}`}
                                            onClick={() => void handleRemoveAttempt(quiz.id, r)}
                                          >
                                            Remove attempt
                                          </Button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Authoring form (toggled) ── */}
      {showForm && (
        <Card className="flex flex-col gap-6">
          <h3 className="text-base font-semibold text-text">
            New quiz{subjectName ? ` · ${subjectName}` : ''}{sectionName ? ` · ${sectionName}` : ''}
          </h3>

          <form className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="quiz-unit" className="text-xs font-medium text-muted">Linked unit</label>
                <select id="quiz-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)} className={inputClass}>
                  <option value="">Select a unit</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>{unit.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="quiz-time-limit" className="text-xs font-medium text-muted">Time limit (min)</label>
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

            <div className="flex flex-col gap-4">
              {questions.map((question, qIndex) => (
                <fieldset key={question.key} className="rounded-control border border-border bg-surface-muted/30 p-4">
                  <legend className="flex items-center gap-3 px-1 text-sm font-semibold text-text">
                    <span>Q{qIndex + 1}</span>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        className="text-xs font-medium text-status-red hover:underline"
                        onClick={() => setQuestions((prev) => prev.filter((q) => q.key !== question.key))}
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
                      <span className="text-xs font-medium text-muted">Options (select correct)</span>
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
                            onChange={(e) =>
                              updateQuestion(question.key, {
                                options: question.options.map((o, i) => (i === oIndex ? e.target.value : o)),
                              })
                            }
                            className={inputClass}
                            placeholder={`Option ${oIndex + 1}`}
                          />
                          {question.options.length > 2 && (
                            <button
                              type="button"
                              aria-label={`Remove option ${oIndex + 1} of question ${qIndex + 1}`}
                              className="text-sm text-muted hover:text-status-red"
                              onClick={() =>
                                updateQuestion(question.key, {
                                  options: question.options.filter((_, i) => i !== oIndex),
                                  correctIndex:
                                    oIndex === question.correctIndex
                                      ? 0
                                      : oIndex < question.correctIndex
                                        ? question.correctIndex - 1
                                        : question.correctIndex,
                                })
                              }
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        className="self-start text-xs font-medium text-accent hover:underline"
                        onClick={() =>
                          updateQuestion(question.key, { options: [...question.options, ''] })
                        }
                      >
                        + Add option
                      </button>
                    </div>

                    <div className="flex w-28 flex-col gap-1">
                      <label htmlFor={`marks-${question.key}`} className="text-xs font-medium text-muted">Marks</label>
                      <input
                        id={`marks-${question.key}`}
                        type="number"
                        min={1}
                        value={question.marks}
                        onChange={(e) => updateQuestion(question.key, { marks: e.target.valueAsNumber })}
                        className={inputClass}
                      />
                    </div>
                  </div>
                </fieldset>
              ))}

              <button
                type="button"
                className="self-start rounded-control border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
                onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}
              >
                + Add question
              </button>
            </div>

            {formError && (
              <p role="alert" className="text-sm font-medium text-status-red">{formError}</p>
            )}

            <Button type="submit" variant="primary" loading={isSaving} className="self-start">
              Publish quiz
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
