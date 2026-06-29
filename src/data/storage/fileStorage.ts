/**
 * Hybrid file storage integration (Requirements 16.2, 16.3, 16.4, 10.1, 10.2).
 *
 * This is the data-access layer that sits on top of the pure
 * {@link routeStorage}/{@link validateUpload} domain functions and performs the
 * actual I/O:
 *
 *  - Sensitive categories (marks exports, exam PDFs, answer keys, student
 *    documents) are uploaded to a **private Supabase Storage bucket** and
 *    accessed only through a **time-limited signed URL** (Req 16.2, 16.4).
 *  - Public/heavy categories (study material, notes, images, experiment PDFs,
 *    assignment files) are uploaded **directly to Cloudinary** and served from
 *    its CDN without authentication (Req 16.3, 10.1, 10.2).
 *  - Every successful upload records a row in the `files` table capturing
 *    `storage_type` (`'supabase'` | `'cloudinary'`), so the store of record is
 *    always known (Req 16.1, 16.2, 16.3).
 *
 * All external boundaries (the Supabase client, the Cloudinary config, and the
 * `fetch` used to talk to Cloudinary) are injected via {@link FileStorageDeps}
 * so the routing/recording orchestration can be exercised without real network
 * access. The shipped singleton, {@link fileStorage}, wires these to the shared
 * Supabase client and the build-time Cloudinary configuration.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { type Result, ok, err } from '../../domain/shared/result';
import type { StorageType, ValidationError } from '../../domain/shared/types';
import { messages } from '../../domain/shared/messages';
import {
  routeStorage,
  validateUpload,
  type FileCategory,
  type UploadPolicy,
} from '../../domain/services/storageRouter';
import {
  readCloudinaryConfig,
  type CloudinaryConfig,
  SUPABASE_PRIVATE_BUCKET,
  DEFAULT_SIGNED_URL_TTL_SECONDS,
} from './config';

/** An infrastructure (non user-correctable) failure from a storage operation. */
export interface StorageError {
  readonly code:
    | 'supabase-upload-failed'
    | 'signed-url-failed'
    | 'cloudinary-upload-failed'
    | 'metadata-insert-failed';
  /** English, surfaceable message (Requirement 20.1). */
  readonly message: string;
}

/** The union of failures an upload can produce: validation or infrastructure. */
export type UploadFailure = ValidationError | StorageError;

/** A request to store a file, before any routing or I/O has happened. */
export interface UploadRequest {
  /** The file category, used to route the file to the correct store. */
  readonly category: FileCategory;
  /** The binary payload to upload. */
  readonly data: Blob;
  /** The original file name, used to build the stored object path. */
  readonly fileName: string;
  /** The file's MIME type, validated against the policy and recorded. */
  readonly mimeType: string;
  /** The file size in bytes, validated against the policy and recorded. */
  readonly sizeBytes: number;
  /** The allowlist + maximum-size policy the upload must satisfy. */
  readonly policy: UploadPolicy;
}

/** The outcome of a successful upload. */
export interface UploadedFile {
  /** The id of the recorded `files` row. */
  readonly fileId: string;
  /** Which store the file was routed to and recorded under. */
  readonly storageType: StorageType;
  /**
   * A usable URL for the file: a freshly-minted time-limited signed URL for
   * Supabase private-bucket files, or the direct CDN URL for Cloudinary files.
   */
  readonly url: string;
  /**
   * The value persisted in `files.url_or_path`: the object path within the
   * private bucket for Supabase (so signed URLs can be regenerated later), or
   * the direct CDN URL for Cloudinary.
   */
  readonly storedPath: string;
}

/** The external boundaries the storage module depends on. */
export interface FileStorageDeps {
  /** Supabase client used for Storage uploads, signed URLs, and the files table. */
  readonly client: SupabaseClient;
  /** Resolved Cloudinary configuration for direct uploads. */
  readonly cloudinary: CloudinaryConfig;
  /** The private bucket name for sensitive files. */
  readonly privateBucket?: string;
  /** Default signed-URL lifetime, in seconds. */
  readonly signedUrlTtlSeconds?: number;
  /** `fetch` implementation used to talk to the Cloudinary upload API. */
  readonly fetchFn?: typeof fetch;
  /** Generator for unique object keys; injectable for deterministic tests. */
  readonly generateId?: () => string;
}

