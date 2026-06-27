import { describe, expect, it } from 'vitest';
import { ok, err, isOk, isErr, map, mapError, unwrapOr } from './result';
import { messages } from './messages';
import { parseBooleanFlag, featureFlags, isFeatureEnabled } from '../featureFlags';

describe('Result type', () => {
  it('constructs and narrows success values', () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (isOk(r)) {
      expect(r.value).toBe(42);
    }
  });

  it('constructs and narrows failures', () => {
    const r = err('bad');
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
    if (isErr(r)) {
      expect(r.error).toBe('bad');
    }
  });

  it('maps success values and leaves failures untouched', () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6));
    expect(map(err('e'), (n: number) => n * 3)).toEqual(err('e'));
  });

  it('maps errors and leaves successes untouched', () => {
    expect(mapError(err('e'), (s) => `${s}!`)).toEqual(err('e!'));
    expect(mapError(ok(1), (s: string) => `${s}!`)).toEqual(ok(1));
  });

  it('unwrapOr returns value or fallback', () => {
    expect(unwrapOr(ok(7), 0)).toBe(7);
    expect(unwrapOr(err('e') as ReturnType<typeof err<string>>, 0)).toBe(0);
  });
});

describe('message catalog', () => {
  it('exposes English validation, auth, locked, and empty-state text', () => {
    expect(messages.validation.enrollmentNumberInvalid).toMatch(/enrollment number/i);
    expect(messages.validation.markValueOutOfRange(50)).toContain('50');
    expect(messages.validation.fileTooLarge(10)).toContain('10 MB');
    expect(messages.auth.invalidCredentials).toMatch(/incorrect/i);
    expect(messages.auth.notRegistered).toMatch(/not registered/i);
    expect(messages.features.locked).toBe('Locked — unlock later');
    expect(messages.emptyState.noStudents).toMatch(/no students/i);
  });
});

describe('featureFlags', () => {
  it('parses truthy values as enabled', () => {
    expect(parseBooleanFlag('true')).toBe(true);
    expect(parseBooleanFlag('TRUE')).toBe(true);
    expect(parseBooleanFlag(' 1 ')).toBe(true);
  });

  it('parses falsy/unset values as disabled', () => {
    expect(parseBooleanFlag('false')).toBe(false);
    expect(parseBooleanFlag('0')).toBe(false);
    expect(parseBooleanFlag('')).toBe(false);
    expect(parseBooleanFlag(undefined)).toBe(false);
    expect(parseBooleanFlag(null)).toBe(false);
  });

  it('exposes resolved flags and matches isFeatureEnabled', () => {
    expect(typeof featureFlags.ai).toBe('boolean');
    expect(isFeatureEnabled('ai')).toBe(featureFlags.ai);
  });
});
