/**
 * AI Quiz Generator (teacher). Flow:
 *   pick unit → choose #questions / difficulty / time limit / active window →
 *   Generate (server-side Gemini) → preview questions → Save.
 *
 * Units + topics come from the shared master syllabus (`syllabus_units` /
 * `syllabus_topics`) for the globally-selected subject. The AI key stays on the
 * server (Pages Function); this page only orchestrates and saves via quizAccess.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createQuizAccess, type QuizResultSection } from '@data/access/quizAccess';
import { supabase } from '@data/supabase';
import { generateQuizQuestions } from '@data/access/aiQuizClient';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { Button, Dialog } from '@presentation/components/ui';
import { LoaderCircle, CheckCircle2, Share2, Copy } from 'lucide-react';

import { formatSectionLabel } from '@presentation/format/sectionLabel';
import {
  loadUnitsForSubject,
  loadTopicNamesForUnit,
  type UnitOption,
} from '@presentation/loaders/unitOptions';
import type { GeneratedQuestion, QuizDifficulty } from '@domain/services/quizGenerationService';

const quizAccess = createQuizAccess(supabase);

const inputClass =
  'rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text ' +
  'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

/** Convert a datetime-local value to an ISO string, or null when empty. */
function toIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'preview'; questions: GeneratedQuestion[]; rejected: number }
  | { kind: 'saving'; questions: GeneratedQuestion[] }
  | { kind: 'saved'; shareLink: string; count: number; quizId: string; shareToken: string };

