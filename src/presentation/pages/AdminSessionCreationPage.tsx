/**
 * Admin Console — Session Creation page (task 12.1).
 *
 * Session_Creation_Flow (Requirement 5): prompts the admin, in this exact
 * order —
 *   1. Batch code (text input, e.g. "2026-30")
 *   2. Odd/Even semester type
 *   3. Semester number (constrained by the odd/even choice: odd → 1,3,5,7;
 *      even → 2,4,6,8 — same convention `deriveBatchesForSession` in
 *      `onboarding.ts` uses)
 *   4. (auto, read-only) candidate subject list for the chosen semester,
 *      informational only — it does NOT feed into `create_session`'s
 *      parameters
 *   5. Section count
 * — then calls the `create_session` RPC via {@link createAdminSessionAccess}.
 *
 * `p_start_year` is derived from the batch code when it follows the existing
 * "YYYY-YY" convention seen in `onboarding.ts`'s `MOCK_BATCHES` (e.g.
 * "2026-30" → start year 2026); a batch code that does not match this shape
 * is rejected client-side before any RPC call is made.
 *
 * The `duplicate-batch-code` denial reason is surfaced inline via
 * `messages.admin.duplicateBatchCode`, distinct from the generic
 * `messages.admin.createSessionFailed` shown for any other failure.
 *
 * This page is admin-only by construction: it is reachable only through
 * `AdminShell`'s `RequireAdmin` guard in `App.tsx`.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '@data/supabase';
import { createAdminSessionAccess } from '@data/access/adminSessionAccess';
import { fetchSubjectsForSems } from '../../features/onboarding/api/onboarding';
import type { AcademicSession, SyllabusSubject } from '../../features/onboarding/types';
import { messages } from '@domain/shared/messages';
import { Card, CardContent, CardHeader, CardTitle, SectionHeader, Button } from '@presentation/components/ui/foundation';
import { Badge, EmptyState, ErrorState, LoadingSpinner } from '@presentation/components/ui/data-display';
import { Input, Select } from '@presentation/components/ui/forms';

const access = createAdminSessionAccess(supabase);

/** Batch code convention: "YYYY-YY", e.g. "2026-30" → start year 2026. */
const BATCH_CODE_PATTERN = /^(\d{4})-\d{2}$/;

/** Odd sems are 1,3,5,7; even sems are 2,4,6,8 — mirrors `deriveBatchesForSession`. */
const SEM_NUMBERS_BY_SESSION: Record<AcademicSession, readonly number[]> = {
  odd: [1, 3, 5, 7],
  even: [2, 4, 6, 8],
};

const SESSION_OPTIONS = [
  { value: 'odd', label: 'Odd (Sem I, III, V, VII)' },
  { value: 'even', label: 'Even (Sem II, IV, VI, VIII)' },
] as const;

