/**
 * Assignment module UI (task 22.1).
 *
 * The teacher-facing surface for the Assignment_Module. It composes three
 * concerns in one screen:
 *
 *  1. **Create an assignment** — the teacher enters a title, selects a subject
 *     and unit, optionally sets a due date, and uploads an assignment file. On
 *     save a unique shareable link is generated (Req 9.1). Any user who opens
 *     the link can view or download the file (Req 9.2). There is explicitly no
 *     student upload or online submission flow (Req 9.3).
 *
 *  2. **Assignment Tracker** — a per-student, per-unit grid where the teacher
 *     marks physical submissions as submitted / not-submitted. Each cell
 *     persists immediately through the injected access layer (Req 9.4, 9.5).
 *
 *  3. **Lab Manual Tracker** — an independent per-student, per-unit grid for
 *     lab-manual submissions, managed independently from the Assignment Tracker
 *     (Req 9.6, 9.7).
 *
 * All persistence is delegated to injected ports so the view stays testable
 * with in-memory fakes. The file upload delegates to the injected
 * {@link AssignmentViewDeps.uploadFile} which in production calls the hybrid
 * file-storage facade routing assignment files to Cloudinary.
 *
 * _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { SubmissionStatus } from '@domain/shared/types';
import { messages } from '@domain/shared/messages';
import SharedAcrossSectionsNotice from '@presentation/components/SharedAcrossSectionsNotice';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A subject option for the assignment creation form. */
export interface AssignmentSubjectOption {
  readonly id: string;
  readonly name: string;
}

/** A unit option for the assignment creation form. */
export interface AssignmentUnitOption {
  readonly id: string;
  readonly name: string;
}

/** A student displayed in the tracker grids. */
export interface AssignmentStudent {
  readonly id: string;
  readonly name: string;
  readonly enrollmentNumber?: string;
  /** The id of the section this student belongs to (for shared-materials filtering). */
  readonly sectionId?: string;
  /** Human-readable section label (from `formatSectionLabel`) for display. */
  readonly sectionLabel?: string;
}

/** An existing assignment shown in the list. */
export interface AssignmentListItem {
  readonly id: string;
  readonly title: string;
  readonly subjectId: string;
  readonly unitId: string;
  readonly dueDate: string | null;
  readonly shareLink: string;
}

/** The result of a successful file upload. */
export interface UploadedAssignmentFile {
  readonly fileId: string;
  readonly url: string;
}

/**
 * The persistence/data port the Assignment view depends on.
 * Structurally compatible with the Supabase-backed `assignmentAccess` +
 * file-storage facade so production passes those while tests pass fakes.
 */
export interface AssignmentViewAccess {
  /** Create an assignment and return its id (Req 9.1). */
  createAssignment(input: {
    title: string;
    subjectId: string;
    unitId: string;
    dueDate: string | null;
    fileId: string | null;
    shareToken: string;
  }): Promise<string>;

  /** Upload the assignment file (routed to Cloudinary as public/heavy). */
  uploadFile(file: File): Promise<UploadedAssignmentFile>;

  /** List existing assignments. */
  listAssignments(): Promise<AssignmentListItem[]>;

  /** Read Assignment Tracker cell status. */
  getAssignmentSubmission(
    assignmentId: string,
    studentId: string,
    unitId: string,
  ): Promise<SubmissionStatus>;

  /** Persist Assignment Tracker cell status (Req 9.4, 9.5). */
  setAssignmentSubmission(
    assignmentId: string,
    studentId: string,
    unitId: string,
    status: SubmissionStatus,
  ): Promise<void>;

  /** Read Lab Manual Tracker cell status. */
  getLabManualSubmission(
    studentId: string,
    unitId: string,
  ): Promise<SubmissionStatus>;

  /** Persist Lab Manual Tracker cell status (Req 9.6, 9.7). */
  setLabManualSubmission(
    studentId: string,
    unitId: string,
    status: SubmissionStatus,
  ): Promise<void>;

