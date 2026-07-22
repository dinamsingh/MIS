/**
 * Admin Console — Roster Import page (task 12.3).
 *
 * CSV import UI (reusing the existing RosterView-style upload/preview pattern)
 * driving `parseAdminRosterCsv` (from `adminRosterImportAccess.ts`), surfacing
 * `missingEmail` rows distinctly from `rejected` rows (different colored badge/
 * section), plus a single-student manual-add form calling `addSingleStudent`.
 *
 * Also hosts the roster remove-vs-delete UI for existing students:
 * - "Remove from roster" as the default/primary action on each student row
 * - "Permanently delete" as a visually distinct secondary action behind a
 *   confirmation dialog whose copy states the destructive/FK-breaking risk
 *   (messages.admin.permanentDeleteWarning), calling
 *   `permanently_delete_student(id, true)` RPC only on explicit confirm
 *   (dismissing the dialog never calls the RPC).
 *
 * Requirements validated: 6.1, 6.2, 6.5, 8.2, 8.3, 8.4
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { supabase } from '@data/supabase';
import { parseAdminRosterCsv, addSingleStudent } from '@data/access/adminRosterImportAccess';
import { createRosterImportAccess } from '@data/access/rosterImportAccess';
import { createSectionsAccess } from '@data/access/sectionsAccess';
import { messages } from '@domain/shared/messages';
import { formatSectionLabel, type SectionLike } from '@presentation/format/sectionLabel';
import { Card, CardContent, CardHeader, CardTitle, SectionHeader, Button } from '@presentation/components/ui/foundation';
import { Badge, EmptyState, LoadingSpinner } from '@presentation/components/ui/data-display';
import { Input, Select } from '@presentation/components/ui/forms';
import { ConfirmDialog } from '@presentation/components/ui/overlays';

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

const sectionsAccess = createSectionsAccess(supabase);
const rosterImportAccess = createRosterImportAccess(supabase);

interface SectionOption {
  readonly id: string;
  readonly name: string;
  readonly batch?: string | null;
  readonly semester?: string | null;
  readonly department?: string | null;
}

interface StudentRow {
  readonly id: string;
  readonly name: string;
  readonly enrollment_number?: string | null;
  readonly email?: string | null;
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function AdminRosterImportPage() {
  // Section selection
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [sectionId, setSectionId] = useState('');

  // Roster state
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // CSV import state
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual add state
  const [manualEnrollment, setManualEnrollment] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualAdding, setManualAdding] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSuccess, setManualSuccess] = useState<string | null>(null);

  // Remove/Delete state
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StudentRow | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load sections on mount
  useEffect(() => {
    let active = true;
    setSectionsLoading(true);
    sectionsAccess
      .listSections()
      .then((list) => {
        if (!active) return;
        setSections(list);
        if (list.length > 0 && !sectionId) {
          setSectionId(list[0].id);
        }
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (active) setSectionsLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load students whenever sectionId changes
  const loadStudents = useCallback(async (secId: string) => {
    if (!secId) {
      setStudents([]);
      return;
    }
    setStudentsLoading(true);
    try {
      const { data } = await supabase
        .from('students')
        .select('id, name, enrollment_number, email')
        .eq('section_id', secId)
        .order('name');
      setStudents((data as StudentRow[] | null) ?? []);
    } catch {
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStudents(sectionId);
  }, [sectionId, loadStudents]);

  // ---------------------------------------------------------------------------
  // CSV Import
  // ---------------------------------------------------------------------------

  const { valid, rejected, missingEmail } = useMemo(() => parseAdminRosterCsv(csvText), [csvText]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setImportSuccess(null);
    setImportError(null);
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      setImportError(messages.error.generic);
    };
    reader.readAsText(file);
  }, []);

  const handleTextChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setImportSuccess(null);
    setImportError(null);
    setFileName(null);
    setCsvText(event.target.value);
  }, []);

  const canImport = sectionId !== '' && valid.length > 0 && !importing;

  const handleImport = useCallback(async () => {
    if (!canImport) return;
    setImporting(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const summary = await rosterImportAccess.replaceSection(sectionId, valid);
      setImportSuccess(messages.rosterImport.importSucceeded(summary.imported));
      setCsvText('');
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      void loadStudents(sectionId);
    } catch {
      setImportError(messages.rosterImport.importFailed);
    } finally {
      setImporting(false);
    }
  }, [canImport, sectionId, valid, loadStudents]);

  // ---------------------------------------------------------------------------
  // Manual single-student add
  // ---------------------------------------------------------------------------

  const handleManualAdd = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setManualError(null);
    setManualSuccess(null);
    if (!sectionId) {
      setManualError(messages.rosterImport.sectionRequired);
      return;
    }
    setManualAdding(true);
    try {
      await addSingleStudent(supabase, sectionId, {
        enrollmentNumber: manualEnrollment.trim(),
        name: manualName.trim(),
        email: manualEmail.trim(),
      });
      setManualSuccess(`Added ${manualName.trim()} successfully.`);
      setManualEnrollment('');
      setManualName('');
      setManualEmail('');
      void loadStudents(sectionId);
    } catch (err) {
      setManualError(err instanceof Error ? err.message : messages.error.generic);
    } finally {
      setManualAdding(false);
    }
  }, [sectionId, manualEnrollment, manualName, manualEmail, loadStudents]);

  // ---------------------------------------------------------------------------
  // Remove from roster / Permanently delete
  // ---------------------------------------------------------------------------

  const handleRemoveFromRoster = useCallback(async (studentId: string) => {
    setRemovingId(studentId);
    setActionError(null);
    try {
      const { error } = await supabase.rpc('remove_student_from_roster', { p_student_id: studentId });
      if (error) throw error;
      void loadStudents(sectionId);
    } catch {
      setActionError(messages.error.generic);
    } finally {
      setRemovingId(null);
    }
  }, [sectionId, loadStudents]);

  const openDeleteDialog = useCallback((student: StudentRow) => {
    setDeleteTarget(student);
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setActionError(null);
    try {
      const { error } = await supabase.rpc('permanently_delete_student', {
        p_student_id: deleteTarget.id,
        p_confirmed: true,
      });
      if (error) throw error;
      void loadStudents(sectionId);
    } catch {
      setActionError(messages.error.generic);
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, sectionId, loadStudents]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const inputClass =
    'w-full rounded-button border border-border bg-surface px-3 py-2 text-sm text-text ' +
    'placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Admin Console"
        title="Roster Import"
        description="Bulk-import students via CSV, manually add individual students, and manage the active roster."
      />

      {/* Section Selector */}
      <Card>
        <CardContent>
          {sectionsLoading ? (
            <div className="flex min-h-16 items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : sections.length === 0 ? (
            <EmptyState title="No sections" message="Create a session first to have sections available." />
          ) : (
            <Select
              label="Target Section"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              options={sections.map((s) => ({ label: formatSectionLabel(s as SectionLike), value: s.id }))}
              className="max-w-md"
            />
          )}
        </CardContent>
      </Card>

      {/* CSV Import Card */}
      <Card>
        <CardHeader>
          <CardTitle>CSV Import</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="roster-file-admin" className="text-sm font-medium text-text">Upload File (.csv)</label>
              <input
                id="roster-file-admin"
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-muted file:mr-3 file:rounded-button file:border-0 file:bg-accent/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent hover:file:bg-accent/20"
              />
              {fileName && <p className="text-xs text-emerald-600 font-medium">Loaded: {fileName}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="roster-text-admin" className="text-sm font-medium text-text">Or Paste CSV Content</label>
              <textarea
                id="roster-text-admin"
                value={csvText}
                onChange={handleTextChange}
                rows={4}
                placeholder={'enrollment,name,email\n0131CS241000,Aarav Mehta,aarav@example.com'}
                className={inputClass + ' font-mono text-xs leading-relaxed'}
              />
            </div>

            {/* Preview */}
            {csvText.trim() !== '' && (
              <div className="rounded-card border border-border bg-surface-muted p-4 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge tone="success">{valid.length} Valid</Badge>
                  <Badge tone="danger">{rejected.length} Rejected</Badge>
                  <Badge tone="warning">{missingEmail.length} Missing Email</Badge>
                </div>

                {rejected.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-status-red mb-1">Rejected Rows</p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs text-status-red">
                      {rejected.slice(0, 10).map((row, i) => (
                        <li key={i}>{row.reason}</li>
                      ))}
                      {rejected.length > 10 && <li>… and {rejected.length - 10} more</li>}
                    </ul>
                  </div>
                )}

                {missingEmail.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-status-amber mb-1">Missing Email (required for admin import)</p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs text-status-amber">
                      {missingEmail.slice(0, 10).map((row, i) => (
                        <li key={i}>{messages.rosterImport.missingEmail(row.enrollmentNumber)}</li>
                      ))}
                      {missingEmail.length > 10 && <li>… and {missingEmail.length - 10} more</li>}
                    </ul>
                  </div>
                )}

                {valid.length > 0 && rejected.length === 0 && missingEmail.length === 0 && (
                  <p className="text-sm text-emerald-700">All {valid.length} rows parsed successfully and are ready to import.</p>
                )}
              </div>
            )}

            {importError && (
              <p className="rounded-control border border-status-red/30 bg-status-red/5 px-3 py-2 text-sm text-status-red">
                {importError}
              </p>
            )}
            {importSuccess && (
              <p className="rounded-control border border-status-green/30 bg-status-green/5 px-3 py-2 text-sm text-status-green">
                {importSuccess}
              </p>
            )}

            <Button
              variant="primary"
              disabled={!canImport}
              loading={importing}
              onClick={() => void handleImport()}
              className="self-start"
            >
              Import CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Manual Single-Student Add */}
      <Card>
        <CardHeader>
          <CardTitle>Add Single Student</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleManualAdd(e)} className="flex flex-col gap-3 max-w-lg">
            <Input
              type="text"
              label="Enrollment Number"
              placeholder="0131CS241000"
              value={manualEnrollment}
              onChange={(e) => setManualEnrollment(e.target.value)}
              required
              disabled={manualAdding}
            />
            <Input
              type="text"
              label="Name"
              placeholder="Student name"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              required
              disabled={manualAdding}
            />
            <Input
              type="email"
              label="Email"
              placeholder="student@example.com"
              value={manualEmail}
              onChange={(e) => setManualEmail(e.target.value)}
              required
              disabled={manualAdding}
            />
            {manualError && (
              <p className="rounded-control border border-status-red/30 bg-status-red/5 px-3 py-2 text-sm text-status-red">
                {manualError}
              </p>
            )}
            {manualSuccess && (
              <p className="rounded-control border border-status-green/30 bg-status-green/5 px-3 py-2 text-sm text-status-green">
                {manualSuccess}
              </p>
            )}
            <Button
              type="submit"
              variant="primary"
              loading={manualAdding}
              disabled={!sectionId || !manualEnrollment.trim() || !manualName.trim() || !manualEmail.trim()}
              className="self-start"
            >
              Add Student
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Existing Roster with Remove / Delete */}
      <Card>
        <CardHeader>
          <CardTitle>Current Roster</CardTitle>
        </CardHeader>
        <CardContent>
          {actionError && (
            <p className="mb-3 rounded-control border border-status-red/30 bg-status-red/5 px-3 py-2 text-sm text-status-red">
              {actionError}
            </p>
          )}

          {studentsLoading ? (
            <div className="flex min-h-48 items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : students.length === 0 ? (
            <EmptyState title="No students" message="Import students via CSV or add them manually above." />
          ) : (
            <div className="table-scroll">
              <table className="table-base">
                <thead className="table-head">
                  <tr>
                    <th className="table-header-cell text-left">Name</th>
                    <th className="table-header-cell text-left">Enrollment</th>
                    <th className="table-header-cell text-left">Email</th>
                    <th className="table-header-cell text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id} className="table-row">
                      <td className="table-cell">
                        <p className="font-medium text-text">{student.name}</p>
                      </td>
                      <td className="table-cell text-sm text-muted font-mono">
                        {student.enrollment_number ?? '—'}
                      </td>
                      <td className="table-cell text-sm text-muted">
                        {student.email ?? '—'}
                      </td>
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            loading={removingId === student.id}
                            disabled={removingId !== null && removingId !== student.id}
                            onClick={() => void handleRemoveFromRoster(student.id)}
                          >
                            Remove from roster
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={removingId !== null}
                            onClick={() => openDeleteDialog(student)}
                          >
                            Permanently delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permanent Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeleteTarget(null);
        }}
        title="Permanently Delete Student"
        message={messages.admin.permanentDeleteWarning}
        confirmLabel="Yes, permanently delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  );
}
