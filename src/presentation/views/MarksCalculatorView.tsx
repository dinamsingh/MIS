/**
 * Marks Calculator view (task 20.2).
 *
 * The teacher-facing surface for Requirement 7 (Internal Marks Calculator). It
 * is composed of two cooperating panels:
 *
 *  1. **Mark components** — define, edit, and remove the weighted
 *     {@link MarkComponent}s for a subject, each with a name, a maximum value,
 *     and a weightage (Req 7.1). Adding, editing, or removing a component is
 *     persisted through the injected {@link MarksAccess} (Req 7.2).
 *
 *  2. **Student marks** — a per-student grid that accepts a value for every
 *     defined component (Req 7.3). Each value is validated inline against its
 *     component's configured bounds using the pure `validateMarkValue`, so a
 *     value below zero or above the component maximum is rejected with the
 *     English validation message before any save (Req 7.5). As the teacher
 *     types, the student's Internal_Marks total is recomputed live with the
 *     pure `computeInternalMarks` and displayed (Req 7.4). Saving a row
 *     persists the component values together with the computed Internal_Marks
 *     snapshot through the data-access layer (Req 7.6).
 *
 * Like the other views, this component performs no I/O of its own: every read
 * and write is delegated to the injected {@link MarksAccess}, which the
 * Supabase-backed `marksAccess` wrapper supplies in production. That keeps the
 * view deterministic and testable, and keeps the correctness-critical bounds
 * check and weighted-total computation in the pure domain layer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  validateMarkValue,
  computeInternalMarks,
  type MarkComponent,
  type MarkValue,
} from '@domain/services/marksService';
import type { MarksAccess } from '@data/access/marksAccess';
import { messages } from '@domain/shared/messages';
import { TableSkeleton } from '@presentation/components/skeletons';

/** A student the calculator accepts component values for. */
export interface MarksStudent {
  readonly id: string;
  readonly name: string;
  readonly enrollmentNumber?: string;
}

export interface MarksCalculatorViewProps {
  /** The subject whose mark components and values are being edited. */
  subjectId: string;
  /** The students shown as rows in the per-student marks grid. */
  students: readonly MarksStudent[];
  /** Persistence boundary (defaults to the Supabase-backed wrapper in production). */
  access: MarksAccess;
}

/** An editable row in the mark-components panel. */
interface ComponentDraft {
  /** Stable local key for React; independent of the persisted id. */
  readonly key: string;
  /** The persisted component id, or `undefined` for an unsaved new row. */
  id?: string;
  name: string;
  maxValue: string;
  weightage: string;
  saving: boolean;
  error: string | null;
}

/** Map of componentId -> raw input string, per student. */
type StudentValues = Record<string, Record<string, string>>;
/** Map of componentId -> inline error message, per student. */
type StudentErrors = Record<string, Record<string, string | null>>;

let draftCounter = 0;
function nextDraftKey(): string {
  draftCounter += 1;
  return `draft-${draftCounter}`;
}

