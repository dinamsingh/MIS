import { useEffect, useState } from 'react';
import { fileStorage } from '@data/storage';
import {
  createDemoMaterial,
  isLocalDemoMode,
  readDemoValue,
  writeDemoValue,
} from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { loadSubjectOptionsForSection, type SubjectOption } from '@presentation/loaders/subjectOptions';
import { loadUnitsForSubject, type UnitOption } from '@presentation/loaders/unitOptions';
import type { FileCategory, UploadPolicy } from '@domain/services/storageRouter';

const SHARE_HISTORY_KEY = 'mis_assignment_share_history_v1';

const ASSIGNMENT_FILE_POLICY: UploadPolicy = {
  allowedTypes: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  maxSizeBytes: 30 * 1024 * 1024,
};

interface UploadedAssignmentFile {
  readonly fileId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly url: string;
}

interface ShareRecord extends UploadedAssignmentFile {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly assignmentDate: string;
  readonly submissionDate: string;
  readonly subjectId: string;
  readonly subjectName: string;
  readonly unitId: string;
  readonly unitName: string;
  readonly sectionName: string;
  readonly createdAt: string;
}

interface AssignmentShareRow {
  readonly id: string;
  readonly file_id: string | null;
  readonly title: string;
  readonly description: string;
  readonly subject_id: string;
  readonly unit_id: string;
  readonly section_id: string | null;
  readonly file_name: string;
  readonly mime_type: string | null;
  readonly size_bytes: number | null;
  readonly file_url: string;
  readonly assignment_date: string | null;
  readonly submission_date: string | null;
  readonly created_at: string;
  readonly syllabus_subjects?: { readonly code: string | null; readonly name: string } | ReadonlyArray<{ readonly code: string | null; readonly name: string }> | null;
  readonly syllabus_units?: { readonly unit_no: number | null; readonly name: string } | ReadonlyArray<{ readonly unit_no: number | null; readonly name: string }> | null;
  readonly sections?: { readonly name: string } | ReadonlyArray<{ readonly name: string }> | null;
}

