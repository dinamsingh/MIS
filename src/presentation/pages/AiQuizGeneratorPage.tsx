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
import { createQuizAccess } from '@data/access/quizAccess';
import { supabase } from '@data/supabase';
import { generateQuizQuestions } from '@data/access/aiQuizClient';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import {
  loadUnitsForSubject,
  loadTopicNamesForUnit,
  type UnitOption,
} from '@presentation/loaders/unitOptions';
import type { GeneratedQuestion, QuizDifficulty } from '@domain/services/quizGenerationService';

const quizAccess = createQuizAccess(supabase);

const inputClass =
  'rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text ' +
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
  | { kind: 'saved'; shareLink: string; count: number };

export default function AiQuizGeneratorPage() {
  const { selectedSubject, selectedSubjectId } = useSelectedSection();

  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unitId, setUnitId] = useState('');
  const [title, setTitle] = useState('');
  const [numQuestions, setNumQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('mixed');
  const [timeLimit, setTimeLimit] = useState(15);
  const [activeFrom, setActiveFrom] = useState('');
  const [activeUntil, setActiveUntil] = useState('');

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);

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
      const shareToken = crypto.randomUUID();
      const quizTitle =
        title.trim().length > 0 ? title.trim() : `${selectedUnit?.name ?? 'Quiz'} (AI)`;
      const quizId = await quizAccess.createQuiz({
        unitId,
        title: quizTitle,
        timeLimitMinutes: timeLimit,
        shareToken,
        activeFrom: toIso(activeFrom),
        activeUntil: toIso(activeUntil),
      });
      for (const q of questions) {
        await quizAccess.addQuestion(quizId, {
          text: q.text,
          options: q.options,
          correctIndex: q.correctIndex,
          marks: q.marks,
        });
      }
      const shareLink = `${window.location.origin}/quiz/${shareToken}`;
      setPhase({ kind: 'saved', shareLink, count: questions.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the quiz.');
      setPhase({ kind: 'preview', questions, rejected: 0 });
    }
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
      <div>
        <h2 className="text-xl font-bold text-text">AI Quiz Generator</h2>
        <p className="mt-0.5 text-sm text-muted">{selectedSubject.name}</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-status-red/10 px-4 py-2 text-sm font-medium text-status-red">
          {error}
        </p>
      )}

      {/* ---- Setup form ---- */}
      <section className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-text sm:col-span-2">
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

        <label className="flex flex-col gap-1 text-sm font-medium text-text sm:col-span-2">
          Quiz title (optional)
          <input
            className={inputClass}
            placeholder={`${selectedUnit?.name ?? 'Quiz'} (AI)`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-text">
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

        <label className="flex flex-col gap-1 text-sm font-medium text-text">
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

        <label className="flex flex-col gap-1 text-sm font-medium text-text">
          Time limit (minutes)
          <input
            type="number"
            min={1}
            className={inputClass}
            value={timeLimit}
            onChange={(e) => setTimeLimit(Number(e.target.value))}
          />
        </label>

        <div className="hidden sm:block" />

        <label className="flex flex-col gap-1 text-sm font-medium text-text">
          Active from (optional)
          <input
            type="datetime-local"
            className={inputClass}
            value={activeFrom}
            onChange={(e) => setActiveFrom(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-text">
          Active until (optional)
          <input
            type="datetime-local"
            className={inputClass}
            value={activeUntil}
            onChange={(e) => setActiveUntil(e.target.value)}
          />
        </label>

        <div className="sm:col-span-2">
          <button
            type="button"
            className="btn-primary px-4 py-2 text-sm"
            disabled={phase.kind === 'generating' || units.length === 0}
            onClick={handleGenerate}
          >
            {phase.kind === 'generating' ? 'Generating…' : '✨ Generate with AI'}
          </button>
        </div>
      </section>

      {/* ---- Preview ---- */}
      {phase.kind === 'preview' && (
        <PreviewSection
          questions={phase.questions}
          rejected={phase.rejected}
          onSave={handleSave}
          onRegenerate={handleGenerate}
        />
      )}

      {phase.kind === 'saving' && (
        <p className="text-sm text-muted">Saving quiz…</p>
      )}

      {/* ---- Saved ---- */}
      {phase.kind === 'saved' && (
        <section className="card p-5">
          <h3 className="text-base font-semibold text-text">Quiz created ✓</h3>
          <p className="mt-1 text-sm text-soft">{phase.count} questions saved. Share this link with students:</p>
          <div className="mt-3 flex items-center gap-2">
            <input readOnly className={`${inputClass} flex-1`} value={phase.shareLink} />
            <button
              type="button"
              className="btn-secondary px-3 py-2 text-sm"
              onClick={() => void navigator.clipboard?.writeText(phase.shareLink)}
            >
              Copy
            </button>
          </div>
          <button
            type="button"
            className="btn-primary mt-4 px-4 py-2 text-sm"
            onClick={() => setPhase({ kind: 'idle' })}
          >
            Create another
          </button>
        </section>
      )}
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
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-text">
          Preview — {questions.length} questions
          {rejected > 0 && <span className="ml-2 text-xs text-muted">({rejected} discarded)</span>}
        </h3>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary px-3 py-2 text-sm" onClick={onRegenerate}>
            Regenerate
          </button>
          <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={() => onSave(questions)}>
            Save quiz
          </button>
        </div>
      </div>

      <ol className="flex flex-col gap-3">
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
