/**
 * CSV Roster Import view (task: CSV Roster Import).
 *
 * The teacher-facing surface for importing a class roster exported from the
 * college ERP. The teacher:
 *  - picks the section the roster belongs to,
 *  - pastes the CSV text or uploads a `.csv` file (header `enrollment,name`),
 *  - reviews a live preview of valid vs rejected rows (each rejection has an
 *    English reason), and
 *  - imports — after an explicit confirmation step, because importing REPLACES
 *    all existing students for the section.
 *
 * Parsing is delegated to the pure {@link parseRosterCsv} domain function and
 * persistence to an injected {@link RosterImportPersistence} slice, so the view
 * renders and previews without any live network (Supabase is wired in the
 * connected page).
 *
 * Requirements: 2.1, 2.2, 20.1 (professional English).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { messages } from '@domain/shared/messages';
import {
  parseRosterCsv,
  type ParsedRosterRow,
  type RejectedRosterRow,
} from '@domain/services/rosterImportService';
import { formatSectionLabel } from '@presentation/format/sectionLabel';
import type { RosterImportSummary } from '@data/access/rosterImportAccess';

// ---------------------------------------------------------------------------
// Props / data interfaces
// ---------------------------------------------------------------------------

/** A selectable section option (id + human label) for the section picker. */
export interface RosterSectionOption {
  readonly id: string;
  readonly name: string;
  readonly batch?: string | null;
  readonly semester?: string | null;
  readonly department?: string | null;
}

/** The persistence slice this view needs (Supabase-backed in production). */
export interface RosterImportPersistence {
  /**
   * Replace the entire roster for the given section with the parsed rows.
   * Resolves with a summary of what changed.
   */
  importRoster(
    sectionId: string,
    rows: readonly ParsedRosterRow[],
  ): Promise<RosterImportSummary>;
}

export interface RosterViewProps {
  /** Data persistence layer (Supabase-backed in production). */
  persistence: RosterImportPersistence;
  /** Sections the teacher can import into; the first is selected initially. */
  sections: readonly RosterSectionOption[];
}

// ---------------------------------------------------------------------------
// Styling tokens (match the existing views)
// ---------------------------------------------------------------------------

const inputClass =
  'w-full rounded-button border border-border bg-surface px-3 py-2 text-sm text-text ' +
  'placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Teacher CSV roster import surface. */