/** A minimal shape of the JSON Cloudinary returns from an upload. */
interface CloudinaryUploadResponse {
  readonly secure_url?: string;
  readonly error?: { readonly message?: string };
}

/** Replace path-hostile characters in a file name so it is safe as an object key. */
function sanitizeFileName(name: string): string {
  const cleaned = name.trim().replace(/[^A-Za-z0-9._-]+/g, '_');
  return cleaned.length > 0 ? cleaned : 'file';
}

/** Default unique-id generator, using the platform crypto UUID when available. */
function defaultGenerateId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) {
    return g.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * A file storage facade bound to a concrete set of dependencies. Created via
 * {@link createFileStorage}; the application uses the shared {@link fileStorage}
 * singleton.
 */
export interface FileStorage {
  /**
   * Validate, route, upload, and record a file in one operation
   * (Requirements 16.2, 16.3, 10.1).
   *
   * The upload is first validated against its policy; a disallowed type or
   * oversized file is rejected with an English {@link ValidationError} before
   * any I/O. The file's category then determines the destination via
   * {@link routeStorage}. On success a `files` row is recorded with the
   * resolved `storage_type` and a usable URL is returned.
   */
  uploadFile(request: UploadRequest): Promise<Result<UploadedFile, UploadFailure>>;

  /**
   * Mint a fresh time-limited signed URL for a sensitive file already stored in
   * the private bucket (Requirement 16.4). The actual authorization (whether
   * the requester may access the object) is enforced server-side by RLS;
   * unauthorized requests fail here (Requirement 16.5).
   */
  getSignedUrl(
    storedPath: string,
    ttlSeconds?: number,
  ): Promise<Result<string, StorageError>>;
}

/**
 * Build a {@link FileStorage} from explicit dependencies. Exposed for testing
 * and for callers that resolve their own configuration.
 */
export function createFileStorage(deps: FileStorageDeps): FileStorage {
  const client = deps.client;
  const cloudinary = deps.cloudinary;
  const bucket = deps.privateBucket ?? SUPABASE_PRIVATE_BUCKET;
  const ttl = deps.signedUrlTtlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
  const fetchFn = deps.fetchFn ?? globalThis.fetch.bind(globalThis);
  const generateId = deps.generateId ?? defaultGenerateId;

  /** Record the files-table row and return its id, or a metadata error. */
  async function recordFile(
    category: FileCategory,
    storageType: StorageType,
    urlOrPath: string,
    mimeType: string,
    sizeBytes: number,
    fileName?: string,
  ): Promise<Result<string, StorageError>> {
    const { data, error } = await client
      .from('files')
      .insert({
        category,
        storage_type: storageType,
        url_or_path: urlOrPath,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        file_name: fileName,
      })
      .select('id')
      .single();

    if (error || !data) {
      return err({
        code: 'metadata-insert-failed',
        message: messages.error.saveFailed,
      });
    }
    return ok((data as { id: string }).id);
  }

  /** Upload a sensitive file to the private bucket and return its object path. */
  async function uploadToSupabase(
    request: UploadRequest,
  ): Promise<Result<{ path: string; url: string }, StorageError>> {
    const path = `${request.category}/${generateId()}-${sanitizeFileName(request.fileName)}`;

    const upload = await client.storage.from(bucket).upload(path, request.data, {
      contentType: request.mimeType,
      upsert: false,
    });
    if (upload.error) {
      return err({
        code: 'supabase-upload-failed',
        message: messages.error.saveFailed,
      });
    }

    const signed = await client.storage.from(bucket).createSignedUrl(path, ttl);
    if (signed.error || !signed.data?.signedUrl) {
      return err({
        code: 'signed-url-failed',
        message: messages.error.saveFailed,
      });
    }

    return ok({ path, url: signed.data.signedUrl });
  }

  /** Upload a public/heavy file directly to Cloudinary and return its CDN URL. */
  async function uploadToCloudinary(
    request: UploadRequest,
  ): Promise<Result<{ path: string; url: string }, StorageError>> {
    // Route by file type: images use the image pipeline; documents (PDF, DOC,
    // PPT, etc.) use the `raw` resource type so Cloudinary serves them as plain
    // downloadable files and does NOT apply the image/PDF delivery restriction
    // that otherwise causes "Failed to load PDF document".
    const isImage = request.mimeType.startsWith('image/');
    const resourceType = isImage ? 'image' : 'raw';
    const endpoint = `https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/${resourceType}/upload`;
    const form = new FormData();
    form.append('file', request.data, request.fileName);
    form.append('upload_preset', cloudinary.uploadPreset);

    let response: Response;
    try {
      response = await fetchFn(endpoint, { method: 'POST', body: form });
    } catch {
      return err({ code: 'cloudinary-upload-failed', message: messages.error.network });
    }

    if (!response.ok) {
      return err({ code: 'cloudinary-upload-failed', message: messages.error.saveFailed });
    }

    let body: CloudinaryUploadResponse;
    try {
      body = (await response.json()) as CloudinaryUploadResponse;
    } catch {
      return err({ code: 'cloudinary-upload-failed', message: messages.error.saveFailed });
    }

    if (!body.secure_url) {
      return err({ code: 'cloudinary-upload-failed', message: messages.error.saveFailed });
    }

    // Cloudinary's CDN URL is itself the stored path and the served URL.
    return ok({ path: body.secure_url, url: body.secure_url });
  }

  return {
    async uploadFile(request) {
      const validation = validateUpload(request.mimeType, request.sizeBytes, request.policy);
      if (!validation.ok) {
        return validation;
      }

      const storageType = routeStorage(request.category);

      const stored =
        storageType === 'supabase'
          ? await uploadToSupabase(request)
          : await uploadToCloudinary(request);

      if (!stored.ok) {
        return stored;
      }

      const recorded = await recordFile(
        request.category,
        storageType,
        stored.value.path,
        request.mimeType,
        request.sizeBytes,
        request.fileName,
      );
      if (!recorded.ok) {
        return recorded;
      }

      return ok({
        fileId: recorded.value,
        storageType,
        url: stored.value.url,
        storedPath: stored.value.path,
      });
    },

    async getSignedUrl(storedPath, ttlSeconds) {
      const signed = await client.storage
        .from(bucket)
        .createSignedUrl(storedPath, ttlSeconds ?? ttl);
      if (signed.error || !signed.data?.signedUrl) {
        return err({ code: 'signed-url-failed', message: messages.error.saveFailed });
      }
      return ok(signed.data.signedUrl);
    },
  };
}

/**
 * Resolve the Cloudinary configuration from the build-time environment, failing
 * fast with a descriptive error if a required value is absent.
 */
function resolveCloudinaryConfigFromEnv(): CloudinaryConfig {
  const result = readCloudinaryConfig(import.meta.env);
  if (!result.ok) {
    const which =
      result.error.kind === 'missing-cloud-name'
        ? 'VITE_CLOUDINARY_CLOUD_NAME'
        : 'VITE_CLOUDINARY_UPLOAD_PRESET';
    throw new Error(`Cloudinary configuration error: ${which} is not set.`);
  }
  return result.value;
}

/**
 * The shared file storage instance for the frontend, wired to the shared
 * Supabase client and the build-time Cloudinary configuration. Both the
 * Supabase client and the Cloudinary config are resolved lazily on first use
 * (via a dynamic import of the client singleton) so that importing this module
 * never triggers client construction or configuration errors at load time.
 */
let singleton: FileStorage | undefined;

async function getSingleton(): Promise<FileStorage> {
  if (!singleton) {
    const { supabase } = await import('../supabase/client');
    singleton = createFileStorage({
      client: supabase,
      cloudinary: resolveCloudinaryConfigFromEnv(),
    });
  }
  return singleton;
}

export const fileStorage: FileStorage = {
  async uploadFile(request) {
    return (await getSingleton()).uploadFile(request);
  },
  async getSignedUrl(storedPath, ttlSeconds) {
    return (await getSingleton()).getSignedUrl(storedPath, ttlSeconds);
  },
};
