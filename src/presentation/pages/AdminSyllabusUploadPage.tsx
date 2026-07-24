/**
 * Admin Syllabus Upload page — upload a semester's official syllabus PDF,
 * let AI propose a structured subject/unit/topic breakdown, review/edit that
 * proposal, then save it.
 *
 * Flow: pick semester → upload PDF → extract text client-side (pdfjs-dist) →
 * send text to /api/parse-syllabus-pdf (admin-auth-gated, calls Gemini) →
 * render an editable review list → admin corrects anything wrong → Save
 * calls the `save_syllabus_structure` RPC, which upserts syllabus_subjects
 * and replaces each subject's syllabus_units/syllabus_topics.
 *
 * The AI step is a draft proposal only — nothing is written to the database
 * until the admin explicitly reviews and clicks Save, since PDF extraction +
 * AI structuring can both introduce mistakes.
 */

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@data/supabase';
import { extractTextFromPdf } from '@presentation/loaders/pdfTextExtraction';
import type { ExtractedSubject, ExtractedUnit } from '@domain/services/syllabusParsingService';
import { Card, CardContent, CardHeader, CardTitle, SectionHeader, Button } from '@presentation/components/ui/foundation';
import { LoadingSpinner } from '@presentation/components/ui/data-display';

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

type Phase =
  | { kind: 'idle' }
  | { kind: 'extracting-text' }
  | { kind: 'analyzing' }
  | { kind: 'review'; subjects: ExtractedSubject[]; rejected: number }
  | { kind: 'saving'; subjects: ExtractedSubject[] }
  | { kind: 'saved'; subjectsSaved: number; unitsSaved: number; topicsSaved: number }
  | { kind: 'error'; message: string };

/** Ask the auth-gated Function to extract a structured syllabus from PDF text. */
async function requestExtraction(semester: number, pdfText: string): Promise<{ subjects: ExtractedSubject[]; rejected: number }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('You must be signed in to extract a syllabus.');
  }

  const response = await fetch('/api/parse-syllabus-pdf', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ semester, pdfText }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    subjects?: ExtractedSubject[];
    rejected?: number;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? 'Syllabus extraction failed. Please try again.');
  }

  return { subjects: body.subjects ?? [], rejected: body.rejected ?? 0 };
}

