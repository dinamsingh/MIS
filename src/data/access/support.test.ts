/**
 * Unit tests for the shared data-access error helpers (`support.ts`).
 *
 * These are the funnel every wrapper's reads/writes pass through, so their
 * behavior is correctness-critical: a success must return the payload verbatim,
 * a "no rows" success must surface as `null`/`[]` (never an error), and any
 * Postgrest error must become a typed {@link DataAccessError} carrying the
 * original message and code. No Supabase client is needed — the functions
 * operate on the plain `{ data, error }` response shape.
 */
import { describe, expect, it } from 'vitest';
import type { PostgrestError } from '@supabase/supabase-js';
import { DataAccessError, unwrap, unwrapList, expectOk } from './support';

/**
 * Build a minimal Postgrest-error object. `unwrap`/`expectOk` only read
 * `message` and `code`, but the full shape is provided so the cast is honest.
 */
function pgError(message: string, code: string): PostgrestError {
  return { name: 'PostgrestError', message, details: '', hint: '', code } as PostgrestError;
}

describe('unwrap', () => {
  it('returns the data on a successful response', () => {
    const payload = { id: 'quiz-1', title: 'Intro' };
    expect(unwrap({ data: payload, error: null })).toBe(payload);
  });

  it('returns null when a successful query returns no data', () => {
    expect(unwrap({ data: null, error: null })).toBeNull();
  });

  it('throws a DataAccessError carrying the message and code when error is non-null', () => {
    const response = { data: null, error: pgError('roster row not found', 'PGRST116') };

    let caught: unknown;
    try {
      unwrap(response);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DataAccessError);
    expect((caught as DataAccessError).name).toBe('DataAccessError');
    expect((caught as DataAccessError).message).toBe('roster row not found');
    expect((caught as DataAccessError).code).toBe('PGRST116');
  });

  it('still throws on an error even when data is also present', () => {
    // The error field is authoritative: a non-null error always throws,
    // regardless of any accompanying data.
    expect(() => unwrap({ data: [{ id: 'x' }], error: pgError('partial failure', '500') })).toThrow(
      DataAccessError,
    );
  });
});

describe('unwrapList', () => {
  it('returns the array on a successful list response', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    expect(unwrapList({ data: rows, error: null })).toBe(rows);
  });

  it('normalizes a null payload to an empty array', () => {
    expect(unwrapList({ data: null, error: null })).toEqual([]);
  });

  it('propagates a Postgrest error as a DataAccessError (does not swallow it into [])', () => {
    let caught: unknown;
    try {
      unwrapList({ data: null, error: pgError('rls denied', '42501') });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DataAccessError);
    expect((caught as DataAccessError).code).toBe('42501');
  });
});

describe('expectOk', () => {
  it('is a no-op (returns undefined, does not throw) on success', () => {
    expect(expectOk({ error: null })).toBeUndefined();
    expect(() => expectOk({ error: null })).not.toThrow();
  });

  it('throws a DataAccessError with the code on a failed write', () => {
    let caught: unknown;
    try {
      expectOk({ error: pgError('duplicate key value violates unique constraint', '23505') });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DataAccessError);
    expect((caught as DataAccessError).message).toBe(
      'duplicate key value violates unique constraint',
    );
    expect((caught as DataAccessError).code).toBe('23505');
  });
});

describe('DataAccessError', () => {
  it('leaves code undefined when none is provided', () => {
    const error = new DataAccessError('no code here');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DataAccessError');
    expect(error.code).toBeUndefined();
  });
});
