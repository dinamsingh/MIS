import { describe, expect, it } from 'vitest';
import {
  routeStorage,
  validateUpload,
  type FileCategory,
  type UploadPolicy,
} from './storageRouter';
import { isOk, isErr } from '../shared/result';

const policy = (over: Partial<UploadPolicy> = {}): UploadPolicy => ({
  allowedTypes: ['application/pdf', 'image/png', 'image/jpeg'],
  maxSizeBytes: 5 * 1024 * 1024,
  ...over,
});

describe('routeStorage', () => {
  const sensitive: FileCategory[] = [
    'marks-export',
    'exam-pdf',
    'answer-key',
    'student-document',
  ];
  const publicHeavy: FileCategory[] = [
    'study-material',
    'notes',
    'image',
    'experiment-pdf',
    'assignment',
  ];

  it('routes every sensitive category to supabase', () => {
    for (const category of sensitive) {
      expect(routeStorage(category)).toBe('supabase');
    }
  });

  it('routes every public/heavy category to cloudinary', () => {
    for (const category of publicHeavy) {
      expect(routeStorage(category)).toBe('cloudinary');
    }
  });

  it('always returns one of the two allowed storage types', () => {
    for (const category of [...sensitive, ...publicHeavy]) {
      expect(['supabase', 'cloudinary']).toContain(routeStorage(category));
    }
  });
});

describe('validateUpload', () => {
  it('accepts an allowed type within the maximum size', () => {
    const r = validateUpload('application/pdf', 1024, policy());
    expect(isOk(r)).toBe(true);
  });

  it('accepts a file exactly at the maximum size', () => {
    const r = validateUpload('image/png', 5 * 1024 * 1024, policy());
    expect(isOk(r)).toBe(true);
  });

  it('rejects a disallowed file type with an English message', () => {
    const r = validateUpload('application/x-msdownload', 10, policy());
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.code).toBe('file-type-not-allowed');
      expect(r.error.message).toBe(
        'This file type is not allowed. Choose a supported file type.',
      );
    }
  });

  it('rejects a file exceeding the maximum size with an English message', () => {
    const r = validateUpload('application/pdf', 5 * 1024 * 1024 + 1, policy());
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.code).toBe('file-too-large');
      expect(r.error.message).toContain('5 MB');
    }
  });

  it('checks the type allowlist before the size limit', () => {
    const r = validateUpload('text/plain', 999 * 1024 * 1024, policy());
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe('file-type-not-allowed');
  });

  it('rejects a non-finite or negative size for an allowed type', () => {
    for (const size of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = validateUpload('application/pdf', size, policy());
      expect(isErr(r)).toBe(true);
      if (isErr(r)) expect(r.error.code).toBe('file-too-large');
    }
  });
});