/** Parse a "YYYY-YY" batch code's start year; `null` when it does not match. */
function deriveStartYear(batchCode: string): number | null {
  const match = BATCH_CODE_PATTERN.exec(batchCode.trim());
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function subjectKindLabel(kind: SyllabusSubject['kind']): string {
  switch (kind) {
    case 'theory':
      return 'Theory';
    case 'lab':
      return 'Lab';
    case 'project':
      return 'Project';
    case 'elective':
      return 'Elective';
    case 'special':
      return 'Special';
    default:
      return kind;
  }
}

export default function AdminSessionCreationPage() {
  const [batchCode, setBatchCode] = useState('');
  const [sessionType, setSessionType] = useState<AcademicSession | ''>('');
  const [semNumber, setSemNumber] = useState<number | ''>('');
  const [sectionCount, setSectionCount] = useState<number | ''>(1);

  const [subjects, setSubjects] = useState<SyllabusSubject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ batchId: string; sectionCount: number } | null>(null);

  const semOptions = useMemo(
    () => (sessionType === '' ? [] : SEM_NUMBERS_BY_SESSION[sessionType]),
    [sessionType],
  );

  // Reset the chosen semester whenever the odd/even session type changes, so
  // it can never hold a value inconsistent with the new session type.
  const handleSessionTypeChange = useCallback((value: AcademicSession | '') => {
    setSessionType(value);
    setSemNumber('');
    setSubjects([]);
    setSubjectsError(null);
  }, []);

  // Auto-populate the read-only candidate subject list for the chosen
  // semester (Requirement 5.2). Informational only — never fed back into
  // create_session's parameters.
  useEffect(() => {
    if (semNumber === '') {
      setSubjects([]);
      setSubjectsError(null);
      return;
    }
    let active = true;
    setSubjectsLoading(true);
    setSubjectsError(null);
    fetchSubjectsForSems([semNumber])
      .then((result) => {
        if (active) setSubjects(result);
      })
      .catch(() => {
        if (active) setSubjectsError(messages.error.network);
      })
      .finally(() => {
        if (active) setSubjectsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [semNumber]);

  const startYear = useMemo(() => deriveStartYear(batchCode), [batchCode]);
  const batchCodeValid = batchCode.trim() === '' || startYear !== null;

  const canSubmit =
    batchCode.trim() !== '' &&
    startYear !== null &&
    sessionType !== '' &&
    semNumber !== '' &&
    sectionCount !== '' &&
    sectionCount >= 0;

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitError(null);
      setCreated(null);

      if (startYear === null) {
        setSubmitError(messages.admin.invalidBatchCode);
        return;
      }
      if (sessionType === '' || semNumber === '' || sectionCount === '') {
        return;
      }

      setSubmitting(true);
      try {
        const result = await access.createSession({
          batchId: batchCode.trim(),
          startYear,
          currentSem: semNumber,
          sectionCount,
        });

        if (result.status === 'created') {
          setCreated({ batchId: result.batchId, sectionCount: result.sectionIds.length });
          setBatchCode('');
          setSessionType('');
          setSemNumber('');
          setSectionCount(1);
          setSubjects([]);
        } else if (result.status === 'denied' && result.reason === 'duplicate-batch-code') {
          setSubmitError(messages.admin.duplicateBatchCode);
        } else {
          setSubmitError(messages.admin.createSessionFailed);
        }
      } catch {
        setSubmitError(messages.admin.createSessionFailed);
      } finally {
        setSubmitting(false);
      }
    },
    [batchCode, startYear, sessionType, semNumber, sectionCount],
  );

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Admin Console"
        title="Session Creation"
        description="Create a new batch and its shared sections for an academic session."
      />

      <Card>
        <CardHeader>
          <CardTitle>New session</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
            <Input
              type="text"
              label="Batch code"
              placeholder="2026-30"
              value={batchCode}
              onChange={(event) => setBatchCode(event.target.value)}
              helperText={
                batchCodeValid
                  ? 'Format: YYYY-YY, e.g. 2026-30 (start year derived automatically).'
                  : undefined
              }
              error={!batchCodeValid ? messages.admin.invalidBatchCode : undefined}
              required
              disabled={submitting}
              className="max-w-xs"
            />

            <Select
              label="Semester type"
              placeholder="Select odd or even"
              value={sessionType}
              onChange={(event) => handleSessionTypeChange(event.target.value as AcademicSession | '')}
              options={SESSION_OPTIONS}
              required
              disabled={submitting}
              className="max-w-xs"
            />

            <Select
              label="Semester number"
              placeholder={sessionType === '' ? 'Select a semester type first' : 'Select semester'}
              value={semNumber === '' ? '' : String(semNumber)}
              onChange={(event) =>
                setSemNumber(event.target.value === '' ? '' : Number.parseInt(event.target.value, 10))
              }
              options={semOptions.map((sem) => ({ value: String(sem), label: `Semester ${sem}` }))}
              required
              disabled={submitting || sessionType === ''}
              className="max-w-xs"
            />

            <div>
              <p className="mb-2 text-sm font-medium text-text">Candidate subjects for this semester</p>
              {semNumber === '' ? (
                <p className="rounded-control border border-border bg-surface-muted px-4 py-3 text-sm text-soft">
                  Select a semester number to preview its candidate subjects.
                </p>
              ) : subjectsLoading ? (
                <div className="flex min-h-24 items-center justify-center">
                  <LoadingSpinner />
                </div>
              ) : subjectsError ? (
                <ErrorState
                  kind="network"
                  title="Unable to load subjects"
                  message={subjectsError}
                  className="min-h-24 border-0 shadow-none"
                />
              ) : subjects.length === 0 ? (
                <EmptyState title="No subjects found" message="No syllabus subjects are defined for this semester yet." />
              ) : (
                <div className="table-scroll">
                  <table className="table-base">
                    <thead className="table-head">
                      <tr>
                        <th className="table-header-cell text-left">Code</th>
                        <th className="table-header-cell text-left">Name</th>
                        <th className="table-header-cell text-left">Kind</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjects.map((subject) => (
                        <tr key={subject.id} className="table-row">
                          <td className="table-cell text-sm text-muted">{subject.code}</td>
                          <td className="table-cell">
                            <p className="font-medium text-text">{subject.name}</p>
                          </td>
                          <td className="table-cell">
                            <Badge tone="neutral" size="sm">
                              {subjectKindLabel(subject.kind)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <Input
              type="number"
              label="Section count"
              min={0}
              step={1}
              value={sectionCount}
              onChange={(event) =>
                setSectionCount(event.target.value === '' ? '' : Number.parseInt(event.target.value, 10))
              }
              helperText="Number of shared sections to create for this batch, e.g. 1-5. Use 0 to create the batch without sections."
              required
              disabled={submitting}
              className="max-w-xs"
            />

            {submitError && (
              <p className="rounded-control border border-status-red/30 bg-status-red/5 px-3 py-2 text-sm text-status-red">
                {submitError}
              </p>
            )}

            {created && (
              <p className="rounded-control border border-status-green/30 bg-status-green/5 px-3 py-2 text-sm text-status-green">
                Created batch &quot;{created.batchId}&quot; with {created.sectionCount} section
                {created.sectionCount === 1 ? '' : 's'}.
              </p>
            )}

            <Button type="submit" variant="primary" loading={submitting} disabled={!canSubmit} className="self-start">
              Create session
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
