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
  QuizQuestionStats,
  QuizAttemptDetail,
} from '@data/access/quizAccess';
import { messages } from '@domain/shared/messages';
import { formatSectionLabel } from '@presentation/format/sectionLabel';
import { buildQuizWhatsAppLink } from '@presentation/format/whatsappShare';
import {
  SectionHeader,
  Card,
  Button,
  Badge,
  Alert,
  SkeletonLoader,
  Dialog,
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

const aiGenerateButtonClass =
  "ai-cta-sheen relative isolate overflow-hidden border-emerald-200/70 !bg-[linear-gradient(135deg,rgb(6,78,59)_0%,rgb(13,116,106)_56%,rgb(202,138,4)_135%)] !text-white " +
  "shadow-[0_10px_26px_rgba(13,116,106,0.24)] ring-1 ring-white/35 transition-[transform,box-shadow,border-color,filter] duration-200 " +
  "before:pointer-events-none before:absolute before:inset-y-[-35%] before:-left-8 before:z-0 before:w-8 before:rotate-12 before:bg-white/35 before:blur-sm before:content-[''] " +
  'hover:-translate-y-0.5 hover:border-amber-200/80 hover:shadow-[0_16px_36px_rgba(13,116,106,0.32)] hover:saturate-110 focus-visible:ring-2 focus-visible:ring-amber-200/60 motion-reduce:hover:translate-y-0';

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
  const [showAnswersAfterClose, setShowAnswersAfterClose] = useState(false);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [questions, setQuestions] = useState<QuestionDraft[]>(() => [emptyQuestion()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Saved quizzes (subject-scoped).
  const [savedQuizzes, setSavedQuizzes] = useState<SavedQuizSummary[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [quizzesError, setQuizzesError] = useState<string | null>(null);

  // Per-quiz results dialog state.
  const [resultsQuiz, setResultsQuiz] = useState<SavedQuizSummary | null>(null);
  const [resultsActiveTab, setResultsActiveTab] = useState<'submitted' | 'pending' | 'insights'>('submitted');
  const [resultsByQuiz, setResultsByQuiz] = useState<Record<string, QuizResultRow[]>>({});
  const [nonAttemptersByQuiz, setNonAttemptersByQuiz] = useState<Record<string, QuizRosterOption[]>>({});
  const [statsByQuiz, setStatsByQuiz] = useState<Record<string, QuizQuestionStats[]>>({});
  const [detailByStudent, setDetailByStudent] = useState<Record<string, QuizAttemptDetail | null>>({});
  const [detailViewStudentId, setDetailViewStudentId] = useState<string | null>(null);
  const [resultsSortOrder, setResultsSortOrder] = useState<'score' | 'name'>('score');
  const [loadingResults, setLoadingResults] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const unitIds = useMemo(() => new Set(units.map((u) => u.id)), [units]);
  const selectedUnit = units.find((unit) => unit.id === unitId) ?? null;

  // Build ordering map based on unit index in subject's syllabus
  const unitOrder = useMemo(() => {
    const order: Record<string, number> = {};
    units.forEach((u, i) => {
      order[u.id] = i;
    });
    return order;
  }, [units]);

  const loadQuizzes = useCallback(async () => {
    setLoadingQuizzes(true);
    setQuizzesError(null);
    try {
      const all = await quizAccess.listQuizzes();
      // Scope to the currently-selected subject via its unit ids.
      const filtered = all.filter((q) => unitIds.has(q.unitId));
      // Sort unit-wise
      filtered.sort((a, b) => {
        const orderA = unitOrder[a.unitId] ?? 999;
        const orderB = unitOrder[b.unitId] ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return b.id.localeCompare(a.id); // fallback to ID descending
      });
      setSavedQuizzes(filtered);
    } catch {
      setQuizzesError(messages.error.generic);
    } finally {
      setLoadingQuizzes(false);
    }
  }, [quizAccess, unitIds, unitOrder]);

  useEffect(() => {
    void loadQuizzes();
  }, [loadQuizzes, subjectId]);

  const updateQuestion = useCallback((key: string, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  }, []);

  const resetForm = () => {
    setUnitId('');
    setTimeLimit(DEFAULT_TIME_LIMIT_MINUTES);
    setShowAnswersAfterClose(false);
    setShuffleQuestions(false);
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
        showAnswersAfterClose,
        shuffleQuestions,
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

  async function openResultsModal(quiz: SavedQuizSummary) {
    setResultsQuiz(quiz);
    setResultsActiveTab('submitted');
    await refreshResults(quiz.id);
  }

  async function refreshResults(quizId: string) {
    setLoadingResults(true);
    try {
      const [rows, nonAttempters, stats] = await Promise.all([
        quizAccess.listQuizResults(quizId),
        quizAccess.listQuizNonAttempters(quizId),
        quizAccess.getQuizQuestionStats(quizId),
      ]);
      setResultsByQuiz((prev) => ({ ...prev, [quizId]: rows }));
      setNonAttemptersByQuiz((prev) => ({ ...prev, [quizId]: nonAttempters }));
      setStatsByQuiz((prev) => ({ ...prev, [quizId]: stats }));
    } catch {
      setResultsByQuiz((prev) => ({ ...prev, [quizId]: [] }));
      setNonAttemptersByQuiz((prev) => ({ ...prev, [quizId]: [] }));
      setStatsByQuiz((prev) => ({ ...prev, [quizId]: [] }));
    } finally {
      setLoadingResults(false);
    }
  }

  async function openAttemptDetail(quizId: string, studentId: string) {
    setDetailViewStudentId(studentId);
    if (!detailByStudent[`${quizId}-${studentId}`]) {
      try {
        const detail = await quizAccess.getQuizAttemptDetail(quizId, studentId);
        setDetailByStudent((prev) => ({ ...prev, [`${quizId}-${studentId}`]: detail }));
      } catch {
        setDetailByStudent((prev) => ({ ...prev, [`${quizId}-${studentId}`]: null }));
      }
    }
  }

  function exportResultsCSV(quiz: SavedQuizSummary) {
    const rows = resultsByQuiz[quiz.id] ?? [];
    const nonAttempters = nonAttemptersByQuiz[quiz.id] ?? [];
    
    const lines = [];
    lines.push('Enrollment,Name,Section,Score,Total,Percent,Submitted At');
    
    for (const r of rows) {
      const section = r.section ? typeof r.section === 'string' ? r.section : r.section.name : '';
      const percent = r.totalMarks > 0 ? Math.round((r.score / r.totalMarks) * 100) : 0;
      lines.push(`${r.enrollmentNumber ?? ''},"${r.studentName}","${section}",${r.score},${r.totalMarks},${percent}%,"${formatDateTime(r.submittedAt)}"`);
    }
    
    if (nonAttempters.length > 0) {
      lines.push('');
      lines.push('Not Attempted');
      lines.push('Enrollment,Name,Section');
      for (const r of nonAttempters) {
        const section = r.section ? typeof r.section === 'string' ? r.section : r.section.name : '';
        lines.push(`${r.enrollmentNumber},"${r.name}","${section}"`);
      }
    }
    
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quiz_results_${quiz.unitName.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function copyPendingList(quiz: SavedQuizSummary) {
    const nonAttempters = nonAttemptersByQuiz[quiz.id] ?? [];
    if (nonAttempters.length === 0) return;

    const names = nonAttempters.map((n) => {
      const parts = n.name.split(' ');
      const firstName = parts[0];
      const code = n.enrollmentNumber ? n.enrollmentNumber.slice(-3) : '';
      return code ? `${code} ${firstName}` : firstName;
    }).join(', ');

    const link = buildShareLink(quiz.shareToken);
    const deadline = quiz.activeUntil ? formatDateTime(quiz.activeUntil) : 'no deadline';
    const text = `${subjectName ?? ''} — ${quiz.unitName} quiz pending: ${names}. Link: ${link}, closes ${deadline}.`;
    
    try {
      await navigator.clipboard?.writeText(text);
      setNotice('Pending list copied ✓');
    } catch {
      // ignore
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
      if (resultsQuiz?.id === quiz.id) setResultsQuiz(null);
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
            <Button variant="outline" className={aiGenerateButtonClass} onClick={() => onAiGenerate?.()}>
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
                  return (
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
                          <a
                            href={buildQuizWhatsAppLink(quiz, buildShareLink(quiz.shareToken))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center justify-center rounded-button px-3 text-xs font-medium bg-[#25D366] text-white hover:bg-[#128C7E] transition-colors"
                          >
                            Share on WhatsApp
                          </a>
                          <Button size="sm" variant="outline" onClick={() => void openResultsModal(quiz)}>
                            Results
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
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-muted">Quiz Settings</label>
                <div className="flex flex-col gap-2 mt-1">
                  <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showAnswersAfterClose}
                      onChange={(e) => setShowAnswersAfterClose(e.target.checked)}
                      className="rounded border-border text-accent focus:ring-accent/30"
                    />
                    Show answers after close
                  </label>
                  <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shuffleQuestions}
                      onChange={(e) => setShuffleQuestions(e.target.checked)}
                      className="rounded border-border text-accent focus:ring-accent/30"
                    />
                    Shuffle questions per student
                  </label>
                </div>
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
      {/* ── Results Detail Dialog Modal ── */}
      <Dialog
        open={resultsQuiz !== null}
        onOpenChange={(open) => {
          if (!open) setResultsQuiz(null);
        }}
        title={resultsQuiz ? `Results: ${resultsQuiz.unitName}` : 'Quiz Results'}
        description={resultsQuiz ? `Submissions log for ${resultsQuiz.title}` : undefined}
      >
        {resultsQuiz && (
          <div className="space-y-4">
            {detailViewStudentId ? (
              <div className="space-y-4">
                <Button size="sm" variant="ghost" onClick={() => setDetailViewStudentId(null)}>
                  &larr; Back to results
                </Button>
                {detailByStudent[`${resultsQuiz.id}-${detailViewStudentId}`] === undefined ? (
                  <p className="text-sm text-muted py-8 text-center">Loading attempt details…</p>
                ) : detailByStudent[`${resultsQuiz.id}-${detailViewStudentId}`] === null ? (
                  <p className="text-sm text-status-red py-8 text-center">Failed to load attempt.</p>
                ) : (
                  <div className="space-y-6">
                    <div className="flex justify-between items-baseline border-b border-border pb-4">
                      <div>
                        <h3 className="text-lg font-bold text-text">{detailByStudent[`${resultsQuiz.id}-${detailViewStudentId}`]?.studentName}</h3>
                        <p className="text-sm font-mono text-muted">{detailByStudent[`${resultsQuiz.id}-${detailViewStudentId}`]?.enrollmentNumber ?? 'No enrollment'}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-black text-accent">{detailByStudent[`${resultsQuiz.id}-${detailViewStudentId}`]?.score} <span className="text-base text-muted">/ {resultsQuiz.totalMarks}</span></div>
                        <p className="text-xs text-muted">Submitted: {formatDateTime(detailByStudent[`${resultsQuiz.id}-${detailViewStudentId}`]?.submittedAt ?? '')}</p>
                      </div>
                    </div>
                    <div className="space-y-6">
                      {detailByStudent[`${resultsQuiz.id}-${detailViewStudentId}`]?.questions.map((q, idx) => (
                        <div key={q.questionId} className="space-y-2 rounded-control border border-border bg-surface p-4">
                          <div className="flex justify-between items-start gap-4">
                            <p className="font-medium text-text">{idx + 1}. {q.text}</p>
                            <span className="shrink-0 text-xs font-bold text-muted">{q.marks} {q.marks === 1 ? 'mark' : 'marks'}</span>
                          </div>
                          <div className="space-y-1.5 pt-2">
                            {q.options.map((opt, optIdx) => {
                              const isCorrect = q.correctIndex === optIdx;
                              const isSelected = q.studentAnswerIndex === optIdx;
                              let ringClass = 'border-border bg-surface-muted/30';
                              if (isCorrect && isSelected) ringClass = 'border-status-green bg-status-green/10 text-status-green';
                              else if (isCorrect && !isSelected) ringClass = 'border-status-green/50 bg-status-green/5 text-status-green';
                              else if (!isCorrect && isSelected) ringClass = 'border-status-red bg-status-red/10 text-status-red';
                              
                              return (
                                <div key={optIdx} className={`flex items-center gap-2 rounded border px-3 py-2 text-sm ${ringClass}`}>
                                  <div className="flex h-4 w-4 items-center justify-center rounded-full border border-current">
                                    {isSelected && <div className="h-2 w-2 rounded-full bg-current" />}
                                  </div>
                                  <span className={isCorrect ? 'font-medium' : ''}>{opt}</span>
                                  {isCorrect && <span className="ml-auto text-xs font-bold uppercase tracking-wider">Correct</span>}
                                  {!isCorrect && isSelected && <span className="ml-auto text-xs font-bold uppercase tracking-wider">Incorrect</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <Button
                      variant={resultsActiveTab === 'submitted' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setResultsActiveTab('submitted')}
                    >
                      Submitted ({resultsByQuiz[resultsQuiz.id]?.length ?? 0})
                    </Button>
                    <Button
                      variant={resultsActiveTab === 'pending' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setResultsActiveTab('pending')}
                    >
                      Not attempted ({(nonAttemptersByQuiz[resultsQuiz.id] ?? []).length})
                    </Button>
                    <Button
                      variant={resultsActiveTab === 'insights' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setResultsActiveTab('insights')}
                    >
                      Insights
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => void refreshResults(resultsQuiz.id)} loading={loadingResults}>
                      Refresh
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => exportResultsCSV(resultsQuiz)}>
                      Export CSV
                    </Button>
                  </div>
                </div>
                {loadingResults && (!resultsByQuiz[resultsQuiz.id] || !nonAttemptersByQuiz[resultsQuiz.id]) ? (
                  <p className="text-sm text-muted py-8 text-center">Loading submissions…</p>
                ) : resultsActiveTab === 'submitted' ? (
                  (resultsByQuiz[resultsQuiz.id] ?? []).length === 0 ? (
                    <p className="text-sm text-muted py-8 text-center">{messages.emptyState.noQuizAttempts}</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant={resultsSortOrder === 'score' ? 'secondary' : 'ghost'} onClick={() => setResultsSortOrder('score')}>Sort by Score</Button>
                        <Button size="sm" variant={resultsSortOrder === 'name' ? 'secondary' : 'ghost'} onClick={() => setResultsSortOrder('name')}>Sort by Name</Button>
                      </div>
                      <div className="overflow-hidden rounded-control border border-border bg-surface">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-border bg-surface-muted/40">
                              <th className="px-3 py-2 font-bold uppercase text-muted">Student</th>
                              <th className="px-3 py-2 font-bold uppercase text-muted">Enrollment</th>
                              <th className="px-3 py-2 font-bold uppercase text-muted">Section</th>
                              <th className="px-3 py-2 font-bold uppercase text-muted">Score</th>
                              <th className="px-3 py-2 font-bold uppercase text-muted">Submitted</th>
                              <th className="px-3 py-2 text-right font-bold uppercase text-muted">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {[...(resultsByQuiz[resultsQuiz.id] ?? [])].sort((a, b) => {
                              if (resultsSortOrder === 'score') return b.score - a.score;
                              return a.studentName.localeCompare(b.studentName);
                            }).map((r) => (
                              <tr key={r.studentId} className="hover:bg-surface-muted/30 cursor-pointer" onClick={() => void openAttemptDetail(resultsQuiz.id, r.studentId)}>
                                <td className="px-3 py-2 font-medium text-text">{r.studentName}</td>
                                <td className="px-3 py-2 font-mono text-muted">{r.enrollmentNumber ?? '—'}</td>
                                <td className="px-3 py-2 text-muted">{r.section ? formatSectionLabel(r.section) : '—'}</td>
                                <td className="px-3 py-2 font-black text-accent">{r.score} / {r.totalMarks}</td>
                                <td className="px-3 py-2 text-muted">{formatDateTime(r.submittedAt)}</td>
                                <td className="px-3 py-2 text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      loading={busyKey === `att-${resultsQuiz.id}-${r.studentId}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleRemoveAttempt(resultsQuiz.id, r);
                                      }}
                                      className="text-status-red hover:bg-status-red/10"
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                ) : resultsActiveTab === 'pending' ? (
                  (nonAttemptersByQuiz[resultsQuiz.id] ?? []).length === 0 ? (
                    <p className="text-sm text-muted py-8 text-center">Everyone has attempted this quiz!</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => void copyPendingList(resultsQuiz)}>
                          Copy list for WhatsApp
                        </Button>
                      </div>
                      <div className="overflow-hidden rounded-control border border-border bg-surface">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-border bg-surface-muted/40">
                              <th className="px-3 py-2 font-bold uppercase text-muted">Enrollment</th>
                              <th className="px-3 py-2 font-bold uppercase text-muted">Name</th>
                              <th className="px-3 py-2 font-bold uppercase text-muted">Section</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {(nonAttemptersByQuiz[resultsQuiz.id] ?? []).map((r) => (
                              <tr key={r.enrollmentNumber} className="hover:bg-surface-muted/30">
                                <td className="px-3 py-2 font-mono text-muted">{r.enrollmentNumber}</td>
                                <td className="px-3 py-2 font-medium text-text">{r.name}</td>
                                <td className="px-3 py-2 text-muted">{r.section ? typeof r.section === 'string' ? r.section : r.section.name : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    {(statsByQuiz[resultsQuiz.id] ?? []).length === 0 ? (
                      <p className="text-sm text-muted py-8 text-center">No insights available.</p>
                    ) : (
                      <div className="space-y-4">
                        {(statsByQuiz[resultsQuiz.id] ?? []).map((stat, idx) => {
                          const correctCount = stat.pickCounts[stat.correctIndex] ?? 0;
                          const percentCorrect = stat.totalAttempts > 0 ? (correctCount / stat.totalAttempts) * 100 : 0;
                          const needsWarning = stat.totalAttempts > 0 && percentCorrect < 50;
                          
                          return (
                            <div key={stat.questionId} className={`space-y-3 rounded-control border p-4 ${needsWarning ? 'border-status-red/30 bg-status-red/5' : 'border-border bg-surface'}`}>
                              <div className="flex justify-between items-start gap-4">
                                <p className="font-medium text-text">{idx + 1}. {stat.text}</p>
                                <span className={`shrink-0 text-xs font-bold ${needsWarning ? 'text-status-red' : 'text-status-green'}`}>
                                  {percentCorrect.toFixed(0)}% correct
                                </span>
                              </div>
                              <div className="space-y-2">
                                {stat.options.map((opt, optIdx) => {
                                  const count = stat.pickCounts[optIdx] ?? 0;
                                  const percent = stat.totalAttempts > 0 ? (count / stat.totalAttempts) * 100 : 0;
                                  const isCorrect = stat.correctIndex === optIdx;
                                  
                                  return (
                                    <div key={optIdx} className="relative overflow-hidden rounded border border-border bg-surface-muted/30 px-3 py-2 text-sm">
                                      <div 
                                        className={`absolute inset-0 opacity-20 ${isCorrect ? 'bg-status-green' : 'bg-muted'}`} 
                                        style={{ width: `${percent}%` }}
                                      />
                                      <div className="relative flex justify-between gap-4">
                                        <span className={isCorrect ? 'font-medium' : ''}>
                                          {opt} {isCorrect && <span className="ml-1 text-xs font-bold uppercase text-status-green tracking-wider">(Correct)</span>}
                                        </span>
                                        <span className="shrink-0 font-mono text-muted">{count} ({percent.toFixed(0)}%)</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-end pt-2 border-t border-border mt-4">
                  <Button variant="secondary" onClick={() => setResultsQuiz(null)}>
                    Close
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