function fileSizeLabel(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(value: string): string {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function readShareHistory(): ShareRecord[] {
  return readDemoValue<ShareRecord[]>(SHARE_HISTORY_KEY, []);
}

function saveShareHistory(records: ShareRecord[]) {
  writeDemoValue<ShareRecord[]>(SHARE_HISTORY_KEY, records.slice(0, 12));
}

function shareRecordFromRow(row: AssignmentShareRow): ShareRecord {
  const sub = Array.isArray(row.syllabus_subjects) ? row.syllabus_subjects[0] : row.syllabus_subjects;
  const uni = Array.isArray(row.syllabus_units) ? row.syllabus_units[0] : row.syllabus_units;
  const sec = Array.isArray(row.sections) ? row.sections[0] : row.sections;

  const subjectName = sub
    ? [sub.code, sub.name].filter(Boolean).join(' - ')
    : 'Subject';
  const unitName = uni
    ? `Unit ${uni.unit_no ?? ''}: ${uni.name}`.replace('Unit :', 'Unit').trim()
    : 'Unit';
  return {
    id: row.id,
    fileId: row.file_id ?? row.id,
    fileName: row.file_name,
    mimeType: row.mime_type ?? '',
    sizeBytes: Number(row.size_bytes ?? 0),
    url: row.file_url,
    title: row.title,
    description: row.description,
    assignmentDate: row.assignment_date ?? '',
    submissionDate: row.submission_date ?? '',
    subjectId: row.subject_id,
    subjectName,
    unitId: row.unit_id,
    unitName,
    sectionName: sec?.name ?? '',
    createdAt: row.created_at,
  };
}

async function loadShareHistory(): Promise<ShareRecord[]> {
  if (isLocalDemoMode()) {
    return readShareHistory();
  }

  const { data, error } = await supabase
    .from('assignment_shares')
    .select('id, file_id, title, description, assignment_date, submission_date, subject_id, unit_id, section_id, file_name, mime_type, size_bytes, file_url, created_at, syllabus_subjects(code, name), syllabus_units(unit_no, name), sections(name)')
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as AssignmentShareRow[]).map(shareRecordFromRow);
}

async function persistShareRecord(record: ShareRecord, sectionId: string | null): Promise<ShareRecord> {
  if (isLocalDemoMode()) {
    const nextHistory = [record, ...readShareHistory().filter((item) => item.fileId !== record.fileId)];
    saveShareHistory(nextHistory);
    return record;
  }

  const { data, error } = await supabase
    .from('assignment_shares')
    .insert({
      file_id: record.fileId,
      subject_id: record.subjectId,
      unit_id: record.unitId,
      section_id: sectionId,
      title: record.title,
      description: record.description,
      assignment_date: record.assignmentDate || null,
      submission_date: record.submissionDate || null,
      file_name: record.fileName,
      mime_type: record.mimeType || null,
      size_bytes: record.sizeBytes,
      file_url: record.url,
    })
    .select('id, file_id, title, description, assignment_date, submission_date, subject_id, unit_id, section_id, file_name, mime_type, size_bytes, file_url, created_at, syllabus_subjects(code, name), syllabus_units(unit_no, name), sections(name)')
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return shareRecordFromRow(data as AssignmentShareRow);
}

function buildShareMessage(record: ShareRecord): string {
  return [
    `Assignment: ${record.title}`,
    `Subject: ${record.subjectName}`,
    `Unit: ${record.unitName}`,
    record.sectionName ? `Class: ${record.sectionName}` : '',
    record.assignmentDate ? `Assignment Date: ${formatDateLabel(record.assignmentDate)}` : '',
    record.submissionDate ? `Submission Date: ${formatDateLabel(record.submissionDate)}` : '',
    '',
    `File: ${record.url}`,
  ].filter(Boolean).join('\n');
}

async function uploadAssignmentFile(file: File): Promise<UploadedAssignmentFile> {
  if (isLocalDemoMode()) {
    const item = createDemoMaterial({
      category: 'assignment',
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    return {
      fileId: item.id,
      fileName: item.fileName,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      url: item.url,
    };
  }

  const result = await fileStorage.uploadFile({
    category: 'assignment' as FileCategory,
    data: file,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    policy: ASSIGNMENT_FILE_POLICY,
  });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return {
    fileId: result.value.fileId,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    url: result.value.url,
  };
}

export default function AssignmentSharePage() {
  const { selectedSection } = useSelectedSection();
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [title, setTitle] = useState('');
  const [assignmentDate, setAssignmentDate] = useState(() => todayInputValue());
  const [submissionDate, setSubmissionDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ShareRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeRecord, setActiveRecord] = useState<ShareRecord | null>(null);

  const selectedSubject = subjects.find((subject) => subject.id === subjectId) ?? null;
  const selectedUnit = units.find((unit) => unit.id === unitId) ?? null;
  const canUpload = Boolean(selectedSubject && selectedUnit && title.trim() && assignmentDate && submissionDate && file);
  const shareMessage = activeRecord ? buildShareMessage(activeRecord) : '';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadSubjectOptionsForSection(selectedSection ?? null);
        if (cancelled) return;
        setSubjects(loaded);
        setSubjectId((current) => current && loaded.some((subject) => subject.id === current) ? current : loaded[0]?.id ?? '');
      } catch {
        if (!cancelled) setSubjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSection]);

  useEffect(() => {
    let cancelled = false;
    setUnitId('');
    void (async () => {
      try {
        const loaded = await loadUnitsForSubject(subjectId);
        if (cancelled) return;
        setUnits(loaded);
        setUnitId(loaded[0]?.id ?? '');
      } catch {
        if (!cancelled) setUnits([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  useEffect(() => {
    if (!selectedUnit || title.trim()) return;
    setTitle(`${selectedUnit.name} Assignment`);
  }, [selectedUnit, title]);

  useEffect(() => {
    if (assignmentDate && submissionDate && submissionDate < assignmentDate) {
      setSubmissionDate('');
    }
  }, [assignmentDate, submissionDate]);



  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    void loadShareHistory()
      .then((records) => {
        if (!cancelled) setHistory(records);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load assignment share history.');
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUpload() {
    if (!file || !selectedSubject || !selectedUnit) return;
    setUploading(true);
    setError(null);
    setCopied(false);
    try {
      const uploaded = await uploadAssignmentFile(file);
      const record: ShareRecord = {
        ...uploaded,
        id: `${uploaded.fileId}-${Date.now()}`,
        title: title.trim(),
        description: '',
        assignmentDate,
        submissionDate,
        subjectId: selectedSubject.id,
        subjectName: selectedSubject.name,
        unitId: selectedUnit.id,
        unitName: selectedUnit.name,
        sectionName: selectedSection?.name ?? '',
        createdAt: new Date().toISOString(),
      };
      const savedRecord = await persistShareRecord(record, selectedSection?.id ?? null);
      const nextHistory = [savedRecord, ...history.filter((item) => item.id !== savedRecord.id && item.fileId !== savedRecord.fileId)].slice(0, 12);
      setHistory(nextHistory);
      setActiveRecord(savedRecord);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Dobara try karein.');
    } finally {
      setUploading(false);
    }
  }

  async function copyMessage() {
    if (!shareMessage) return;
    await navigator.clipboard.writeText(shareMessage);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-10">
      {/* ── Teacher Quick-info Strip ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card border border-border bg-surface p-3 shadow-soft">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted">Today</p>
          <p className="mt-1 text-sm font-black text-text">
            {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>
        <div className="rounded-card border border-border bg-surface p-3 shadow-soft">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted">Section</p>
          <p className="mt-1 truncate text-sm font-black text-text">{selectedSection?.name ?? 'No section'}</p>
        </div>
        <div className="rounded-card border border-border bg-surface p-3 shadow-soft">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted">Subject</p>
          <p className="mt-1 truncate text-sm font-black text-text">{selectedSubject?.name ?? 'Not selected'}</p>
        </div>
        <div className="rounded-card border border-emerald-200/60 bg-emerald-50/50 p-3 shadow-soft">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Assignments Shared</p>
          <p className="mt-1 text-sm font-black text-emerald-800">
            {historyLoading ? '...' : history.length}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-card border border-border bg-surface p-4 shadow-elevated">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field-group">
              <span className="field-label">Subject</span>
              <select className="input" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                {subjects.length === 0 ? <option value="">No subject found</option> : null}
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </label>

            <label className="field-group">
              <span className="field-label">Unit</span>
              <select className="input" value={unitId} onChange={(event) => setUnitId(event.target.value)}>
                {units.length === 0 ? <option value="">No unit found</option> : null}
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.name}</option>
                ))}
              </select>
            </label>

            <label className="field-group sm:col-span-2">
              <span className="field-label">Title</span>
              <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Assignment 1: JVM basics" />
            </label>

            <label className="field-group">
              <span className="field-label">Assignment date</span>
              <input
                type="date"
                className="input"
                value={assignmentDate}
                onChange={(event) => setAssignmentDate(event.target.value)}
              />
            </label>

            <label className="field-group">
              <span className="field-label">Submission date</span>
              <input
                type="date"
                className="input"
                min={assignmentDate || undefined}
                value={submissionDate}
                onChange={(event) => setSubmissionDate(event.target.value)}
              />
            </label>

            <label className="sm:col-span-2 rounded-card border border-dashed border-accent/45 bg-accent-tint/40 p-4">
              <span className="block text-xs font-black uppercase tracking-[0.16em] text-accent">Assignment file</span>
              <input
                type="file"
                className="mt-3 block w-full text-sm font-semibold text-soft file:mr-4 file:rounded-button file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-accent-strong"
                accept=".pdf,.doc,.docx,.ppt,.pptx,image/png,image/jpeg"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              {file && (
                <p className="mt-2 text-xs font-semibold text-muted">
                  Selected: {file.name} ({fileSizeLabel(file.size)})
                </p>
              )}
            </label>
          </div>

          {error && (
            <div className="mt-4 rounded-control border border-status-red/25 bg-status-red/10 px-3 py-2 text-sm font-semibold text-status-red">
              {error}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-muted">
              File upload hone ke baad copy message button active hoga.
            </p>
            <button
              type="button"
              disabled={!canUpload || uploading}
              onClick={handleUpload}
              className="motion-interactive min-h-touch rounded-button bg-accent px-5 py-2.5 text-sm font-black text-white shadow-elevated transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload and prepare share'}
            </button>
          </div>
        </section>

        <aside className="rounded-card border border-border bg-surface p-4 shadow-elevated">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">WhatsApp copy</p>
              <h2 className="text-lg font-black text-text">Ready message</h2>
            </div>
            {activeRecord && (
              <a className="rounded-button border border-border px-3 py-2 text-xs font-bold text-soft hover:bg-secondary" href={activeRecord.url} target="_blank" rel="noreferrer">
                Open file
              </a>
            )}
          </div>

          {/* ── Date Summary ── */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-control border border-emerald-200/70 bg-emerald-50/60 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Assignment Date</p>
              <p className="mt-1 text-lg font-black text-emerald-800">
                {activeRecord?.assignmentDate
                  ? new Date(activeRecord.assignmentDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                  : assignmentDate
                    ? new Date(assignmentDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—'}
              </p>
            </div>
            <div className="rounded-control border border-amber-200/70 bg-amber-50/60 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Submission Date</p>
              <p className="mt-1 text-lg font-black text-amber-800">
                {activeRecord?.submissionDate
                  ? new Date(activeRecord.submissionDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                  : submissionDate
                    ? new Date(submissionDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—'}
              </p>
            </div>
          </div>

          {/* ── WhatsApp Message Preview (compact) ── */}
          <div className="mt-3 rounded-control border border-border bg-background p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted">WhatsApp Message</p>
            <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-xs font-medium leading-5 text-soft">
              {shareMessage || 'Upload ke baad yahan ready-to-copy message dikhega.'}
            </p>
          </div>

          <button
            type="button"
            disabled={!shareMessage}
            onClick={copyMessage}
            className="mt-3 min-h-touch w-full rounded-button bg-text px-4 py-2.5 text-sm font-black text-surface shadow-elevated transition-colors hover:bg-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copied ? 'Copied' : 'Copy message for WhatsApp'}
          </button>
        </aside>
      </div>

      <section className="rounded-card border border-border bg-surface p-4 shadow-elevated">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Recent</p>
            <h2 className="text-lg font-black text-text">Recent assignment shares</h2>
          </div>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-muted">
            {historyLoading ? 'Loading...' : `${history.length} synced`}
          </span>
        </div>

        {historyLoading ? (
          <p className="mt-4 rounded-control border border-border bg-background p-4 text-sm font-semibold text-muted">
            Loading shared assignments...
          </p>
        ) : history.length === 0 ? (
          <p className="mt-4 rounded-control border border-border bg-background p-4 text-sm font-semibold text-muted">
            Abhi koi assignment share prepare nahi hua.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {history.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => {
                  setActiveRecord(record);
                  setCopied(false);
                }}
                className="rounded-control border border-border bg-background p-4 text-left shadow-soft transition-colors hover:border-accent/40 hover:bg-accent-tint/30"
              >
                <p className="truncate text-sm font-black text-text">{record.title}</p>
                <p className="mt-1 truncate text-xs font-semibold text-muted">{record.subjectName} - {record.unitName}</p>
                <p className="mt-3 text-xs font-semibold text-soft">{record.fileName} - {fileSizeLabel(record.sizeBytes)}</p>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