/** Parse a raw input string to a finite number, or `null` when blank/invalid. */
function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Format a computed Internal_Marks total with up to two decimals, no trailing zeros. */
function formatMarks(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** Build a draft from a persisted component. */
function draftFromComponent(component: MarkComponent): ComponentDraft {
  return {
    key: nextDraftKey(),
    id: component.id,
    name: component.name,
    maxValue: String(component.maxValue),
    weightage: String(component.weightage),
    saving: false,
    error: null,
  };
}

/** Teacher-facing Internal Marks Calculator (Requirement 7). */
export default function MarksCalculatorView({
  subjectId,
  students,
  access,
}: MarksCalculatorViewProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [components, setComponents] = useState<MarkComponent[]>([]);
  const [drafts, setDrafts] = useState<ComponentDraft[]>([]);
  const [values, setValues] = useState<StudentValues>({});
  const [errors, setErrors] = useState<StudentErrors>({});
  const [savingStudent, setSavingStudent] = useState<string | null>(null);
  const [savedTotals, setSavedTotals] = useState<Record<string, number>>({});

  // Load the subject's components and every student's saved values once.
  useEffect(() => {
    let active = true;
    setStatus('loading');
    void (async () => {
      try {
        const loadedComponents = await access.listComponents(subjectId);
        const loadedValues = await Promise.all(
          students.map((student) => access.loadValues(student.id)),
        );
        if (!active) {
          return;
        }
        const nextValues: StudentValues = {};
        students.forEach((student, index) => {
          const row: Record<string, string> = {};
          for (const value of loadedValues[index]) {
            row[value.componentId] = String(value.value);
          }
          nextValues[student.id] = row;
        });
        setComponents(loadedComponents);
        setDrafts(loadedComponents.map(draftFromComponent));
        setValues(nextValues);
        setErrors({});
        setSavedTotals({});
        setStatus('ready');
      } catch {
        if (active) {
          setStatus('error');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [access, subjectId, students]);

  // --- Component-panel handlers ------------------------------------------

  const updateDraft = useCallback(
    (key: string, patch: Partial<ComponentDraft>) => {
      setDrafts((prev) =>
        prev.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
      );
    },
    [],
  );

  const addDraft = useCallback(() => {
    setDrafts((prev) => [
      ...prev,
      { key: nextDraftKey(), name: '', maxValue: '', weightage: '', saving: false, error: null },
    ]);
  }, []);

  const upsertComponentInList = useCallback((component: MarkComponent) => {
    setComponents((prev) => {
      const index = prev.findIndex((c) => c.id === component.id);
      if (index === -1) {
        return [...prev, component];
      }
      const next = prev.slice();
      next[index] = component;
      return next;
    });
  }, []);

  const saveDraft = useCallback(
    async (key: string) => {
      const draft = drafts.find((d) => d.key === key);
      if (draft === undefined) {
        return;
      }

      const name = draft.name.trim();
      const maxValue = parseNumber(draft.maxValue);
      const weightage = parseNumber(draft.weightage);

      // Validate the component configuration before persisting (Req 7.1).
      if (name === '') {
        updateDraft(key, { error: messages.validation.required });
        return;
      }
      if (maxValue === null || maxValue <= 0) {
        updateDraft(key, { error: 'Enter a maximum value greater than 0.' });
        return;
      }
      if (weightage === null || weightage <= 0) {
        updateDraft(key, { error: 'Enter a weightage greater than 0.' });
        return;
      }

      updateDraft(key, { saving: true, error: null });
      try {
        const id = await access.upsertComponent({
          ...(draft.id !== undefined ? { id: draft.id } : {}),
          subjectId,
          name,
          maxValue,
          weightage,
        });
        const saved: MarkComponent = { id, name, maxValue, weightage };
        upsertComponentInList(saved);
        updateDraft(key, { id, saving: false, error: null });
      } catch {
        updateDraft(key, { saving: false, error: messages.error.saveFailed });
      }
    },
    [access, drafts, subjectId, updateDraft, upsertComponentInList],
  );

  const removeDraft = useCallback(
    async (key: string) => {
      const draft = drafts.find((d) => d.key === key);
      if (draft === undefined) {
        return;
      }
      const { id } = draft;
      // An unsaved draft is simply dropped from the editor.
      if (id === undefined) {
        setDrafts((prev) => prev.filter((d) => d.key !== key));
        return;
      }
      updateDraft(key, { saving: true, error: null });
      try {
        await access.deleteComponent(id);
        setDrafts((prev) => prev.filter((d) => d.key !== key));
        setComponents((prev) => prev.filter((c) => c.id !== id));
        // Drop any entered values/errors tied to the removed component.
        setValues((prev) => {
          const next: StudentValues = {};
          for (const [studentId, row] of Object.entries(prev)) {
            const { [id]: _removed, ...rest } = row;
            next[studentId] = rest;
          }
          return next;
        });
      } catch {
        updateDraft(key, { saving: false, error: messages.error.saveFailed });
      }
    },
    [access, drafts, updateDraft],
  );

  // --- Marks-grid handlers -----------------------------------------------

  const handleValueChange = useCallback(
    (studentId: string, component: MarkComponent, raw: string) => {
      setValues((prev) => ({
        ...prev,
        [studentId]: { ...prev[studentId], [component.id]: raw },
      }));

      // Inline bounds validation (Req 7.5): a blank value clears the error and
      // contributes nothing; a present value is checked against the component.
      const parsed = parseNumber(raw);
      let message: string | null = null;
      if (raw.trim() !== '') {
        const result = validateMarkValue(parsed ?? NaN, component);
        message = result.ok ? null : result.error.message;
      }
      setErrors((prev) => ({
        ...prev,
        [studentId]: { ...prev[studentId], [component.id]: message },
      }));
      // Editing invalidates the last persisted total shown for the row.
      setSavedTotals((prev) => {
        if (!(studentId in prev)) {
          return prev;
        }
        const { [studentId]: _dropped, ...rest } = prev;
        return rest;
      });
    },
    [],
  );

  /** Build the in-range MarkValue list for a student (used for live + saved totals). */
  const markValuesFor = useCallback(
    (studentId: string): MarkValue[] => {
      const row = values[studentId] ?? {};
      const list: MarkValue[] = [];
      for (const component of components) {
        const parsed = parseNumber(row[component.id] ?? '');
        if (parsed !== null) {
          list.push({ componentId: component.id, value: parsed });
        }
      }
      return list;
    },
    [components, values],
  );

  /** Whether a student's row currently has any inline validation error. */
  const rowHasError = useCallback(
    (studentId: string): boolean => {
      const rowErrors = errors[studentId];
      if (rowErrors === undefined) {
        return false;
      }
      return Object.values(rowErrors).some((message) => message !== null);
    },
    [errors],
  );

  const saveStudent = useCallback(
    async (studentId: string) => {
      if (rowHasError(studentId)) {
        return;
      }
      setSavingStudent(studentId);
      try {
        const result = await access.saveValues(studentId, components, markValuesFor(studentId));
        if (result.ok) {
          setSavedTotals((prev) => ({ ...prev, [studentId]: result.value.internalMarks }));
        } else {
          // Surface a server-side bounds rejection on the offending cell (Req 7.5).
          const field = result.error.field;
          if (field !== undefined) {
            setErrors((prev) => ({
              ...prev,
              [studentId]: { ...prev[studentId], [field]: result.error.message },
            }));
          }
        }
      } catch {
        // Leave the row untouched; a transient failure can be retried.
      } finally {
        setSavingStudent(null);
      }
    },
    [access, components, markValuesFor, rowHasError],
  );

  // --- Render -------------------------------------------------------------

  const totalWeightage = useMemo(
    () => components.reduce((sum, component) => sum + component.weightage, 0),
    [components],
  );

  /** Build a subtitle string from components: "Mid 50% · Quiz 20% · …" */
  const subtitleParts = useMemo(() => {
    if (components.length === 0) return '';
    return components.map((c) => `${c.name} ${formatMarks(c.weightage)}%`).join(' · ');
  }, [components]);

  if (status === 'loading') {
    return <TableSkeleton rows={8} columns={6} />;
  }

  if (status === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <p role="alert" className="text-sm font-medium text-red-700">
          {messages.error.generic}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Internal Marks</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {subtitleParts ? `${subtitleParts} — /${formatMarks(totalWeightage)}` : 'Define components below to see the breakdown'}
          </p>
        </div>
        <div className="mt-3 flex gap-2 sm:mt-0">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
        </div>
      </div>

      {/* Component CRUD panel (compact) */}
      <details className="rounded-lg border border-gray-200 bg-white">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          Manage Components ({drafts.length})
        </summary>
        <div className="border-t border-gray-200 px-4 py-4">
          <div className="flex items-center justify-end mb-3">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
              onClick={addDraft}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add
            </button>
          </div>

          {drafts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              No components yet. Add a component to define your grading scheme.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {drafts.map((draft) => (
                <div
                  key={draft.key}
                  className="flex flex-col gap-2 rounded-md border border-gray-100 bg-gray-50 p-3 sm:flex-row sm:items-end"
                >
                  <div className="flex flex-1 flex-col gap-1">
                    <label htmlFor={`name-${draft.key}`} className="text-xs font-medium text-gray-500">
                      Name
                    </label>
                    <input
                      id={`name-${draft.key}`}
                      type="text"
                      className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={draft.name}
                      placeholder="Mid-term"
                      onChange={(e) => updateDraft(draft.key, { name: e.target.value, error: null })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`max-${draft.key}`} className="text-xs font-medium text-gray-500">
                      Max
                    </label>
                    <input
                      id={`max-${draft.key}`}
                      type="number"
                      min={0}
                      className="w-20 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={draft.maxValue}
                      placeholder="50"
                      onChange={(e) => updateDraft(draft.key, { maxValue: e.target.value, error: null })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`weight-${draft.key}`} className="text-xs font-medium text-gray-500">
                      Wt%
                    </label>
                    <input
                      id={`weight-${draft.key}`}
                      type="number"
                      min={0}
                      className="w-20 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={draft.weightage}
                      placeholder="20"
                      onChange={(e) => updateDraft(draft.key, { weightage: e.target.value, error: null })}
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      disabled={draft.saving}
                      onClick={() => void saveDraft(draft.key)}
                    >
                      {draft.saving ? '…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                      disabled={draft.saving}
                      onClick={() => void removeDraft(draft.key)}
                    >
                      Remove
                    </button>
                  </div>
                  {draft.error !== null && (
                    <p role="alert" className="w-full text-xs font-medium text-red-600 sm:basis-full">
                      {draft.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      {/* Main marks table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {components.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">
            Define at least one mark component to enter student marks.
          </p>
        ) : students.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">
            {messages.emptyState.noStudents}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Student
                  </th>
                  {components.map((component) => (
                    <th key={component.id} scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {component.name}/{formatMarks(component.maxValue)}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Internal/{formatMarks(totalWeightage)}
                  </th>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((student, idx) => {
                  const liveTotal = computeInternalMarks(components, markValuesFor(student.id));
                  const savedTotal = savedTotals[student.id];
                  const rowErrors = errors[student.id] ?? {};
                  const studentRow = values[student.id] ?? {};
                  return (
                    <tr
                      key={student.id}
                      className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                    >
                      <td className="px-4 py-3 text-left font-medium text-gray-900 whitespace-nowrap">
                        {student.name}
                        {student.enrollmentNumber !== undefined && (
                          <span className="ml-2 text-xs font-normal text-gray-400">
                            {student.enrollmentNumber}
                          </span>
                        )}
                      </td>
                      {components.map((component) => {
                        const cellError = rowErrors[component.id] ?? null;
                        return (
                          <td key={component.id} className="px-4 py-2 text-center">
                            <input
                              type="number"
                              min={0}
                              max={component.maxValue}
                              aria-label={`${student.name} — ${component.name}`}
                              aria-invalid={cellError !== null}
                              className={`w-16 rounded-md border px-2 py-1.5 text-center text-sm transition-colors focus:outline-none focus:ring-1 ${
                                cellError !== null
                                  ? 'border-red-300 bg-red-50 text-red-700 focus:border-red-500 focus:ring-red-500'
                                  : 'border-gray-300 bg-white text-gray-900 focus:border-indigo-500 focus:ring-indigo-500'
                              }`}
                              value={studentRow[component.id] ?? ''}
                              onChange={(e) =>
                                handleValueChange(student.id, component, e.target.value)
                              }
                            />
                            {cellError !== null && (
                              <p role="alert" className="mt-0.5 text-[10px] font-medium text-red-600">
                                {cellError}
                              </p>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-bold text-gray-900">
                          {formatMarks(liveTotal)}
                        </span>
                        {savedTotal !== undefined && (
                          <span className="ml-1 text-[10px] font-medium text-green-600">
                            ✓
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                          disabled={savingStudent === student.id || rowHasError(student.id)}
                          onClick={() => void saveStudent(student.id)}
                        >
                          {savingStudent === student.id ? '…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