export default function AiQuizGeneratorPage() {
  const navigate = useNavigate();
  const { selectedSection, selectedSectionId, selectedSubject, selectedSubjectId } = useSelectedSection();

  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unitId, setUnitId] = useState('');
  const [title, setTitle] = useState('');
  const [numQuestions, setNumQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('mixed');
  const [timeLimit, setTimeLimit] = useState(15);
  const [activeFrom, setActiveFrom] = useState('');
  const [activeUntil, setActiveUntil] = useState('');

  const [multiSectionEnabled, setMultiSectionEnabled] = useState(false);
  const [teacherSections, setTeacherSections] = useState<QuizResultSection[]>([]);
  const [loadingTeacherSections, setLoadingTeacherSections] = useState(false);
  const [selectedSectionIds, setSelectedSectionIds] = useState<Set<string>>(new Set());

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Load the selected subject's master units.
  useEffect(() => {
    let active = true;
    setUnits([]);
    setUnitId('');
    void loadUnitsForSubject(selectedSubjectId)
      .then((u) => {
        if (active) {
          setUnits(u);
          setUnitId(u[0]?.id ?? '');
        }
      })
      .catch(() => {
        if (active) setUnits([]);
      });
    return () => {
      active = false;
    };
  }, [selectedSubjectId]);

  const selectedUnit = useMemo(() => units.find((u) => u.id === unitId) ?? null, [units, unitId]);

  async function handleGenerate() {
    if (!unitId || !selectedSubject) {
      setError('Select a subject and unit first.');
      return;
    }
    setError(null);
    setPhase({ kind: 'generating' });
    try {
      const topics = await loadTopicNamesForUnit(unitId);
      if (topics.length === 0) {
        setError('This unit has no topics to generate from.');
        setPhase({ kind: 'idle' });
        return;
      }
      const { questions, rejected } = await generateQuizQuestions({
        subjectName: selectedSubject.name,
        unitName: selectedUnit?.name ?? '',
        topics,
        numQuestions,
        difficulty,
      });
      setPhase({ kind: 'preview', questions, rejected });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed. Please try again.');
      setPhase({ kind: 'idle' });
    }
  }

  async function handleSave(questions: GeneratedQuestion[]) {
    setError(null);
    setPhase({ kind: 'saving', questions });
    try {
      // Safe UUID / token generator compatible with non-secure contexts
      const g = globalThis as { crypto?: { randomUUID?: () => string } };
      const shareToken = g.crypto?.randomUUID ? g.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const quizTitle =
        title.trim().length > 0 ? title.trim() : `${selectedUnit?.name ?? 'Quiz'} (AI)`;
      const quizId = await quizAccess.createQuizWithQuestions({
        unitId,
        title: quizTitle,
        sectionId: selectedSectionId,
        timeLimitMinutes: timeLimit,
        shareToken,
        activeFrom: toIso(activeFrom),
        activeUntil: toIso(activeUntil),
      }, questions.map((q) => ({
          text: q.text,
          options: q.options,
          correctIndex: q.correctIndex,
          marks: q.marks,
      })));
      if (multiSectionEnabled && selectedSectionIds.size > 0) {
        await quizAccess.setQuizTargetSections(quizId, Array.from(selectedSectionIds));
      }
      const shareLink = `${window.location.origin}/quiz/${shareToken}`;
      setPhase({ kind: 'saved', shareLink, count: questions.length, quizId, shareToken });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the quiz.');
      setPhase({ kind: 'preview', questions, rejected: 0 });
    }
  }

  function buildShareText(): string {
    if (phase.kind !== 'saved') return '';
    const sectionsText = multiSectionEnabled && selectedSectionIds.size > 0 
      ? teacherSections.filter(s => selectedSectionIds.has(s.id)).map(formatSectionLabel).join(', ')
      : selectedSection ? formatSectionLabel(selectedSection) : 'Class';

    const deadlineStr = activeUntil ? new Date(activeUntil).toLocaleString('en-IN', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    }) : 'No deadline';
    
    return `📝 ${sectionsText}
Subject: ${selectedSubject?.name ?? 'Quiz'}
Topic: ${title || `${selectedUnit?.name ?? 'Unit'} (AI)`}
Questions: ${phase.count} Qs
Active till: ${deadlineStr}

Attempt: ${phase.shareLink}`;
  }

  if (!selectedSubject) {
    return (
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-text">AI Quiz Generator</h2>
        <p className="mt-1 text-sm text-soft">Select a subject from the top bar to begin.</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="px-2 text-muted hidden sm:inline-flex" onClick={() => navigate(-1)}>
          ← Back
        </Button>
        <div>
          <h2 className="text-xl font-bold text-text">AI Quiz Generator</h2>
          <p className="mt-0.5 text-sm text-muted">{selectedSubject.name}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-status-red/10 px-4 py-2 text-sm font-medium text-status-red">
          {error}
        </p>
      )}

      {/* ---- Setup form ---- */}
      <section className="card grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-text col-span-2 md:col-span-2">
          Unit
          <select className={inputClass} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {units.length === 0 ? (
              <option value="">No units for this subject</option>
            ) : (
              units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))
            )}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-text col-span-2 md:col-span-2">
          Quiz title (optional)
          <input
            className={inputClass}
            placeholder={`${selectedUnit?.name ?? 'Quiz'} (AI)`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-text col-span-1">
          Number of questions
          <input
            type="number"
            min={1}
            max={20}
            className={inputClass}
            value={numQuestions}
            onChange={(e) => setNumQuestions(Number(e.target.value))}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-text col-span-1">
          Difficulty
          <select
            className={inputClass}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as QuizDifficulty)}
          >
            <option value="easy">Easy</option>
            <option value="hard">Hard</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-text col-span-1">
          Time limit (minutes)
          <input
            type="number"
            min={1}
            className={inputClass}
            value={timeLimit}
            onChange={(e) => setTimeLimit(Number(e.target.value))}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-text col-span-1">
          Active from
          <input
            type="datetime-local"
            className={inputClass}
            value={activeFrom}
            onChange={(e) => setActiveFrom(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-text col-span-1">
          Active until
          <input
            type="datetime-local"
            className={inputClass}
            value={activeUntil}
            onChange={(e) => setActiveUntil(e.target.value)}
          />
        </label>

        {/* Multi-section assignment */}
        <div className="col-span-2 md:col-span-3 flex flex-col gap-1">
          <label className="flex items-center gap-2 text-xs font-medium text-text cursor-pointer h-[34px]">
            <input
              type="checkbox"
              checked={multiSectionEnabled}
              onChange={(e) => {
                const enabled = e.target.checked;
                setMultiSectionEnabled(enabled);
                if (enabled && selectedSubjectId) {
                  setLoadingTeacherSections(true);
                  void quizAccess.listTeacherSectionsForSubject(selectedSubjectId).then((sections) => {
                    setTeacherSections(sections);
                    setSelectedSectionIds((prev) => {
                      if (prev.size > 0) return prev;
                      const current = selectedSectionId && sections.some((s) => s.id === selectedSectionId) ? selectedSectionId : null;
                      return current ? new Set([current]) : new Set();
                    });
                  }).catch(() => {
                    setTeacherSections([]);
                  }).finally(() => {
                    setLoadingTeacherSections(false);
                  });
                }
              }}
              className="rounded border-border text-accent focus:ring-accent/30"
            />
            Assign to multiple sections
          </label>
          {multiSectionEnabled && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-muted/30 p-2 max-h-24 overflow-y-auto">
              {loadingTeacherSections ? (
                <p className="text-xs text-muted">Loading your sections…</p>
              ) : teacherSections.length === 0 ? (
                <p className="text-[10px] text-muted">
                  No sections found. Quiz will use current section.
                </p>
              ) : (
                teacherSections.map((section) => (
                  <label key={section.id} className="flex items-center gap-2 text-xs text-text cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSectionIds.has(section.id)}
                      onChange={() => {
                        setSelectedSectionIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(section.id)) {
                            next.delete(section.id);
                          } else {
                            next.add(section.id);
                          }
                          return next;
                        });
                      }}
                      className="rounded border-border text-accent focus:ring-accent/30"
                    />
                    {formatSectionLabel(section)}
                  </label>
                ))
              )}
            </div>
          )}
        </div>

        <div className="col-span-2 md:col-span-4 mt-1">
          <Button
            variant="primary"
            disabled={units.length === 0 || phase.kind === 'generating'}
            loading={phase.kind === 'generating'}
            onClick={handleGenerate}
          >
            ✨ Generate with AI
          </Button>
        </div>
      </section>

      {/* ---- Generation / Save / Success / Preview Modal ---- */}
      <Dialog
        open={phase.kind === 'generating' || phase.kind === 'preview' || phase.kind === 'saving' || phase.kind === 'saved'}
        onOpenChange={(open) => { if (!open) setPhase({ kind: 'idle' }); }}
        title={phase.kind === 'saved' ? "Quiz Generated!" : phase.kind === 'preview' ? "Review Generated Quiz" : "Generating with AI..."}
      >
        <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
          {phase.kind === 'generating' || phase.kind === 'saving' ? (
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-accent/20 blur-xl animate-pulse" />
                <LoaderCircle className="h-12 w-12 text-accent animate-spin relative z-10" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text">
                  {phase.kind === 'generating' ? 'Crafting your quiz...' : 'Finalizing details...'}
                </h3>
                <p className="text-sm text-muted mt-1 max-w-sm">
                  Our AI is generating premium questions based on your syllabus. This might take a few seconds.
                </p>
              </div>
            </div>
          ) : phase.kind === 'preview' ? (
            <div className="w-full text-left px-2 flex flex-col h-full max-h-[70vh]">
              <PreviewSection
                questions={phase.questions}
                rejected={phase.rejected}
                onSave={handleSave}
                onRegenerate={handleGenerate}
              />
            </div>
          ) : phase.kind === 'saved' ? (
            <div className="flex flex-col items-center gap-5 w-full">
              <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              
              <div>
                <h3 className="text-xl font-bold text-text">Success!</h3>
                <p className="text-sm text-muted mt-1">
                  Successfully generated and saved {phase.count} questions.
                </p>
              </div>

              <div className="w-full flex flex-col gap-3 mt-2">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-muted border border-border">
                  <input 
                    readOnly 
                    className="flex-1 bg-transparent text-sm text-text outline-none px-2" 
                    value={phase.shareLink} 
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard?.writeText(buildShareText());
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className={copied ? "shrink-0 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400" : "shrink-0"}
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        Copied ✓
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1.5" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(buildShareText())}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 w-full items-center justify-center rounded-button px-4 text-sm font-medium bg-[#25D366] text-white hover:bg-[#128C7E] transition-colors shadow-sm"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share on WhatsApp
                </a>
              </div>

              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => navigate('/quizzes')}
              >
                Close
              </Button>
            </div>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}

