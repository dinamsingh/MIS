import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFileStorage, type UploadRequest } from './fileStorage';
import type { CloudinaryConfig } from './config';
import { isOk, isErr } from '../../domain/shared/result';
import type { UploadPolicy } from '../../domain/services/storageRouter';

const policy: UploadPolicy = {
  allowedTypes: ['application/pdf', 'image/png'],
  maxSizeBytes: 5 * 1024 * 1024,
};

const cloudinary: CloudinaryConfig = {
  cloudName: 'demo-cloud',
  uploadPreset: 'public_preset',
};

interface InsertedRow {
  category: string;
  storage_type: string;
  url_or_path: string;
  mime_type: string;
  size_bytes: number;
}

/**
 * Build a fake Supabase client that records the rows inserted into `files` and
 * the Storage operations performed, so the routing/recording orchestration can
 * be asserted without real network access.
 */
function makeFakeClient(opts: {
  uploadError?: boolean;
  signedUrlError?: boolean;
  insertError?: boolean;
} = {}) {
  const inserted: InsertedRow[] = [];
  const uploadedPaths: string[] = [];
  const signedFor: string[] = [];

  const storageBucket = {
    upload: vi.fn(async (path: string) => {
      uploadedPaths.push(path);
      return opts.uploadError
        ? { data: null, error: { message: 'upload boom' } }
        : { data: { path }, error: null };
    }),
    createSignedUrl: vi.fn(async (path: string) => {
      signedFor.push(path);
      return opts.signedUrlError
        ? { data: null, error: { message: 'signed boom' } }
        : { data: { signedUrl: `https://signed.example/${path}?token=abc` }, error: null };
    }),
  };

  const client = {
    storage: {
      from: vi.fn(() => storageBucket),
    },
    from: vi.fn(() => ({
      insert: (row: InsertedRow) => ({
        select: () => ({
          single: async () => {
            if (opts.insertError) {
              return { data: null, error: { message: 'insert boom' } };
            }
            inserted.push(row);
            return { data: { id: `file-${inserted.length}` }, error: null };
          },
        }),
      }),
    })),
  } as unknown as SupabaseClient;

  return { client, inserted, uploadedPaths, signedFor, storageBucket };
}

function makeRequest(over: Partial<UploadRequest> = {}): UploadRequest {
  return {
    category: 'exam-pdf',
    data: new Blob(['content']),
    fileName: 'midterm.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    policy,
    ...over,
  };
}

describe('createFileStorage.uploadFile', () => {
  it('routes a sensitive file to the private bucket and returns a signed URL', async () => {
    const fake = makeFakeClient();
    const storage = createFileStorage({
      client: fake.client,
      cloudinary,
      generateId: () => 'fixed-id',
    });

    const result = await storage.uploadFile(makeRequest({ category: 'exam-pdf' }));

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.storageType).toBe('supabase');
      expect(result.value.url).toContain('signed.example');
      expect(result.value.storedPath).toBe('exam-pdf/fixed-id-midterm.pdf');
    }
    // Records storage_type 'supabase' and the object path, not the signed URL.
    expect(fake.inserted).toHaveLength(1);
    expect(fake.inserted[0].storage_type).toBe('supabase');
    expect(fake.inserted[0].url_or_path).toBe('exam-pdf/fixed-id-midterm.pdf');
    expect(fake.uploadedPaths).toEqual(['exam-pdf/fixed-id-midterm.pdf']);
  });

  it('routes a public/heavy file to Cloudinary and returns the CDN URL', async () => {
    const fake = makeFakeClient();
    const fetchFn = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        ({
          ok: true,
          json: async () => ({ secure_url: 'https://res.cloudinary.com/demo/abc.pdf' }),
        }) as unknown as Response,
    );
    const storage = createFileStorage({ client: fake.client, cloudinary, fetchFn });

    const result = await storage.uploadFile(makeRequest({ category: 'study-material' }));

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.storageType).toBe('cloudinary');
      expect(result.value.url).toBe('https://res.cloudinary.com/demo/abc.pdf');
    }
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchFn.mock.calls[0][0]);
    expect(calledUrl).toContain('demo-cloud');
    // Records storage_type 'cloudinary' and the CDN URL as url_or_path.
    expect(fake.inserted[0].storage_type).toBe('cloudinary');
    expect(fake.inserted[0].url_or_path).toBe('https://res.cloudinary.com/demo/abc.pdf');
    // No Supabase Storage upload happened for a Cloudinary-bound file.
    expect(fake.uploadedPaths).toHaveLength(0);
  });

  it('rejects a disallowed file type before any I/O', async () => {
    const fake = makeFakeClient();
    const fetchFn = vi.fn();
    const storage = createFileStorage({ client: fake.client, cloudinary, fetchFn });

    const result = await storage.uploadFile(
      makeRequest({ mimeType: 'application/x-msdownload' }),
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('file-type-not-allowed');
    expect(fake.inserted).toHaveLength(0);
    expect(fake.uploadedPaths).toHaveLength(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects an oversized file before any I/O', async () => {
    const fake = makeFakeClient();
    const storage = createFileStorage({ client: fake.client, cloudinary });

    const result = await storage.uploadFile(
      makeRequest({ category: 'study-material', sizeBytes: 5 * 1024 * 1024 + 1 }),
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('file-too-large');
    expect(fake.inserted).toHaveLength(0);
  });

  it('returns a storage error and records nothing when the private-bucket upload fails', async () => {
    const fake = makeFakeClient({ uploadError: true });
    const storage = createFileStorage({ client: fake.client, cloudinary });

    const result = await storage.uploadFile(makeRequest({ category: 'answer-key' }));

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('supabase-upload-failed');
    expect(fake.inserted).toHaveLength(0);
  });

  it('returns a storage error when a signed URL cannot be minted', async () => {
    const fake = makeFakeClient({ signedUrlError: true });
    const storage = createFileStorage({ client: fake.client, cloudinary });

    const result = await storage.uploadFile(makeRequest({ category: 'student-document' }));

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('signed-url-failed');
    expect(fake.inserted).toHaveLength(0);
  });

  it('returns a storage error when Cloudinary responds without a secure_url', async () => {
    const fake = makeFakeClient();
    const fetchFn = vi.fn(
      async () => ({ ok: true, json: async () => ({}) }) as unknown as Response,
    );
    const storage = createFileStorage({ client: fake.client, cloudinary, fetchFn });

    const result = await storage.uploadFile(makeRequest({ category: 'notes' }));

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('cloudinary-upload-failed');
    expect(fake.inserted).toHaveLength(0);
  });

  it('surfaces a metadata error when recording the files row fails', async () => {
    const fake = makeFakeClient({ insertError: true });
    const storage = createFileStorage({ client: fake.client, cloudinary });

    const result = await storage.uploadFile(makeRequest({ category: 'marks-export' }));

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('metadata-insert-failed');
  });
});

describe('createFileStorage.getSignedUrl', () => {
  it('mints a fresh signed URL for a stored private-bucket path', async () => {
    const fake = makeFakeClient();
    const storage = createFileStorage({ client: fake.client, cloudinary });

    const result = await storage.getSignedUrl('exam-pdf/abc.pdf', 120);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toContain('signed.example');
    expect(fake.signedFor).toContain('exam-pdf/abc.pdf');
  });

  it('returns a storage error when the signed URL cannot be created', async () => {
    const fake = makeFakeClient({ signedUrlError: true });
    const storage = createFileStorage({ client: fake.client, cloudinary });

    const result = await storage.getSignedUrl('exam-pdf/abc.pdf');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('signed-url-failed');
  });
});