export default function RosterView({ persistence, sections }: RosterViewProps) {
  const [sectionId, setSectionId] = useState<string>(sections[0]?.id ?? '');
  const [csvText, setCsvText] = useState<string>('');
  const [fileName, setFileName] = useState<string | null>(null);

  const [isConfirming, setIsConfirming] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sections.length === 0) {
      setSectionId('');
      return;
    }
    if (!sections.some((section) => section.id === sectionId)) {
      setSectionId(sections[0].id);
    }
  }, [sections, sectionId]);

  // Live parse of the current CSV text (pure, cheap, memoised).
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

  const handleTextChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      resetFeedback();
      setIsConfirming(false);
      setFileName(null);
      setCsvText(event.target.value);
    },
    [resetFeedback],
  );

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      resetFeedback();
      setIsConfirming(false);
      const file = event.target.files?.[0] ?? null;
      if (!file) {
        return;
      }
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        setCsvText(typeof reader.result === 'string' ? reader.result : '');
      };
      reader.onerror = () => {
        setErrorMessage(messages.error.generic);
      };
      reader.readAsText(file);
    },
    [resetFeedback],
  );

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
    // Importing deletes existing section data — require an explicit confirm.
    setIsConfirming(true);
  }, [resetFeedback, sectionId, valid.length]);

  const handleCancelImport = useCallback(() => {
    setIsConfirming(false);
  }, []);

  const handleConfirmImport = useCallback(async () => {
    setIsImporting(true);
    setErrorMessage(null);
    try {
      const summary = await persistence.importRoster(sectionId, valid);
      setSuccessMessage(messages.rosterImport.importSucceeded(summary.imported));
      // Clear the input so the destructive action cannot be repeated by accident.
      setCsvText('');
      setFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch {
      setErrorMessage(messages.rosterImport.importFailed);
    } finally {
      setIsImporting(false);
      setIsConfirming(false);
    }
  }, [persistence, sectionId, valid]);

  return (
    <section className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-text">Roster Import</h2>
          <p className="mt-1 text-sm text-muted">
            Import a class roster from a CSV exported from the college ERP.
          </p>
        </div>
      </header>

      {/* Step 1 — choose section + provide CSV */}
      <div className="card flex flex-col gap-5 px-6 py-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="roster-section" className="text-sm font-medium text-soft">
            Section
          </label>
          {sections.length > 0 ? (
            <select
              id="roster-section"
              value={sectionId}
              onChange={(event) => {
                resetFeedback();
                setIsConfirming(false);
                setSectionId(event.target.value);
              }}
              className={inputClass + ' w-auto min-w-[200px]'}
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {formatSectionLabel(section)}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-soft">No sections available to import into.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="roster-file" className="text-sm font-medium text-soft">
            Upload a .csv file
          </label>
          <input
            id="roster-file"
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent hover:file:bg-accent/20"
          />
          {fileName !== null && (
            <p className="text-xs text-muted">Loaded from {fileName}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="roster-text" className="text-sm font-medium text-soft">
            …or paste CSV text
          </label>
          <textarea
            id="roster-text"
            value={csvText}
            onChange={handleTextChange}
            rows={6}
            placeholder={'enrollment,name\n0131CS241000,Aarav Mehta'}
            className={inputClass + ' font-mono'}
          />
          <p className="text-xs text-muted">
            Expected header: <span className="font-mono">enrollment,name</span>
          </p>
        </div>
      </div>

      {/* Step 2 — preview */}
      {csvText.trim() !== '' && (
        <div className="card flex flex-col gap-4 px-6 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
              {valid.length} valid
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
              {rejected.length} rejected
            </span>
          </div>

          {valid.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-background">
                  <tr>
                    <th className="px-4 py-2 font-medium text-soft">Enrollment</th>
                    <th className="px-4 py-2 font-medium text-soft">Name</th>
                  </tr>
                </thead>
                <tbody>
                  {valid.map((row) => (
                    <tr key={row.enrollmentNumber} className="border-t border-border/50">
                      <td className="px-4 py-2 font-mono text-text">{row.enrollmentNumber}</td>
                      <td className="px-4 py-2 text-text">{row.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rejected.length > 0 && <RejectedRowList rejected={rejected} />}
        </div>
      )}

      {/* Feedback */}
      {successMessage !== null && (
        <p role="status" className="text-sm font-medium text-emerald-700">
          {successMessage}
        </p>
      )}
      {errorMessage !== null && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {errorMessage}
        </p>
      )}

      {/* Step 3 — import / confirmation */}
      {!isConfirming ? (
        <div>
          <button
            type="button"
            onClick={handleRequestImport}
            disabled={!canImport}
            className="btn-primary disabled:opacity-50"
          >
            Import {valid.length > 0 ? `${valid.length} student${valid.length === 1 ? '' : 's'}` : 'roster'}
          </button>
        </div>
      ) : (
        <div className="card flex flex-col gap-4 border-red-200 bg-red-50/60 px-6 py-5">
          <div>
            <h3 className="text-sm font-semibold text-red-700">Confirm replace import</h3>
            <p className="mt-1 text-sm text-soft">
              This will permanently delete the existing students in{' '}
              <span className="font-medium text-text">{sectionName}</span> and replace
              them with the {valid.length} valid row{valid.length === 1 ? '' : 's'} above.
              This action cannot be undone.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleConfirmImport()}
              disabled={isImporting}
              className="btn bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isImporting ? 'Importing…' : 'Yes, replace roster'}
            </button>
            <button
              type="button"
              onClick={handleCancelImport}
              disabled={isImporting}
              className="btn-secondary disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Renders the rejected rows with their line number and English reason. */
function RejectedRowList({ rejected }: { rejected: readonly RejectedRosterRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-red-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-red-50">
          <tr>
            <th className="px-4 py-2 font-medium text-red-700">Line</th>
            <th className="px-4 py-2 font-medium text-red-700">Content</th>
            <th className="px-4 py-2 font-medium text-red-700">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rejected.map((row) => (
            <tr key={row.line} className="border-t border-red-100">
              <td className="px-4 py-2 text-soft">{row.line}</td>
              <td className="px-4 py-2 font-mono text-text">{row.raw.trim() || '(blank)'}</td>
              <td className="px-4 py-2 text-soft">{row.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
