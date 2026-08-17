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
  QuizResultSection,
  SavedQuizSummary,
  QuizQuestionStats,
  QuizAttemptDetail,
  QuizRosterOption,
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
import { Dialog } from '@presentation/components/ui/overlays';

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
  | 'createQuiz'
  | 'addQuestion'
  | 'listQuizzes'
  | 'listQuizResults'
  | 'deleteQuiz'
  | 'resetAttempt'
  | 'listQuizNonAttempters'
  | 'getQuizQuestionStats'
  | 'getQuizAttemptDetail'
  | 'getQuizReview'
  | 'listTeacherSectionsForSubject'
  | 'setQuizTargetSections'
  | 'updateQuizWithQuestions'
  | 'listQuizQuestions'
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
  timeLimit: number,
  questions: QuestionDraft[],
): { ok: true; questions: QuestionInput[] } | { ok: false; error: string } {
  if (unitId === '') return { ok: false, error: 'Select the unit this quiz is linked to.' };
  if (!Number.isFinite(timeLimit) || timeLimit <= 0) {
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

type ConfirmDialogState = {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmLabel?: string;
  isDestructive?: boolean;
};

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
  const [multiSectionEnabled, setMultiSectionEnabled] = useState(false);
  const [teacherSections, setTeacherSections] = useState<QuizResultSection[]>([]);
  const [loadingTeacherSections, setLoadingTeacherSections] = useState(false);
  const [selectedSectionIds, setSelectedSectionIds] = useState<Set<string>>(new Set());
  const [questions, setQuestions] = useState<QuestionDraft[]>(() => [emptyQuestion()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** When editing an existing quiz (no submissions), holds its id. null = creating new. */
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);

  // Saved quizzes (subject-scoped).
  const [savedQuizzes, setSavedQuizzes] = useState<SavedQuizSummary[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [quizzesError, setQuizzesError] = useState<string | null>(null);

  // Per-quiz results dialog state.
  const [resultsQuiz, setResultsQuiz] = useState<SavedQuizSummary | null>(null);
  const [resultsActiveTab, setResultsActiveTab] = useState<'submitted' | 'pending' | 'insights'>('submitted');
  const [resultsSectionFilter, setResultsSectionFilter] = useState<string | null>(null);
  const [resultsByQuiz, setResultsByQuiz] = useState<Record<string, QuizResultRow[]>>({});
  const [nonAttemptersByQuiz, setNonAttemptersByQuiz] = useState<Record<string, QuizRosterOption[]>>({});
  const [statsByQuiz, setStatsByQuiz] = useState<Record<string, QuizQuestionStats[]>>({});
  const [detailByStudent, setDetailByStudent] = useState<Record<string, QuizAttemptDetail | null>>({});
  const [detailViewStudentId, setDetailViewStudentId] = useState<string | null>(null);
  const [resultsSortOrder, setResultsSortOrder] = useState<'score' | 'name'>('score');
  const [loadingResults, setLoadingResults] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [copiedQuizId, setCopiedQuizId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({ 
    open: false, title: '', description: '', onConfirm: () => {} 
  });

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
    setMultiSectionEnabled(false);
    setSelectedSectionIds(new Set());
    setQuestions([emptyQuestion()]);
    setEditingQuizId(null);
  };

  async function handleToggleMultiSection(enabled: boolean) {
    setMultiSectionEnabled(enabled);
    if (!enabled || (subjectId ?? '') === '') {
      return;
    }
    setLoadingTeacherSections(true);
    try {
      const sections = await quizAccess.listTeacherSectionsForSubject(subjectId as string);
      setTeacherSections(sections);
      setSelectedSectionIds((prev) => {
        if (prev.size > 0) {
          return prev;
        }
        const current = sectionId && sections.some((section) => section.id === sectionId) ? sectionId : null;
        return current ? new Set([current]) : new Set();
      });
    } catch {
      setTeacherSections([]);
    } finally {
      setLoadingTeacherSections(false);
    }
  }

  function toggleSelectedSection(id: string) {
    setSelectedSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

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
      if (editingQuizId) {
        // Update existing quiz (only allowed when no submissions exist)
        await quizAccess.updateQuizWithQuestions(editingQuizId, {
          unitId,
          title: quizTitle,
          timeLimitMinutes: timeLimit,
        }, validation.questions);
        if (multiSectionEnabled && selectedSectionIds.size > 0) {
          await quizAccess.setQuizTargetSections(editingQuizId, Array.from(selectedSectionIds));
        }
      } else {
        // Create new quiz
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
        if (multiSectionEnabled && selectedSectionIds.size > 0) {
          await quizAccess.setQuizTargetSections(quizId, Array.from(selectedSectionIds));
        }
      }
      resetForm();
      setShowForm(false);
      setNotice('Quiz published successfully ✓');
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
    const defaultSection =
      sectionId && quiz.sections.some((section) => section.id === sectionId) ? sectionId : null;
    setResultsSectionFilter(defaultSection);
    await refreshResults(quiz.id);
  }

  async function refreshResults(quizId: string) {
    setLoadingResults(true);
    // Load the three panels INDEPENDENTLY (allSettled): a failure in one RPC
    // (e.g. non-attempters or question-stats) must NOT blank out the submitted
    // results list. Previously a single Promise.all rejection wiped all three.
    const [rowsRes, nonAttemptersRes, statsRes] = await Promise.allSettled([
      quizAccess.listQuizResults(quizId),
      quizAccess.listQuizNonAttempters(quizId),
      quizAccess.getQuizQuestionStats(quizId),
    ]);
    if (rowsRes.status === 'rejected') {
      console.error('[Results] listQuizResults failed:', rowsRes.reason);
    }
    if (nonAttemptersRes.status === 'rejected') {
      console.error('[Results] listQuizNonAttempters failed:', nonAttemptersRes.reason);
    }
    if (statsRes.status === 'rejected') {
      console.error('[Results] getQuizQuestionStats failed:', statsRes.reason);
    }
    setResultsByQuiz((prev) => ({ ...prev, [quizId]: rowsRes.status === 'fulfilled' ? rowsRes.value : [] }));
    setNonAttemptersByQuiz((prev) => ({ ...prev, [quizId]: nonAttemptersRes.status === 'fulfilled' ? nonAttemptersRes.value : [] }));
    setStatsByQuiz((prev) => ({ ...prev, [quizId]: statsRes.status === 'fulfilled' ? statsRes.value : [] }));
    setLoadingResults(false);
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

  async function handleCopyLink(quiz: SavedQuizSummary) {
    try {
      await navigator.clipboard?.writeText(buildShareLink(quiz.shareToken));
      setCopiedQuizId(quiz.id);
      setTimeout(() => {
        setCopiedQuizId((prev) => (prev === quiz.id ? null : prev));
      }, 2000);
    } catch {
      // fallback or handle error silently
    }
  }

  async function handleEditQuiz(quiz: SavedQuizSummary) {
    if (quiz.responseCount > 0) {
      return; // Cannot edit a quiz that has submissions
    }
    setBusyKey(`edit-${quiz.id}`);
    try {
      const loadedQuestions = await quizAccess.listQuizQuestions(quiz.id);
      setEditingQuizId(quiz.id);
      setUnitId(quiz.unitId);
      setTimeLimit(quiz.timeLimitMinutes);
      setShowAnswersAfterClose(quiz.showAnswersAfterClose);
      setShuffleQuestions(quiz.shuffleQuestions);
      setQuestions(
        loadedQuestions.length > 0
          ? loadedQuestions.map((q) => ({
              key: nextQuestionKey(),
              text: q.text,
              options: [...q.options],
              correctIndex: q.correctIndex,
              marks: q.marks ?? DEFAULT_QUESTION_MARKS,
            }))
          : [emptyQuestion()],
      );
      setShowForm(true);
      setNotice(null);
    } catch {
      setQuizzesError('Could not load quiz questions for editing.');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDeleteQuiz(quiz: SavedQuizSummary) {
    setConfirmDialog({
      open: true,
      title: `Delete "${quiz.unitName}"?`,
      description: 'The quiz, its questions, and all submissions will be deleted. This cannot be undone.',
      confirmLabel: 'Delete Quiz',
      isDestructive: true,
      onConfirm: async () => {
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
    });
  }

  async function handleRemoveAttempt(quizId: string, row: QuizResultRow) {
    setConfirmDialog({
      open: true,
      title: `Remove ${row.studentName}'s attempt?`,
      description: 'Only their attempt for this quiz will be removed, so they can retake it. Other subjects and quizzes remain unaffected.',
      confirmLabel: 'Remove Attempt',
      isDestructive: true,
      onConfirm: async () => {
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
    });
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
            Select a subject from the top bar — quizzes for that subject will appear here.
          </p>
        ) : savedQuizzes.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No quizzes for this subject yet. Create one using "New quiz" or "AI Generate".
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="block sm:table w-full text-left text-sm">
              <thead className="hidden sm:table-header-group">
                <tr className="border-b border-border bg-surface-muted/40">
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase text-muted whitespace-nowrap">Quiz</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase text-muted whitespace-nowrap">Section</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase text-muted whitespace-nowrap">Stats</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-muted whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="block sm:table-row-group p-3 sm:p-0">
                {savedQuizzes.map((quiz) => {
                  return (
                    <tr key={quiz.id} className="relative block sm:table-row align-top border-b border-border last:border-0 rounded-xl sm:rounded-none mb-3 sm:mb-0 bg-white dark:bg-transparent hover:bg-surface-muted/30 transition-colors">
                      <td className="block sm:table-cell px-4 py-3 sm:py-4 border-b border-border/50 sm:border-none relative">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-text pr-16 sm:pr-0 whitespace-normal line-clamp-2 max-w-[200px] lg:max-w-xs">{quiz.unitName}</p>
                          <Badge tone={STATUS_TONE[quiz.status]} size="sm" className="hidden sm:inline-flex shrink-0">
                            {STATUS_LABEL[quiz.status]}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                          {formatWindow(quiz.activeFrom, quiz.activeUntil)} · {quiz.timeLimitMinutes} min
                        </p>
                        <Badge tone={STATUS_TONE[quiz.status]} size="sm" className="absolute top-3 right-3 sm:hidden shrink-0">
                          {STATUS_LABEL[quiz.status]}
                        </Badge>
                      </td>
                      <td className="block sm:table-cell px-4 py-2 sm:py-4 text-xs text-muted">
                        <div className="flex justify-between sm:block items-center">
                          <span className="sm:hidden font-semibold text-text">Section</span>
                          {quiz.sections.length === 0 ? (
                            <span className="italic">All sections</span>
                          ) : (
                            quiz.sections.map((section) => section.name).join(', ')
                          )}
                        </div>
                      </td>
                      <td className="block sm:table-cell px-4 py-2 sm:py-4 text-xs text-muted">
                        <div className="flex justify-between sm:block items-center">
                          <span className="sm:hidden font-semibold text-text">Stats</span>
                          <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 text-left text-muted">
                            <span className="whitespace-nowrap"><strong className="text-text font-semibold">{quiz.questionCount}</strong> Qs</span>
                            <span className="whitespace-nowrap"><strong className="text-text font-semibold">{quiz.responseCount}</strong> Resp</span>
                          </div>
                        </div>
                      </td>
                      <td className="block sm:table-cell px-2 sm:px-3 py-3 sm:py-4 border-t border-border/20 sm:border-none sm:whitespace-nowrap">
                        <div className="flex items-center sm:justify-end flex-nowrap gap-1.5">
                          {quiz.responseCount === 0 && (
                            <Button size="sm" variant="ghost" loading={busyKey === `edit-${quiz.id}`} onClick={() => void handleEditQuiz(quiz)}>
                              Edit
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => void handleCopyLink(quiz)}
                            className={copiedQuizId === quiz.id ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400" : ""}
                          >
                            {copiedQuizId === quiz.id ? 'Copied ✓' : 'Copy'}
                          </Button>
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
            {editingQuizId ? 'Edit quiz' : 'New quiz'}{subjectName ? ` · ${subjectName}` : ''}{sectionName ? ` · ${sectionName}` : ''}
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
                  <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                    <input
                      type="checkbox"
                      checked={multiSectionEnabled}
                      onChange={(e) => void handleToggleMultiSection(e.target.checked)}
                      className="rounded border-border text-accent focus:ring-accent/30"
                    />
                    Assign to multiple sections
                  </label>
                </div>
                {multiSectionEnabled && (
                  <div className="mt-2 flex flex-col gap-2 rounded-control border border-border bg-surface-muted/30 p-3">
                    {loadingTeacherSections ? (
                      <p className="text-xs text-muted">Loading your sections…</p>
                    ) : teacherSections.length === 0 ? (
                      <p className="text-xs text-muted">
                        No sections found for this subject — the quiz will fall back to the currently-selected section.
                      </p>
                    ) : (
                      teacherSections.map((section) => (
                        <label key={section.id} className="flex items-center gap-2 text-sm text-text cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedSectionIds.has(section.id)}
                            onChange={() => toggleSelectedSection(section.id)}
                            className="rounded border-border text-accent focus:ring-accent/30"
                          />
                          {formatSectionLabel(section)}
                        </label>
                      ))
                    )}
                  </div>
                )}
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

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingQuizId(null);
                  setNotice(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={isSaving}>
                {editingQuizId ? 'Save changes' : 'Publish quiz'}
              </Button>
            </div>
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
        maxWidth="4xl"
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
                      {(detailByStudent[`${resultsQuiz.id}-${detailViewStudentId}`]?.questions || []).map((q, idx) => (
                        <div key={q.questionId} className="space-y-2 rounded-control border border-border bg-surface p-4">
                          <div className="flex justify-between items-start gap-4">
                            <p className="font-medium text-text">{idx + 1}. {q.text}</p>
                            <span className="shrink-0 text-xs font-bold text-muted">{q.marks} {q.marks === 1 ? 'mark' : 'marks'}</span>
                          </div>
                          <div className="space-y-1.5 pt-2">
                            {Array.isArray(q.options) ? q.options.map((opt, optIdx) => {
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
                            }) : <p className="text-sm text-status-red">Invalid options data</p>}
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
                      {resultsQuiz.sections.length > 1 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-muted">Section:</span>
                          <Button
                            size="sm"
                            variant={resultsSectionFilter === null ? 'secondary' : 'ghost'}
                            onClick={() => setResultsSectionFilter(null)}
                          >
                            All
                          </Button>
                          {resultsQuiz.sections.map((section) => (
                            <Button
                              key={section.id}
                              size="sm"
                              variant={resultsSectionFilter === section.id ? 'secondary' : 'ghost'}
                              onClick={() => setResultsSectionFilter(section.id)}
                            >
                              {section.name}
                            </Button>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant={resultsSortOrder === 'score' ? 'secondary' : 'ghost'} onClick={() => setResultsSortOrder('score')}>Sort by Score</Button>
                        <Button size="sm" variant={resultsSortOrder === 'name' ? 'secondary' : 'ghost'} onClick={() => setResultsSortOrder('name')}>Sort by Name</Button>
                      </div>
                      <div className="overflow-hidden rounded-control border border-border bg-surface">
                        <div className="overflow-x-auto">
                          <table className="block sm:table w-full text-left text-xs sm:whitespace-nowrap">
                            <thead className="hidden sm:table-header-group">
                              <tr className="border-b border-border bg-surface-muted/40">
                                <th className="px-3 py-2 font-bold uppercase text-muted">Student</th>
                                <th className="px-3 py-2 font-bold uppercase text-muted">Enrollment</th>
                                <th className="px-3 py-2 font-bold uppercase text-muted">Section</th>
                                <th className="px-3 py-2 font-bold uppercase text-muted">Score</th>
                                <th className="px-3 py-2 font-bold uppercase text-muted">Submitted</th>
                                <th className="px-3 py-2 text-right font-bold uppercase text-muted">Action</th>
                              </tr>
                            </thead>
                            <tbody className="block sm:table-row-group sm:divide-y divide-border p-2 sm:p-0">
                            {[...(resultsByQuiz[resultsQuiz.id] ?? [])]
                              .filter((r) =>
                                resultsQuiz.sections.length <= 1 ||
                                resultsSectionFilter === null ||
                                !r.section ||
                                r.section.id === resultsSectionFilter,
                              )
                              .sort((a, b) => {
                              if (resultsSortOrder === 'score') return b.score - a.score;
                              return a.studentName.localeCompare(b.studentName);
                            }).map((r) => (
                              <tr key={r.studentId} className="relative block sm:table-row hover:bg-surface-muted/30 cursor-pointer border border-border sm:border-none rounded-lg sm:rounded-none mb-2 sm:mb-0" onClick={() => void openAttemptDetail(resultsQuiz.id, r.studentId)}>
                                <td className="block sm:table-cell px-3 pt-3 pb-1 sm:py-2 font-medium text-text border-b border-border/50 sm:border-none">
                                  <div className="flex justify-between sm:block">
                                    <span className="truncate">{r.studentName}</span>
                                    <span className="sm:hidden font-mono text-muted text-[10px]">{r.enrollmentNumber ?? '—'}</span>
                                  </div>
                                </td>
                                <td className="hidden sm:table-cell px-3 py-2 font-mono text-muted">{r.enrollmentNumber ?? '—'}</td>
                                <td className="block sm:table-cell px-3 py-1.5 sm:py-2 text-muted">
                                  <div className="flex justify-between sm:block items-center">
                                    <span className="sm:hidden font-semibold">Section</span>
                                    {r.section ? formatSectionLabel(r.section) : '—'}
                                  </div>
                                </td>
                                <td className="block sm:table-cell px-3 py-1.5 sm:py-2 font-black text-accent">
                                  <div className="flex justify-between sm:block items-center">
                                    <span className="sm:hidden font-semibold text-text">Score</span>
                                    {r.score} / {r.totalMarks}
                                  </div>
                                </td>
                                <td className="block sm:table-cell px-3 py-1.5 sm:py-2 text-muted">
                                  <div className="flex justify-between sm:block items-center">
                                    <span className="sm:hidden font-semibold">Submitted</span>
                                    {formatDateTime(r.submittedAt)}
                                  </div>
                                </td>
                                <td className="block sm:table-cell px-3 py-2 sm:text-right border-t border-border/20 sm:border-none">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      loading={busyKey === `att-${resultsQuiz.id}-${r.studentId}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleRemoveAttempt(resultsQuiz.id, r);
                                      }}
                                      className="!text-status-red hover:!bg-status-red/10 w-full sm:w-auto"
                                    >
                                      Remove Attempt
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
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
                        <div className="overflow-x-auto">
                          <table className="block sm:table w-full text-left text-xs sm:whitespace-nowrap">
                            <thead className="hidden sm:table-header-group">
                              <tr className="border-b border-border bg-surface-muted/40">
                                <th className="px-3 py-2 font-bold uppercase text-muted">Enrollment</th>
                                <th className="px-3 py-2 font-bold uppercase text-muted">Name</th>
                                <th className="px-3 py-2 font-bold uppercase text-muted">Section</th>
                              </tr>
                            </thead>
                            <tbody className="block sm:table-row-group sm:divide-y divide-border p-2 sm:p-0">
                              {(nonAttemptersByQuiz[resultsQuiz.id] ?? []).map((r) => (
                                <tr key={r.enrollmentNumber} className="block sm:table-row hover:bg-surface-muted/30 border border-border sm:border-none rounded-lg sm:rounded-none mb-2 sm:mb-0">
                                  <td className="block sm:table-cell px-3 pt-3 pb-1 sm:py-2 font-mono text-muted border-b border-border/50 sm:border-none">
                                    <div className="flex justify-between sm:block">
                                      <span className="sm:hidden font-medium text-text truncate">{r.name}</span>
                                      <span>{r.enrollmentNumber}</span>
                                    </div>
                                  </td>
                                  <td className="hidden sm:table-cell px-3 py-2 font-medium text-text">{r.name}</td>
                                  <td className="block sm:table-cell px-3 py-1.5 sm:py-2 text-muted">
                                    <div className="flex justify-between sm:block items-center">
                                      <span className="sm:hidden font-semibold">Section</span>
                                      {r.section ? typeof r.section === 'string' ? r.section : r.section.name : '—'}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
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
                          const accuracy = stat.totalAttempts > 0 ? (correctCount / stat.totalAttempts) * 100 : 0;
                          
                          return (
                            <div key={stat.questionId} className="space-y-3 rounded-control border border-border bg-surface p-4">
                              <div className="flex justify-between items-start gap-4">
                                <p className="font-medium text-text">{idx + 1}. {stat.text}</p>
                                <div className="text-right shrink-0">
                                  <span className={`text-xs font-bold ${accuracy >= 50 ? 'text-status-green' : 'text-status-red'}`}>
                                    {accuracy.toFixed(0)}% Accuracy
                                  </span>
                                  <p className="text-[10px] text-muted">{stat.totalAttempts} attempts</p>
                                </div>
                              </div>
                              <div className="space-y-1.5 pt-1">
                                {Array.isArray(stat.options) ? stat.options.map((opt, optIdx) => {
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
                                        <span className="font-medium">{opt} {isCorrect && <span className="text-xs uppercase tracking-wider text-status-green ml-1">(Correct)</span>}</span>
                                        <span className="text-muted tabular-nums shrink-0">{count} ({percent.toFixed(0)}%)</span>
                                      </div>
                                    </div>
                                  );
                                }) : <p className="text-sm text-status-red">Invalid options data</p>}
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
      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        title={confirmDialog.title}
        maxWidth="sm"
      >
        <div className="py-4 px-1 text-sm text-muted">
          {confirmDialog.description}
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="ghost" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>
            Cancel
          </Button>
          <Button 
            variant={confirmDialog.isDestructive ? 'danger' : 'primary'} 
            onClick={() => {
              setConfirmDialog(prev => ({ ...prev, open: false }));
              confirmDialog.onConfirm();
            }}
          >
            {confirmDialog.confirmLabel || 'Confirm'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
