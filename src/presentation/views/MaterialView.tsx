/**
 * Material module view (task 22.2).
 *
 * Renders the teacher's study material management surface:
 * - Upload study material with type/size validation via the storageRouter
 *   domain (Requirement 10.1, 10.3)
 * - File is stored in Cloudinary and a direct CDN link is generated
 *   (Requirement 10.1)
 * - CDN links are served without auth — anyone with the link can access the
 *   material (Requirement 10.2)
 * - List of uploaded study material with each item's shareable link
 *   (Requirement 10.4)
 *
 * All persistence is delegated to an injected {@link MaterialPersistence} prop
 * interface so the view remains testable without a live network.
 *
 * _Requirements: 10.1, 10.2, 10.3, 10.4_
 */

import { useCallback, useEffect, useState, useRef, type FormEvent } from 'react';
import { messages } from '@domain/shared/messages';
import {
  validateUpload,
  type UploadPolicy,
} from '@domain/services/storageRouter';
import { CardGridSkeleton } from '@presentation/components/skeletons';

// ---------------------------------------------------------------------------
// Data interfaces
// ---------------------------------------------------------------------------

/** A single uploaded material item as stored in persistence. */
export interface MaterialItem {
  /** Unique identifier for the material entry. */
  readonly id: string;
  /** Original file name for display. */
  readonly fileName: string;
  /** MIME type of the uploaded file. */
  readonly mimeType: string;
  /** File size in bytes. */
  readonly sizeBytes: number;
  /** Direct CDN link (Cloudinary) for unauthenticated access (Req 10.2). */
  readonly url: string;
  /** Upload timestamp ISO string. */
  readonly createdAt: string;
}

/** The persistence/data slice this view needs. */
export interface MaterialPersistence {
  /**
   * Upload a study material file. The implementation is expected to route the
   * file to Cloudinary (category 'study-material') and record the metadata.
   * Returns the created MaterialItem on success.
   */
  uploadMaterial(file: File): Promise<MaterialItem>;
  /** Load all previously uploaded material entries. */
  loadMaterials(): Promise<MaterialItem[]>;
}

export interface MaterialViewProps {
  /** Data persistence layer (Supabase/Cloudinary-backed in production). */
  persistence: MaterialPersistence;
  /**
   * The upload policy defining allowed types and max size. The view uses this
   * to validate client-side before attempting the upload (Req 10.3).
   */
  policy?: UploadPolicy;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default upload policy for study material. */
const DEFAULT_POLICY: UploadPolicy = {
  allowedTypes: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
  ],
  maxSizeBytes: 10 * 1024 * 1024, // 10 MB
};

const BYTES_PER_MB = 1024 * 1024;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < BYTES_PER_MB) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Derive a short file-type badge label from MIME type. */
function getTypeBadge(mimeType: string): { label: string; color: string } {
  if (mimeType === 'application/pdf') return { label: 'PDF', color: 'bg-red-100 text-red-700' };
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint'))
    return { label: 'PPT', color: 'bg-orange-100 text-orange-700' };
  if (mimeType.includes('word') || mimeType === 'application/msword')
    return { label: 'DOC', color: 'bg-blue-100 text-blue-700' };
  if (mimeType.startsWith('image/')) return { label: 'IMG', color: 'bg-emerald-100 text-emerald-700' };
  if (mimeType === 'text/plain') return { label: 'TXT', color: 'bg-gray-100 text-gray-700' };
  return { label: 'FILE', color: 'bg-gray-100 text-gray-600' };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Teacher study material upload and listing. */
export default function MaterialView({
  persistence,
  policy = DEFAULT_POLICY,
}: MaterialViewProps) {
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [showUploadForm, setShowUploadForm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing materials on mount.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const items = await persistence.loadMaterials();
        if (!cancelled) {
          setMaterials(items);
        }
      } catch {
        if (!cancelled) {
          setLoadError(messages.error.generic);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [persistence]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setValidationError(null);
      setUploadError(null);
      const file = event.target.files?.[0] ?? null;
      if (!file) {
        setSelectedFile(null);
        return;
      }

      // Client-side validation using the domain storageRouter (Req 10.3).
      const result = validateUpload(file.type, file.size, policy);
      if (!result.ok) {
        setValidationError(result.error.message);
        setSelectedFile(null);
        // Reset the file input so user can re-select.
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      setSelectedFile(file);
    },
    [policy],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedFile) return;

      // Double-check validation before upload.
      const result = validateUpload(selectedFile.type, selectedFile.size, policy);
      if (!result.ok) {
        setValidationError(result.error.message);
        return;
      }

      setIsUploading(true);
      setUploadError(null);
      try {
        const item = await persistence.uploadMaterial(selectedFile);
        setMaterials((prev) => [item, ...prev]);
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setShowUploadForm(false);
      } catch {
        setUploadError(messages.error.saveFailed);
      } finally {
        setIsUploading(false);
      }
    },
    [selectedFile, persistence, policy],
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <header className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text">Study Material</h2>
          <p className="mt-1 text-sm text-muted">
            Share notes &amp; slides via link
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowUploadForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          <span className="text-base leading-none">+</span> Upload
        </button>
      </header>

      {/* Upload form — shown when toggled */}
      {showUploadForm && (
        <form
          className="rounded-xl border border-border bg-surface p-6 shadow-sm"
          onSubmit={handleSubmit}
          noValidate
        >
          <h3 className="text-sm font-semibold text-text">Upload new material</h3>
          <p className="mt-1 text-xs text-muted">
            Max {policy.maxSizeBytes / BYTES_PER_MB} MB · PDF, images, Word,
            PowerPoint, plain text.
          </p>

          <div className="mt-4">
            <input
              id="material-file"
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent hover:file:bg-accent/20"
              aria-describedby="material-file-hint"
            />
          </div>

          {validationError !== null && (
            <p role="alert" className="mt-3 text-sm font-medium text-red-600">
              {validationError}
            </p>
          )}

          {uploadError !== null && (
            <p role="alert" className="mt-3 text-sm font-medium text-red-600">
              {uploadError}
            </p>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-accent/90 disabled:opacity-50"
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? 'Uploading…' : 'Upload'}
            </button>
            <button
              type="button"
              onClick={() => setShowUploadForm(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted transition hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Material list — card tiles */}
      <section>
        {isLoading && (
          <CardGridSkeleton cards={6} />
        )}

        {loadError !== null && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {loadError}
          </p>
        )}

        {!isLoading && loadError === null && materials.length === 0 && (
          <p className="text-sm text-muted">
            {messages.emptyState.noMaterial}
          </p>
        )}

        {!isLoading && materials.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {materials.map((item) => {
              const badge = getTypeBadge(item.mimeType);
              return (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm transition hover:border-accent/40 hover:shadow-md"
                  aria-label={`Open ${item.fileName}`}
                >
                  {/* File type badge */}
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${badge.color}`}
                  >
                    {badge.label}
                  </span>

                  {/* File info */}
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-text group-hover:text-accent">
                      {item.fileName}
                    </span>
                    <span className="text-xs text-muted">
                      {formatFileSize(item.sizeBytes)} · {formatDate(item.createdAt)}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