export default function AdminSyllabusUploadPage() {
  const [semester, setSemester] = useState<number>(5);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setPhase({ kind: 'extracting-text' });
      try {
        const pdfText = await extractTextFromPdf(file);
        if (pdfText.trim().length === 0) {
          setPhase({ kind: 'error', message: 'No text could be read from this PDF. It may be a scanned image without selectable text.' });
          return;
        }
        setPhase({ kind: 'analyzing' });
        const { subjects, rejected } = await requestExtraction(semester, pdfText);
        setPhase({ kind: 'review', subjects, rejected });
      } catch (e) {
        setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Something went wrong reading this PDF.' });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [semester],
  );

  const updateSubject = (index: number, next: ExtractedSubject) => {
    if (phase.kind !== 'review') return;
    const subjects = [...phase.subjects];
    subjects[index] = next;
    setPhase({ ...phase, subjects });
  };

  const removeSubject = (index: number) => {
    if (phase.kind !== 'review') return;
    setPhase({ ...phase, subjects: phase.subjects.filter((_, i) => i !== index) });
  };

  const removeUnit = (subjectIndex: number, unitIndex: number) => {
    if (phase.kind !== 'review') return;
    const subject = phase.subjects[subjectIndex];
    const units = subject.units.filter((_, i) => i !== unitIndex);
    updateSubject(subjectIndex, { ...subject, units });
  };

  const removeTopic = (subjectIndex: number, unitIndex: number, topicIndex: number) => {
    if (phase.kind !== 'review') return;
    const subject = phase.subjects[subjectIndex];
    const unit = subject.units[unitIndex];
    const topics = unit.topics.filter((_, i) => i !== topicIndex);
    const units = [...subject.units];
    units[unitIndex] = { ...unit, topics };
    updateSubject(subjectIndex, { ...subject, units });
  };

  async function handleSave(subjects: ExtractedSubject[]) {
    setPhase({ kind: 'saving', subjects });
    try {
      const { data, error } = await supabase.rpc('save_syllabus_structure', {
        p_sem: semester,
        p_subjects: subjects,
      });
      if (error) throw error;
      const result = data as { status: string; subjectsSaved?: number; unitsSaved?: number; topicsSaved?: number; reason?: string };
      if (result.status !== 'saved') {
        setPhase({ kind: 'error', message: `Save was denied (${result.reason ?? 'unknown reason'}).` });
        return;
      }
      setPhase({
        kind: 'saved',
        subjectsSaved: result.subjectsSaved ?? 0,
        unitsSaved: result.unitsSaved ?? 0,
        topicsSaved: result.topicsSaved ?? 0,
      });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Save failed. Please try again.' });
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Admin Console"
        title="Syllabus Upload"
        description="Upload a semester's official syllabus PDF. AI proposes the subject/unit/topic structure — review and correct it before saving."
      />

      <Card>
        <CardHeader>
          <CardTitle>1. Choose semester &amp; PDF</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1 text-sm font-medium text-text">
              Semester
              <select
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                value={semester}
                disabled={phase.kind === 'extracting-text' || phase.kind === 'analyzing'}
                onChange={(e) => setSemester(Number(e.target.value))}
              >
                {SEMESTERS.map((s) => (
                  <option key={s} value={s}>Semester {s}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-text">
              Syllabus PDF
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                disabled={phase.kind === 'extracting-text' || phase.kind === 'analyzing'}
                onChange={(e) => void handleFileChange(e.target.files?.[0])}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-surface"
              />
            </label>
          </div>

          {(phase.kind === 'extracting-text' || phase.kind === 'analyzing') && (
            <div className="mt-4 flex items-center gap-3 text-sm text-soft">
              <LoadingSpinner size="sm" />
              {phase.kind === 'extracting-text' ? 'Reading PDF…' : 'AI is analyzing the syllabus…'}
            </div>
          )}

          {phase.kind === 'error' && (
            <p role="alert" className="mt-4 rounded-lg bg-status-red/10 px-4 py-2 text-sm font-medium text-status-red">
              {phase.message}
            </p>
          )}
        </CardContent>
      </Card>

      {phase.kind === 'review' && (
        <ReviewSection
          subjects={phase.subjects}
          rejected={phase.rejected}
          semester={semester}
          onUpdateSubject={updateSubject}
          onRemoveSubject={removeSubject}
          onRemoveUnit={removeUnit}
          onRemoveTopic={removeTopic}
          onSave={() => void handleSave(phase.subjects)}
        />
      )}

      {phase.kind === 'saving' && (
        <Card>
          <CardContent>
            <div className="flex items-center gap-3 text-sm text-soft">
              <LoadingSpinner size="sm" />
              Saving syllabus…
            </div>
          </CardContent>
        </Card>
      )}

      {phase.kind === 'saved' && (
        <Card>
          <CardContent>
            <h3 className="text-base font-semibold text-text">Syllabus saved ✓</h3>
            <p className="mt-1 text-sm text-soft">
              {phase.subjectsSaved} subjects · {phase.unitsSaved} units · {phase.topicsSaved} topics saved for Semester {semester}.
            </p>
            <Button variant="primary" className="mt-4" onClick={() => setPhase({ kind: 'idle' })}>
              Upload another
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Editable review of the AI-extracted subjects before saving. */
function ReviewSection({
  subjects,
  rejected,
  semester,
  onUpdateSubject,
  onRemoveSubject,
  onRemoveUnit,
  onRemoveTopic,
  onSave,
}: {
  subjects: ExtractedSubject[];
  rejected: number;
  semester: number;
  onUpdateSubject: (index: number, next: ExtractedSubject) => void;
  onRemoveSubject: (index: number) => void;
  onRemoveUnit: (subjectIndex: number, unitIndex: number) => void;
  onRemoveTopic: (subjectIndex: number, unitIndex: number, topicIndex: number) => void;
  onSave: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Review &amp; correct — Semester {semester}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-soft">
          {subjects.length} subjects extracted.
          {rejected > 0 && <span className="ml-1 text-muted">({rejected} malformed entries discarded automatically.)</span>}
          {' '}Nothing is saved yet — check names/codes/units below, remove anything wrong, then Save.
        </p>

        <div className="flex flex-col gap-4">
          {subjects.map((subject, subjectIndex) => (
            <div key={subjectIndex} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  className="w-28 rounded-md border border-border bg-surface px-2 py-1 text-sm font-semibold text-text"
                  value={subject.code}
                  onChange={(e) => onUpdateSubject(subjectIndex, { ...subject, code: e.target.value })}
                />
                <input
                  className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm text-text"
                  value={subject.name}
                  onChange={(e) => onUpdateSubject(subjectIndex, { ...subject, name: e.target.value })}
                />
                <select
                  className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text"
                  value={subject.kind}
                  onChange={(e) => onUpdateSubject(subjectIndex, { ...subject, kind: e.target.value as ExtractedSubject['kind'] })}
                >
                  <option value="theory">theory</option>
                  <option value="lab">lab</option>
                  <option value="project">project</option>
                  <option value="elective">elective</option>
                  <option value="special">special</option>
                </select>
                <button
                  type="button"
                  onClick={() => onRemoveSubject(subjectIndex)}
                  className="text-xs font-medium text-status-red hover:underline"
                >
                  Remove subject
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-2 pl-4">
                {subject.units.map((unit, unitIndex) => (
                  <UnitEditor
                    key={unitIndex}
                    unit={unit}
                    onChangeName={(name) => {
                      const units = [...subject.units];
                      units[unitIndex] = { ...unit, name };
                      onUpdateSubject(subjectIndex, { ...subject, units });
                    }}
                    onRemoveUnit={() => onRemoveUnit(subjectIndex, unitIndex)}
                    onRemoveTopic={(topicIndex) => onRemoveTopic(subjectIndex, unitIndex, topicIndex)}
                  />
                ))}
                {subject.units.length === 0 && (
                  <p className="text-xs text-muted">No units extracted for this subject.</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <Button variant="primary" disabled={subjects.length === 0} onClick={onSave}>
            Save {subjects.length} subject{subjects.length === 1 ? '' : 's'} for Semester {semester}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** One unit's inline editor within a subject's review card. */
function UnitEditor({
  unit,
  onChangeName,
  onRemoveUnit,
  onRemoveTopic,
}: {
  unit: ExtractedUnit;
  onChangeName: (name: string) => void;
  onRemoveUnit: () => void;
  onRemoveTopic: (topicIndex: number) => void;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-surface-muted/40 p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase text-muted">Unit {unit.unitNo}</span>
        <input
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm text-text"
          value={unit.name}
          onChange={(e) => onChangeName(e.target.value)}
        />
        <button type="button" onClick={onRemoveUnit} className="text-xs font-medium text-status-red hover:underline">
          Remove unit
        </button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {unit.topics.map((topic, topicIndex) => (
          <li
            key={topicIndex}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-soft"
          >
            {topic}
            <button
              type="button"
              onClick={() => onRemoveTopic(topicIndex)}
              className="text-muted hover:text-status-red"
              aria-label={`Remove topic ${topic}`}
            >
              ×
            </button>
          </li>
        ))}
        {unit.topics.length === 0 && <li className="text-xs text-muted">No topics.</li>}
      </ul>
    </div>
  );
}