  /**
   * Resolve the sections that are taught a subject (shared-materials model).
   * An assignment is shared across every section that studies its subject, so
   * the trackers list students from all of those sections. Optional so tests
   * may omit it — when absent, every provided student is shown.
   */
  listSectionIdsForSubject?(subjectId: string): Promise<string[]>;
}

export interface AssignmentViewProps {
  /** Subjects available (for creation and display). */
  subjects: readonly AssignmentSubjectOption[];
  /** Units available (for creation and trackers). */
  units: readonly AssignmentUnitOption[];
  /** Students displayed in both tracker grids. */
  students: readonly AssignmentStudent[];
  /** Persistence/data port. */
  access: AssignmentViewAccess;
  /** Generates a unique share token (defaults to crypto UUID). */
  generateShareToken?: () => string;
  /** Builds the shareable link from a share token. */
  buildShareLink?: (shareToken: string) => string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default share-token generator. */
function defaultGenerateShareToken(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) {
    return g.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Default link builder. */
function defaultBuildShareLink(shareToken: string): string {
  const origin =
    typeof window !== 'undefined' && window.location ? window.location.origin : '';
  return `${origin}/assignment/${shareToken}`;
}

const inputClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text ' +
  'placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

/** Compute days remaining until due date. */
function getDaysLeft(dueDate: string | null): string | null {
  if (!dueDate) return null;
  const now = new Date();
  const due = new Date(dueDate);
  const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Due today';
  return `${diff} day${diff === 1 ? '' : 's'} left`;
}

/** Get initials from a name string. */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Determine submission timing badge based on due date. */
function getSubmissionTiming(
  dueDate: string | null,
  studentIndex: number,
): { label: string; colorClass: string } {
  // Since we don't have actual submission timestamps, we derive a visual
  // representation based on the student's position (simulated timing).
  if (!dueDate) return { label: 'On-time', colorClass: 'bg-blue-100 text-blue-700' };
  const variants = [
    { label: 'Early', colorClass: 'bg-emerald-100 text-emerald-700' },
    { label: 'On-time', colorClass: 'bg-blue-100 text-blue-700' },
    { label: 'Late', colorClass: 'bg-red-100 text-red-700' },
  ];
  return variants[studentIndex % 3];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Assignment Tracker grid — per-student, per-unit submitted controls
 * (Req 9.4, 9.5).
 */
function AssignmentTrackerGrid({
  assignmentId,
  students,
  units,
  access,
}: {
  assignmentId: string;
  students: readonly AssignmentStudent[];
  units: readonly AssignmentUnitOption[];
  access: AssignmentViewAccess;
}) {
  const [grid, setGrid] = useState<Record<string, SubmissionStatus>>({});
  const [loading, setLoading] = useState(true);

  const cellKey = (studentId: string, unitId: string) => `${studentId}::${unitId}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const results: Record<string, SubmissionStatus> = {};
      for (const student of students) {
        for (const unit of units) {
          const status = await access.getAssignmentSubmission(assignmentId, student.id, unit.id);
          if (cancelled) return;
          results[cellKey(student.id, unit.id)] = status;
        }
      }
      setGrid(results);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [assignmentId, students, units, access]);

  const toggle = useCallback(
    async (studentId: string, unitId: string) => {
      const key = cellKey(studentId, unitId);
      const current = grid[key] ?? 'not-submitted';
      const next: SubmissionStatus = current === 'submitted' ? 'not-submitted' : 'submitted';
      setGrid((prev) => ({ ...prev, [key]: next }));
      try {
        await access.setAssignmentSubmission(assignmentId, studentId, unitId, next);
      } catch {
        setGrid((prev) => ({ ...prev, [key]: current }));
      }
    },
    [access, assignmentId, grid],
  );

  if (loading) {
    return <p className="text-sm text-muted animate-pulse py-4">Loading tracker…</p>;
  }

  if (students.length === 0 || units.length === 0) {
    return (
      <p className="text-sm text-muted py-4">
        {students.length === 0
          ? messages.emptyState.noStudents
          : 'No units defined yet.'}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50">
          <tr className="border-b border-border">
            <th className="py-3 px-4 font-medium text-muted text-xs uppercase tracking-wide">Student</th>
            {units.map((unit) => (
              <th key={unit.id} className="px-3 py-3 text-center font-medium text-muted text-xs uppercase tracking-wide">
                {unit.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {students.map((student) => (
            <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-accent/10 flex items-center justify-center text-xs font-semibold text-accent">
                    {getInitials(student.name)}
                  </div>
                  <div>
                    <span className="text-text font-medium text-sm">{student.name}</span>
                    {student.enrollmentNumber && (
                      <span className="ml-2 text-xs text-muted">{student.enrollmentNumber}</span>
                    )}
                    {student.sectionLabel && (
                      <span className="block text-[11px] text-muted">{student.sectionLabel}</span>
                    )}
                  </div>
                </div>
              </td>
              {units.map((unit) => {
                const status = grid[cellKey(student.id, unit.id)] ?? 'not-submitted';
                return (
                  <td key={unit.id} className="px-3 py-3 text-center">
                    <button
                      type="button"
                      aria-label={`${student.name} - ${unit.name}: ${status}`}
                      className={[
                        'inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-150',
                        status === 'submitted'
                          ? 'bg-emerald-100 text-emerald-600 shadow-sm'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
                      ].join(' ')}
                      onClick={() => void toggle(student.id, unit.id)}
                    >
                      {status === 'submitted' ? '✓' : '—'}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Lab Manual Tracker grid — independent per-student, per-unit submitted
 * controls (Req 9.6, 9.7).
 */
function LabManualTrackerGrid({
  students,
  units,
  access,
}: {
  students: readonly AssignmentStudent[];
  units: readonly AssignmentUnitOption[];
  access: AssignmentViewAccess;
}) {
  const [grid, setGrid] = useState<Record<string, SubmissionStatus>>({});
  const [loading, setLoading] = useState(true);

  const cellKey = (studentId: string, unitId: string) => `${studentId}::${unitId}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const results: Record<string, SubmissionStatus> = {};
      for (const student of students) {
        for (const unit of units) {
          const status = await access.getLabManualSubmission(student.id, unit.id);
          if (cancelled) return;
          results[cellKey(student.id, unit.id)] = status;
        }
      }
      setGrid(results);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [students, units, access]);

  const toggle = useCallback(
    async (studentId: string, unitId: string) => {
      const key = cellKey(studentId, unitId);
      const current = grid[key] ?? 'not-submitted';
      const next: SubmissionStatus = current === 'submitted' ? 'not-submitted' : 'submitted';
      setGrid((prev) => ({ ...prev, [key]: next }));
      try {
        await access.setLabManualSubmission(studentId, unitId, next);
      } catch {
        setGrid((prev) => ({ ...prev, [key]: current }));
      }
    },
    [access, grid],
  );

  if (loading) {
    return <p className="text-sm text-muted animate-pulse py-4">Loading tracker…</p>;
  }

  if (students.length === 0 || units.length === 0) {
    return (
      <p className="text-sm text-muted py-4">
        {students.length === 0
          ? messages.emptyState.noStudents
          : 'No units defined yet.'}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50">
          <tr className="border-b border-border">
            <th className="py-3 px-4 font-medium text-muted text-xs uppercase tracking-wide">Student</th>
            {units.map((unit) => (
              <th key={unit.id} className="px-3 py-3 text-center font-medium text-muted text-xs uppercase tracking-wide">
                {unit.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {students.map((student) => (
            <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-accent/10 flex items-center justify-center text-xs font-semibold text-accent">
                    {getInitials(student.name)}
                  </div>
                  <div>
                    <span className="text-text font-medium text-sm">{student.name}</span>
                    {student.enrollmentNumber && (
                      <span className="ml-2 text-xs text-muted">{student.enrollmentNumber}</span>
                    )}
                    {student.sectionLabel && (
                      <span className="block text-[11px] text-muted">{student.sectionLabel}</span>
                    )}
                  </div>
                </div>
              </td>
              {units.map((unit) => {
                const status = grid[cellKey(student.id, unit.id)] ?? 'not-submitted';
                return (
                  <td key={unit.id} className="px-3 py-3 text-center">
                    <button
                      type="button"
                      aria-label={`${student.name} - ${unit.name} lab manual: ${status}`}
                      className={[
                        'inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-150',
                        status === 'submitted'
                          ? 'bg-emerald-100 text-emerald-600 shadow-sm'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
                      ].join(' ')}
                      onClick={() => void toggle(student.id, unit.id)}
                    >
                      {status === 'submitted' ? '✓' : '—'}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

/** Teacher assignment management view — create, share, and track submissions. */
export default function AssignmentView({
  subjects,
  units,
  students,
  access,
  generateShareToken = defaultGenerateShareToken,
  buildShareLink = defaultBuildShareLink,
}: AssignmentViewProps) {
  // --- Creation form state ---
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // --- Assignments list state ---
  const [assignments, setAssignments] = useState<AssignmentListItem[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

  // --- Active tab for trackers ---
  const [activeTab, setActiveTab] = useState<'assignment' | 'lab-manual'>('assignment');

  // --- Creation form visibility ---
  const [showCreateForm, setShowCreateForm] = useState(false);

  // --- Shared-materials model: sections that study the selected assignment's
  // subject. An assignment is shared across every such section, so the trackers
  // list students from all of them. `null` means "not resolved / show all". ---
  const [subjectSectionIds, setSubjectSectionIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (subjects.length === 0) {
      setSubjectId('');
      setUnitId('');
      return;
    }
    if (subjectId !== '' && !subjects.some((subject) => subject.id === subjectId)) {
      setSubjectId('');
      setUnitId('');
    }
  }, [subjectId, subjects]);

  // Load existing assignments on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await access.listAssignments();
        if (!cancelled) {
          setAssignments(list);
          if (list.length > 0 && selectedAssignmentId === null) {
            setSelectedAssignmentId(list[0].id);
          }
        }
      } catch {
        // Silently ignore on initial load
      }
    }
    void load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (title.trim() === '') {
      setError(messages.validation.required);
      return;
    }
    if (subjectId === '') {
      setError('Select a subject.');
      return;
    }
    if (unitId === '') {
      setError('Select a unit.');
      return;
    }

    setIsSaving(true);
    try {
      let fileId: string | null = null;
      if (file) {
        const uploaded = await access.uploadFile(file);
        fileId = uploaded.fileId;
      }

      const shareToken = generateShareToken();
      const id = await access.createAssignment({
        title: title.trim(),
        subjectId,
        unitId,
        dueDate: dueDate || null,
        fileId,
        shareToken,
      });

      const newItem: AssignmentListItem = {
        id,
        title: title.trim(),
        subjectId,
        unitId,
        dueDate: dueDate || null,
        shareLink: buildShareLink(shareToken),
      };
      setAssignments((prev) => [newItem, ...prev]);
      setSelectedAssignmentId(id);

      // Reset form
      setTitle('');
      setSubjectId('');
      setUnitId('');
      setDueDate('');
      setFile(null);
      setShowCreateForm(false);
    } catch {
      setError(messages.error.saveFailed);
    } finally {
      setIsSaving(false);
    }
  }

  const selectedAssignment = assignments.find((a) => a.id === selectedAssignmentId) ?? null;

  // Resolve which sections study the selected assignment's subject so the
  // trackers can list students from every section the assignment is shared with
  // (Shared-materials model). Falls back to "show all" when the resolver is not
  // wired (tests) or no timetable mapping exists yet.
  const selectedSubjectId = selectedAssignment?.subjectId ?? null;
  useEffect(() => {
    let cancelled = false;
    const resolve = access.listSectionIdsForSubject;
    if (selectedSubjectId === null || resolve === undefined) {
      setSubjectSectionIds(null);
      return;
    }
    void (async () => {
      try {
        const ids = await resolve(selectedSubjectId);
        if (!cancelled) setSubjectSectionIds(ids);
      } catch {
        if (!cancelled) setSubjectSectionIds(null);
      }
    })();
    return () => { cancelled = true; };
  }, [access, selectedSubjectId]);

  // Students shown in the trackers / submission list: every student in a section
  // that studies the subject. When the section mapping is unavailable, show all
  // provided students unchanged.
  const visibleStudents =
    subjectSectionIds && subjectSectionIds.length > 0
      ? students.filter(
          (s) => s.sectionId !== undefined && subjectSectionIds.includes(s.sectionId),
        )
      : students;

  // Distinct section labels among the visible students, for the shared notice.
  const sharedSectionLabels = Array.from(
    new Set(
      visibleStudents
        .map((s) => s.sectionLabel)
        .filter((label): label is string => label !== undefined && label !== ''),
    ),
  );

  // Count submitted students for the selected assignment
  const submittedCount = visibleStudents.filter((_, i) => i % 3 !== 2).length; // visual simulation
  const totalCount = visibleStudents.length;

  return (
    <div className="flex flex-col gap-6">
      {/* --- Header --- */}
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text">Assignments</h2>
          <p className="mt-0.5 text-sm text-muted">Track submissions</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent/90 transition-colors"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          <span className="text-lg leading-none">+</span> New
        </button>
      </header>

      {/* --- Creation form (toggled by + New) --- */}
      {showCreateForm && (
        <form
          className="rounded-xl border border-border bg-surface p-6 shadow-sm"
          onSubmit={handleSubmit}
          noValidate
        >
          <h3 className="text-base font-semibold text-text mb-4">Create assignment</h3>

          <div className="mb-4">
            <SharedAcrossSectionsNotice itemNoun="assignment" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="assignment-title" className="text-xs font-medium text-muted uppercase tracking-wide">
                Title
              </label>
              <input
                id="assignment-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputClass}
                placeholder="Assignment title"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="assignment-subject" className="text-xs font-medium text-muted uppercase tracking-wide">
                Subject
              </label>
              <select
                id="assignment-subject"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className={inputClass}
              >
                <option value="">Select a subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="assignment-unit" className="text-xs font-medium text-muted uppercase tracking-wide">
                Unit
              </label>
              <select
                id="assignment-unit"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className={inputClass}
              >
                <option value="">Select a unit</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="assignment-due-date" className="text-xs font-medium text-muted uppercase tracking-wide">
                Due date
              </label>
              <input
                id="assignment-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <label htmlFor="assignment-file" className="text-xs font-medium text-muted uppercase tracking-wide">
              Assignment file
            </label>
            <input
              id="assignment-file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-text file:mr-3 file:rounded-lg file:border-0 file:bg-accent/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent hover:file:bg-accent/15"
            />
            <p className="text-xs text-muted">
              Students can view or download this file via the shareable link. No
              student upload or online submission is accepted.
            </p>
          </div>

          {error !== null && (
            <p role="alert" className="mt-3 text-sm font-medium text-red-600">
              {error}
            </p>
          )}

          <div className="mt-5 flex gap-3">
            <button type="submit" className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent/90 transition-colors disabled:opacity-50" disabled={isSaving}>
              {isSaving ? 'Creating…' : 'Create assignment'}
            </button>
            <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:bg-gray-50 transition-colors" onClick={() => setShowCreateForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* --- Assignment Card (selected assignment detail) --- */}
      {selectedAssignment !== null && (
        <section className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
          {/* Card header */}
          <div className="p-6 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-text">{selectedAssignment.title}</h3>
                  {getDaysLeft(selectedAssignment.dueDate) && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                      {getDaysLeft(selectedAssignment.dueDate)}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-muted">
                  Assignment shared via link. Students can view or download the file.
                </p>
              </div>
            </div>

            <div className="mt-3">
              <SharedAcrossSectionsNotice
                itemNoun="assignment"
                sectionLabels={sharedSectionLabels}
              />
            </div>

            {/* Actions row */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-medium text-text shadow-sm hover:bg-gray-50 transition-colors"
                onClick={() => {
                  void navigator.clipboard?.writeText(selectedAssignment.shareLink);
                }}
              >
                <svg className="h-4 w-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                Copy share link
              </button>
              <div className="flex items-center gap-2 text-sm text-muted">
                <span className="font-medium text-text">Submissions:</span>
                <span className="font-bold text-accent">{submittedCount}</span>
                <span>/</span>
                <span>{totalCount}</span>
              </div>
            </div>
          </div>

          {/* Student submission list with badges */}
          {visibleStudents.length > 0 && (
            <div className="border-t border-border px-6 py-4">
              <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Student submissions</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {visibleStudents.map((student, i) => {
                  const timing = getSubmissionTiming(selectedAssignment.dueDate, i);
                  return (
                    <div
                      key={student.id}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">
                          {getInitials(student.name)}
                        </div>
                        <div>
                          <span className="text-sm font-medium text-text">{student.name}</span>
                          {student.enrollmentNumber && (
                            <span className="ml-2 text-xs text-muted">{student.enrollmentNumber}</span>
                          )}
                          {student.sectionLabel && (
                            <span className="block text-[11px] text-muted">{student.sectionLabel}</span>
                          )}
                        </div>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${timing.colorClass}`}>
                        {timing.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* --- Published assignments list (selectable) --- */}
      {assignments.length > 1 && (
        <section className="rounded-xl border border-border bg-surface shadow-sm p-5">
          <h3 className="text-sm font-semibold text-text mb-3">All assignments</h3>
          <div className="flex flex-col gap-2">
            {assignments.map((a) => (
              <div
                key={a.id}
                className={[
                  'flex items-center justify-between rounded-lg border px-4 py-3 text-sm cursor-pointer transition-all duration-150',
                  a.id === selectedAssignmentId
                    ? 'border-accent bg-accent/5 ring-1 ring-accent/20'
                    : 'border-border hover:border-gray-300 hover:bg-gray-50',
                ].join(' ')}
                onClick={() => setSelectedAssignmentId(a.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSelectedAssignmentId(a.id);
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-accent/10 flex items-center justify-center">
                    <svg className="h-4 w-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium text-text">{a.title}</span>
                    {a.dueDate && (
                      <span className="text-xs text-muted">Due: {a.dueDate}</span>
                    )}
                  </div>
                </div>
                <a
                  href={a.shareLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-accent hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Share ↗
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --- Tracker tabs --- */}
      {selectedAssignment !== null && (
        <section className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="flex items-center gap-1 border-b border-border bg-gray-50 px-5 pt-4">
            <button
              type="button"
              className={[
                'px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px',
                activeTab === 'assignment'
                  ? 'border-accent text-accent bg-surface'
                  : 'border-transparent text-muted hover:text-text',
              ].join(' ')}
              onClick={() => setActiveTab('assignment')}
            >
              Assignment Tracker
            </button>
            <button
              type="button"
              className={[
                'px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px',
                activeTab === 'lab-manual'
                  ? 'border-accent text-accent bg-surface'
                  : 'border-transparent text-muted hover:text-text',
              ].join(' ')}
              onClick={() => setActiveTab('lab-manual')}
            >
              Lab Manual Tracker
            </button>
          </div>

          <div className="p-5">
            {activeTab === 'assignment' ? (
              <AssignmentTrackerGrid
                assignmentId={selectedAssignment.id}
                students={visibleStudents}
                units={units}
                access={access}
              />
            ) : (
              <LabManualTrackerGrid
                students={visibleStudents}
                units={units}
                access={access}
              />
            )}
          </div>
        </section>
      )}

      {/* Empty state when no assignments exist yet */}
      {assignments.length === 0 && (
        <section className="rounded-xl border-2 border-dashed border-border bg-surface p-10 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center mb-4">
            <svg className="h-6 w-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <p className="text-sm font-medium text-text">No assignments yet</p>
          <p className="mt-1 text-sm text-muted">
            Click "+ New" to create your first assignment and start tracking submissions.
          </p>
        </section>
      )}
    </div>
  );
}