/** Editable preview of the generated questions before saving. */
function PreviewSection({
  questions,
  rejected,
  onSave,
  onRegenerate,
}: {
  questions: GeneratedQuestion[];
  rejected: number;
  onSave: (questions: GeneratedQuestion[]) => void;
  onRegenerate: () => void;
}) {
  return (
    <section className="flex flex-col gap-4 h-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 bg-surface pb-1">
        <h3 className="text-base font-semibold text-text">
          Preview — {questions.length} questions
          {rejected > 0 && <span className="ml-2 text-xs text-muted">({rejected} discarded)</span>}
        </h3>
        <div className="flex gap-2 self-end sm:self-auto">
          <Button variant="secondary" onClick={onRegenerate}>
            Regenerate
          </Button>
          <Button variant="primary" onClick={() => onSave(questions)}>
            Save quiz
          </Button>
        </div>
      </div>

      <ol className="flex flex-col gap-3 overflow-y-auto pr-2 pb-2">
        {questions.map((q, i) => (
          <li key={i} className="card p-4">
            <p className="text-sm font-medium text-text">
              {i + 1}. {q.text}
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {q.options.map((opt, oi) => (
                <li
                  key={oi}
                  className={[
                    'rounded-md px-3 py-1.5 text-sm',
                    oi === q.correctIndex
                      ? 'bg-emerald-50 font-medium text-emerald-700'
                      : 'bg-surface-muted text-soft',
                  ].join(' ')}
                >
                  {String.fromCharCode(65 + oi)}. {opt}
                  {oi === q.correctIndex && ' ✓'}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

