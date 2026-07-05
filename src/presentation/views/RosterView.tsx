/**
 * Student Management Surface (task 7).
 *
 * Renders a complete student management dashboard with a list of students,
 * bulk actions, CSV import, and a profile drawer.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { messages } from '@domain/shared/messages';
import {
  parseRosterCsv,
  type ParsedRosterRow,
  type RejectedRosterRow,
} from '@domain/services/rosterImportService';
import { formatSectionLabel } from '@presentation/format/sectionLabel';
import type { RosterImportSummary } from '@data/access/rosterImportAccess';

import {
  SectionHeader,
  Button,
  IconButton,
  FilterBar,
  SearchInput,
  Select,
  Checkbox,
  Card,
  Avatar,
  Badge,
  SkeletonLoader,
  Alert,
  Toast,
} from '@presentation/components/ui';

// ---------------------------------------------------------------------------
// Props / data interfaces
// ---------------------------------------------------------------------------

export interface RosterSectionOption {
  readonly id: string;
  readonly name: string;
  readonly batch?: string | null;
  readonly semester?: string | null;
  readonly department?: string | null;
}

export interface RosterStudent {
  readonly id: string;
  readonly name: string;
  readonly enrollmentNumber?: string;
}

export type LoadRoster = (sectionId: string) => Promise<RosterStudent[]>;

export interface RosterImportPersistence {
  importRoster(
    sectionId: string,
    rows: readonly ParsedRosterRow[],
  ): Promise<RosterImportSummary>;
}

export interface RosterViewProps {
  persistence: RosterImportPersistence;
  sections: readonly RosterSectionOption[];
  loadRoster: LoadRoster;
}

const inputClass =
  'w-full rounded-button border border-border bg-surface px-3 py-2 text-sm text-text ' +
  'placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

const RosterTableRow = memo(function RosterTableRow({
  student,
  index,
  selected,
  onToggleSelection,
  onOpenStudent,
}: {
  readonly student: RosterStudent;
  readonly index: number;
  readonly selected: boolean;
  readonly onToggleSelection: (id: string, index: number, shiftKey: boolean) => void;
  readonly onOpenStudent: (student: RosterStudent) => void;
}) {
  return (
    <motion.tr
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.005, 0.12) }}
      className={`table-row cursor-pointer hover:bg-surface-muted transition-colors ${selected ? 'bg-accent/5' : ''}`}
      onClick={() => onOpenStudent(student)}
    >
      <td className="table-cell sticky left-0 z-10 w-12 text-center bg-inherit" onClick={e => e.stopPropagation()}>
        <Checkbox
          checked={selected}
          onChange={(e) => onToggleSelection(student.id, index, (e.nativeEvent as PointerEvent).shiftKey)}
          label=""
        />
      </td>
      <td className="table-cell sticky left-12 z-10 bg-inherit min-w-[200px]">
        <div className="flex items-center gap-3">
          <Avatar name={student.name} size="sm" />
          <span className="font-semibold text-text">{student.name}</span>
        </div>
      </td>
      <td className="table-cell text-muted font-mono text-sm">{student.enrollmentNumber ?? student.id.slice(0, 8)}</td>
      <td className="table-cell">
        <Badge tone="success" size="sm">Active</Badge>
      </td>
      <td className="table-cell text-right pr-6" onClick={e => e.stopPropagation()}>
        <Button variant="ghost" size="sm" onClick={() => onOpenStudent(student)}>
          View Profile
        </Button>
      </td>
    </motion.tr>
  );
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function RosterView({ persistence, sections, loadRoster }: RosterViewProps) {
  const [sectionId, setSectionId] = useState<string>(sections[0]?.id ?? '');

  // Roster state
  const [roster, setRoster] = useState<readonly RosterStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Selection state
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // Drawer state
  const [selectedStudent, setSelectedStudent] = useState<RosterStudent | null>(null);

  // CSV Import Modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvText, setCsvText] = useState<string>('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Feedback state
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ensure valid section ID
  useEffect(() => {
    if (sections.length === 0) {
      setSectionId('');
      return;
    }
    if (!sections.some((section) => section.id === sectionId)) {
      setSectionId(sections[0].id);
    }
  }, [sections, sectionId]);

  // Load roster
  useEffect(() => {
    if (!sectionId) {
      setRoster([]);
      return;
    }

    let active = true;
    setRosterLoading(true);
    setSelectedRows(new Set());

    void loadRoster(sectionId)
      .then((students) => {
        if (!active) return;
        setRoster(students);
        setRosterLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setRoster([]);
        setRosterLoading(false);
      });

    return () => { active = false; };
  }, [sectionId, loadRoster]);

  // CSV Import specific computed values
  const { valid, rejected } = useMemo(() => parseRosterCsv(csvText), [csvText]);

  const sectionName = useMemo(() => {
    const selected = sections.find((s) => s.id === sectionId);
    return selected ? formatSectionLabel(selected) : '';
  }, [sections, sectionId]);

  const canImport = sectionId !== '' && valid.length > 0 && !isImporting;

  const resetFeedback = useCallback(() => {
    setSuccessMessage(null);
    setErrorMessage(null);
  }, []);

  const handleTextChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    resetFeedback();
    setIsConfirming(false);
    setFileName(null);
    setCsvText(event.target.value);
  }, [resetFeedback]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    resetFeedback();
    setIsConfirming(false);
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      setErrorMessage(messages.error.generic);
    };
    reader.readAsText(file);
  }, [resetFeedback]);

  const handleRequestImport = useCallback(() => {
    resetFeedback();
    if (sectionId === '') {
      setErrorMessage(messages.rosterImport.sectionRequired);
      return;
    }
    if (valid.length === 0) {
      setErrorMessage(messages.rosterImport.noValidRows);
      return;
    }
    setIsConfirming(true);
  }, [resetFeedback, sectionId, valid.length]);

  const handleConfirmImport = useCallback(async () => {
    setIsImporting(true);
    setErrorMessage(null);
    try {
      const summary = await persistence.importRoster(sectionId, valid);
      setSuccessMessage(messages.rosterImport.importSucceeded(summary.imported));
      setCsvText('');
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Reload roster after import
      setRosterLoading(true);
      const newRoster = await loadRoster(sectionId);
      setRoster(newRoster);

      // Close modal after short delay
      setTimeout(() => setShowImportModal(false), 2000);

    } catch {
      setErrorMessage(messages.rosterImport.importFailed);
    } finally {
      setIsImporting(false);
      setIsConfirming(false);
      setRosterLoading(false);
    }
  }, [persistence, sectionId, valid, loadRoster]);

  // Filtering
  const filteredRoster = useMemo(() => {
    if (!searchQuery.trim()) return roster;
    const q = searchQuery.toLowerCase();
    return roster.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.enrollmentNumber || '').toLowerCase().includes(q)
    );
  }, [roster, searchQuery]);

  // Selection handlers
  const toggleRowSelection = useCallback((id: string, index: number, shiftKey: boolean) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        for (let i = start; i <= end; i++) {
          next.add(filteredRoster[i].id);
        }
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
    setLastSelectedIndex(index);
  }, [filteredRoster, lastSelectedIndex]);

  const toggleAllSelection = useCallback(() => {
    if (selectedRows.size === filteredRoster.length && filteredRoster.length > 0) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredRoster.map(s => s.id)));
    }
  }, [filteredRoster, selectedRows.size]);

  const openStudentProfile = useCallback((student: RosterStudent) => {
    setSelectedStudent(student);
  }, []);

  // Dummy action handlers
  const handleExportCSV = () => {
    const csvContent = "data:text/csv;charset=utf-8," +
      "Enrollment Number,Name\n" +
      filteredRoster
        .filter(s => selectedRows.has(s.id) || selectedRows.size === 0)
        .map(s => `${s.enrollmentNumber || ''},${s.name}`)
        .join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `roster_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setSuccessMessage("Export completed.");
  };

  const dummyAction = (actionName: string) => {
    setSuccessMessage(`Simulated action: ${actionName}`);
    setSelectedRows(new Set());
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-20 relative">
      <SectionHeader
        eyebrow="Student Management"
        title="Students"
        description="Manage the student roster, assignments, and access academic profiles."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="info" size="md">{roster.length} Total</Badge>
            <Button variant="secondary" onClick={() => setShowImportModal(true)}>
              Import CSV
            </Button>
            <Button variant="primary" onClick={() => dummyAction("Open Add Student Form")}>
              Quick Add
            </Button>
          </div>
        }
      />

      {/* Main Filter Bar */}
      <Card padded={false} className="overflow-hidden flex flex-col">
        <FilterBar className="border-b border-border rounded-none bg-surface-muted/30">
          <SearchInput
            placeholder="Search student or roll..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="min-w-[250px]"
          />
          <Select
            options={sections.map(s => ({ label: formatSectionLabel(s), value: s.id }))}
            value={sectionId}
            onChange={e => setSectionId(e.target.value)}
            className="min-w-[200px]"
          />
          <Select
            options={[
              { label: 'All Statuses', value: 'all' },
              { label: 'Active', value: 'active' },
              { label: 'Suspended', value: 'suspended' }
            ]}
            value="all"
            onChange={() => {}}
            className="min-w-[150px]"
          />
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => { setSearchQuery(''); }}>
            Reset Filters
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            Export
          </Button>
        </FilterBar>

        {/* Data Table */}
        {rosterLoading ? (
          <div className="p-6 space-y-4">
            <SkeletonLoader variant="block" className="h-12 w-full" />
            <SkeletonLoader variant="block" className="h-12 w-full" />
            <SkeletonLoader variant="block" className="h-12 w-full" />
          </div>
        ) : roster.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-muted">{messages.emptyState.noStudents}</p>
          </div>
        ) : filteredRoster.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-muted">No students match your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="table-base w-full min-w-[800px] border-collapse relative text-left">
              <thead className="table-head sticky top-0 z-20 bg-surface shadow-sm">
                <tr>
                  <th className="table-header-cell sticky left-0 z-30 w-12 text-center bg-surface border-b border-border py-2.5 px-4 text-[11px] font-bold uppercase text-muted">
                    <Checkbox
                      checked={selectedRows.size > 0 && selectedRows.size === filteredRoster.length}
                      onChange={toggleAllSelection}
                      label=""
                    />
                  </th>
                  <th className="table-header-cell sticky left-12 z-30 bg-surface border-b border-border py-2.5 px-4 text-[11px] font-bold uppercase text-muted">Student</th>
                  <th className="table-header-cell bg-surface border-b border-border py-2.5 px-4 text-[11px] font-bold uppercase text-muted">Roll Number</th>
                  <th className="table-header-cell bg-surface border-b border-border py-2.5 px-4 text-[11px] font-bold uppercase text-muted">Status</th>
                  <th className="table-header-cell text-right bg-surface pr-6 border-b border-border py-2.5 px-4 text-[11px] font-bold uppercase text-muted">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <AnimatePresence>
                  {filteredRoster.map((student, index) => (
                    <RosterTableRow
                      key={student.id}
                      student={student}
                      index={index}
                      selected={selectedRows.has(student.id)}
                      onToggleSelection={toggleRowSelection}
                      onOpenStudent={openStudentProfile}
                    />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Floating Bulk Actions Toolbar */}
      <AnimatePresence>
        {selectedRows.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-full border border-border bg-surface px-6 py-3 shadow-elevated"
          >
            <span className="text-sm font-semibold text-text">{selectedRows.size} selected</span>
            <div className="h-6 w-px bg-border" />
            <Button size="sm" variant="outline" onClick={() => dummyAction("Assign Section")}>
              Assign Section
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportCSV}>
              Export
            </Button>
            <Button size="sm" variant="danger" onClick={() => dummyAction("Delete Students")}>
              Delete
            </Button>
            <IconButton icon={
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
            } label="Clear selection" onClick={() => setSelectedRows(new Set())} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* CSV Import Modal (Overlay) */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => setShowImportModal(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-card border border-border bg-surface shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-muted/30">
                <div>
                  <h2 className="text-xl font-semibold text-text">Import CSV Roster</h2>
                  <p className="text-xs text-muted mt-1">Replaces existing roster for the selected section.</p>
                </div>
                <IconButton icon={
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
                } label="Close" onClick={() => setShowImportModal(false)} />
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="modal-section" className="text-sm font-medium text-text">Target Section</label>
                  <Select
                    id="modal-section"
                    options={sections.map(s => ({ label: formatSectionLabel(s), value: s.id }))}
                    value={sectionId}
                    onChange={(e) => { resetFeedback(); setIsConfirming(false); setSectionId(e.target.value); }}
                    className="w-full"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="roster-file" className="text-sm font-medium text-text">Upload File (.csv)</label>
                  <input
                    id="roster-file"
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-muted file:mr-3 file:rounded-button file:border-0 file:bg-accent/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent hover:file:bg-accent/20"
                  />
                  {fileName && <p className="text-xs text-emerald-600 font-medium">Loaded: {fileName}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="roster-text" className="text-sm font-medium text-text">Or Paste CSV Content</label>
                  <textarea
                    id="roster-text"
                    value={csvText}
                    onChange={handleTextChange}
                    rows={4}
                    placeholder={'enrollment,name\n0131CS241000,Aarav Mehta'}
                    className={inputClass + ' font-mono text-xs leading-relaxed'}
                  />
                </div>

                {csvText.trim() !== '' && (
                  <div className="bg-surface-muted rounded-card p-4 border border-border">
                    <div className="flex items-center gap-3 mb-3">
                      <Badge tone="success">{valid.length} Valid Rows</Badge>
                      <Badge tone="danger">{rejected.length} Rejected Rows</Badge>
                    </div>

                    {rejected.length > 0 && <RejectedRowList rejected={rejected} />}
                    {valid.length > 0 && rejected.length === 0 && (
                      <p className="text-sm text-emerald-700">All {valid.length} rows parsed successfully and are ready to import.</p>
                    )}
                  </div>
                )}

                {errorMessage && <Alert tone="danger" title="Import Error">{errorMessage}</Alert>}
                {successMessage && <Alert tone="success" title="Success">{successMessage}</Alert>}
              </div>

              <div className="border-t border-border px-6 py-4 bg-surface-muted/30">
                {!isConfirming ? (
                  <div className="flex justify-end gap-3">
                    <Button variant="secondary" onClick={() => setShowImportModal(false)}>Cancel</Button>
                    <Button variant="primary" disabled={!canImport} onClick={handleRequestImport}>Review Import</Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-red-600 max-w-sm leading-tight">
                      Are you sure? This will permanently replace all existing students in {sectionName}.
                    </p>
                    <div className="flex justify-end gap-2 shrink-0">
                      <Button variant="secondary" onClick={() => setIsConfirming(false)} disabled={isImporting}>Cancel</Button>
                      <Button variant="danger" loading={isImporting} onClick={() => void handleConfirmImport()}>Yes, Replace</Button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Student Profile Drawer */}
      <AnimatePresence>
        {selectedStudent && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setSelectedStudent(null)}
            />
            {/* Drawer Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface shadow-2xl overflow-y-auto border-l border-border"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-muted/30 sticky top-0 z-10">
                <h2 className="text-lg font-semibold text-text">Student Profile</h2>
                <IconButton icon={
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
                } label="Close drawer" onClick={() => setSelectedStudent(null)} />
              </div>

              <div className="flex-1 p-6 space-y-8">
                {/* Header Info */}
                <div className="flex items-center gap-5">
                  <Avatar name={selectedStudent.name} size="lg" className="h-20 w-20 text-2xl shadow-sm" />
                  <div>
                    <h1 className="text-2xl font-bold text-text leading-tight">{selectedStudent.name}</h1>
                    <p className="text-sm font-mono text-muted mt-1">{selectedStudent.enrollmentNumber || 'No ID'}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge tone="success" size="sm">Active Status</Badge>
                      <Badge tone="neutral" size="sm">{sectionName}</Badge>
                    </div>
                  </div>
                </div>

                {/* Academic Information */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-3 border-b border-border pb-2">Academic Information</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-soft">Program</p>
                      <p className="font-semibold text-text mt-0.5">B.Tech CSE</p>
                    </div>
                    <div>
                      <p className="text-soft">Semester</p>
                      <p className="font-semibold text-text mt-0.5">Semester 5</p>
                    </div>
                    <div>
                      <p className="text-soft">Email</p>
                      <p className="font-semibold text-accent mt-0.5">{selectedStudent.name.toLowerCase().replace(' ', '.')}@edu.in</p>
                    </div>
                    <div>
                      <p className="text-soft">Joined</p>
                      <p className="font-semibold text-text mt-0.5">Aug 2024</p>
                    </div>
                  </div>
                </div>

                {/* Attendance Summary */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-3 border-b border-border pb-2">Attendance Summary</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-surface-muted rounded-lg p-3 text-center border border-border">
                      <p className="text-2xl font-bold text-text">85%</p>
                      <p className="text-xs text-muted mt-1">Overall</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-3 text-center border border-emerald-100">
                      <p className="text-2xl font-bold text-emerald-700">34</p>
                      <p className="text-xs text-emerald-600 mt-1">Present</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3 text-center border border-red-100">
                      <p className="text-2xl font-bold text-red-700">6</p>
                      <p className="text-xs text-red-600 mt-1">Absent</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-text">Subject Attendance Threshold</span>
                      <span className="text-emerald-600 font-bold">Good Standing</span>
                    </div>
                    <div className="h-1.5 w-full bg-surface-muted rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 w-[85%] rounded-full" />
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-3 border-b border-border pb-2">Quick Actions</h3>
                  <div className="flex flex-col gap-2">
                    <Button variant="outline" className="justify-start w-full" onClick={() => dummyAction('View Full Profile')}>View Full Academic Record</Button>
                    <Button variant="outline" className="justify-start w-full" onClick={() => dummyAction('Send Email')}>Email Student</Button>
                    <Button variant="outline" className="justify-start w-full text-red-600 hover:bg-red-50 hover:border-red-200" onClick={() => dummyAction('Suspend Student')}>Suspend Account</Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        <AnimatePresence>
          {successMessage && !showImportModal && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <Toast title="Success" message={successMessage} tone="success" onClose={() => setSuccessMessage(null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RejectedRowList({ rejected }: { rejected: readonly RejectedRosterRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-red-200 mt-3 max-h-48 overflow-y-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-red-50 sticky top-0">
          <tr>
            <th className="px-3 py-2 font-semibold text-red-800">Line</th>
            <th className="px-3 py-2 font-semibold text-red-800">Content</th>
            <th className="px-3 py-2 font-semibold text-red-800">Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-red-100">
          {rejected.map((row) => (
            <tr key={row.line}>
              <td className="px-3 py-2 text-red-900/60 font-medium">{row.line}</td>
              <td className="px-3 py-2 font-mono text-red-900">{row.raw.trim() || '(blank)'}</td>
              <td className="px-3 py-2 text-red-800">{row.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
