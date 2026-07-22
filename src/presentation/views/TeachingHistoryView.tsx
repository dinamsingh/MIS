/**
 * Read-only Teaching History surface (task 18.1).
 *
 * Purely presentational — receives already-loaded historical records and
 * renders them grouped batch → semester → subject (Requirement 12.1). This
 * component renders ZERO insert/update/delete-capable controls anywhere in
 * its tree: no attendance-marking control, no marks-editing input, no quiz
 * content editor, no button that writes to any table (Requirement 12.2).
 * Every control that exists here is a pure navigation/display affordance
 * (an expand/collapse toggle), which the task 18.3 audit test checks for.
 */

import { useMemo, useState } from 'react';
import { Badge, Card, EmptyState, ErrorState, LoadingSpinner, SectionHeader } from '@presentation/components/ui';
import type { HistoricalRecordRow } from '@data/access/teachingHistoryAccess';

export interface TeachingHistoryViewProps {
  readonly records: readonly HistoricalRecordRow[];
  readonly loading: boolean;
  readonly loadError: boolean;
  readonly onRetry: () => void;
}

interface SubjectGroup {
  readonly subjectId: string;
  readonly subjectCode: string;
  readonly subjectName: string;
  readonly attendanceCount: number;
  readonly marksCount: number;
  readonly quizCount: number;
}

interface SemesterGroup {
  readonly semester: number;
  readonly subjects: SubjectGroup[];
}

interface BatchGroup {
  readonly batchId: string;
  readonly semesters: SemesterGroup[];
}

/** Ordinal semester label, e.g. 5 -> "5th Semester" (mirrors onboarding.ts's ordinalSem). */
function ordinalSem(n: number): string {
  const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  return `${n}${suffix} Semester`;
}

/** Group flat historical records into batch -> semester -> subject, sorted for stable display. */
function groupRecords(records: readonly HistoricalRecordRow[]): BatchGroup[] {
  const batchMap = new Map<string, Map<number, Map<string, SubjectGroup>>>();

  for (const record of records) {
    const semesterMap = batchMap.get(record.batchId) ?? new Map<number, Map<string, SubjectGroup>>();
    batchMap.set(record.batchId, semesterMap);

    const subjectMap = semesterMap.get(record.semester) ?? new Map<string, SubjectGroup>();
    semesterMap.set(record.semester, subjectMap);

    const existing = subjectMap.get(record.subjectId) ?? {
      subjectId: record.subjectId,
      subjectCode: record.subjectCode,
      subjectName: record.subjectName,
      attendanceCount: 0,
      marksCount: 0,
      quizCount: 0,
    };

    subjectMap.set(record.subjectId, {
      ...existing,
      attendanceCount: existing.attendanceCount + (record.kind === 'attendance' ? record.count : 0),
      marksCount: existing.marksCount + (record.kind === 'marks' ? record.count : 0),
      quizCount: existing.quizCount + (record.kind === 'quiz' ? record.count : 0),
    });
  }

  return Array.from(batchMap.entries())
    .map(([batchId, semesterMap]) => ({
      batchId,
      semesters: Array.from(semesterMap.entries())
        .map(([semester, subjectMap]) => ({
          semester,
          subjects: Array.from(subjectMap.values()).sort((a, b) => a.subjectCode.localeCompare(b.subjectCode)),
        }))
        .sort((a, b) => a.semester - b.semester),
    }))
    .sort((a, b) => a.batchId.localeCompare(b.batchId));
}

export default function TeachingHistoryView({ records, loading, loadError, onRetry }: TeachingHistoryViewProps) {
  const grouped = useMemo(() => groupRecords(records), [records]);
  const [collapsedBatches, setCollapsedBatches] = useState<ReadonlySet<string>>(new Set());

  const toggleBatch = (batchId: string) => {
    setCollapsedBatches((current) => {
      const next = new Set(current);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-16">
      <SectionHeader
        eyebrow="Read-Only Archive"
        title="Teaching History"
        description="Browse your own past-semester and graduated-batch attendance, marks, and quiz records. Nothing here can be edited — this is reference access only."
      />

      {loadError && (
        <ErrorState
          kind="network"
          title="Unable to load teaching history"
          message="Historical records could not be loaded. Check your connection and try again."
          onAction={onRetry}
        />
      )}

      {loading ? (
        <Card className="flex min-h-48 items-center justify-center">
          <LoadingSpinner label="Loading teaching history" />
        </Card>
      ) : !loadError && grouped.length === 0 ? (
        <EmptyState
          title="No teaching history yet"
          message="Once a batch you taught is promoted past a semester or graduates, its records will appear here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map((batchGroup) => {
            const collapsed = collapsedBatches.has(batchGroup.batchId);
            return (
              <Card key={batchGroup.batchId} padded={false} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleBatch(batchGroup.batchId)}
                  aria-expanded={!collapsed}
                  className="flex w-full items-center justify-between gap-3 border-b border-border bg-surface-muted/40 px-4 py-3 text-left"
                >
                  <div>
                    <p className="text-xs font-bold uppercase text-muted">Batch</p>
                    <h2 className="text-base font-semibold text-text">{batchGroup.batchId}</h2>
                  </div>
                  <Badge tone="neutral" size="sm">
                    {collapsed ? 'Show' : 'Hide'}
                  </Badge>
                </button>

                {!collapsed && (
                  <div className="divide-y divide-border">
                    {batchGroup.semesters.map((semesterGroup) => (
                      <div key={semesterGroup.semester} className="px-4 py-4">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-muted">
                          {ordinalSem(semesterGroup.semester)}
                        </h3>
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                            <thead className="text-[11px] uppercase text-muted">
                              <tr>
                                <th className="py-2 pr-4 font-bold">Subject</th>
                                <th className="py-2 pr-4 text-right font-bold">Attendance records</th>
                                <th className="py-2 pr-4 text-right font-bold">Marks records</th>
                                <th className="py-2 text-right font-bold">Quiz attempts</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {semesterGroup.subjects.map((subject) => (
                                <tr key={subject.subjectId}>
                                  <td className="py-2 pr-4 font-semibold text-text">
                                    {subject.subjectCode} - {subject.subjectName}
                                  </td>
                                  <td className="py-2 pr-4 text-right text-text">{subject.attendanceCount}</td>
                                  <td className="py-2 pr-4 text-right text-text">{subject.marksCount}</td>
                                  <td className="py-2 text-right text-text">{subject.quizCount}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
