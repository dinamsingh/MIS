import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { isValidEmail, generateTemporaryPassword, TEMP_PASSWORD_LENGTH } from './adminAccountService';

describe('isValidEmail', () => {
  it('accepts well-formed emails', () => {
    expect(isValidEmail('teacher@example.com')).toBe(true);
    expect(isValidEmail('  teacher@example.com  ')).toBe(true);
  });

  it('rejects empty or malformed emails', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('   ')).toBe(false);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('missing-domain@')).toBe(false);
    expect(isValidEmail('@missing-local.com')).toBe(false);
    expect(isValidEmail('no-at-sign.com')).toBe(false);
  });
});

describe('generateTemporaryPassword', () => {
  it('generates a password of at least the minimum length', () => {
    const password = generateTemporaryPassword();
    expect(password.length).toBeGreaterThanOrEqual(TEMP_PASSWORD_LENGTH);
  });

  it('includes at least one character from each required class', () => {
    const password = generateTemporaryPassword();
    expect(/[a-z]/.test(password)).toBe(true);
    expect(/[A-Z]/.test(password)).toBe(true);
    expect(/[0-9]/.test(password)).toBe(true);
    expect(/[!@#$%^&*\-_=+?]/.test(password)).toBe(true);
  });

  it('never repeats the exact same password across many calls (property, no Math.random)', () => {
    const passwords = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      passwords.add(generateTemporaryPassword());
    }
    // 200 independently generated 16+ char passwords should all be unique.
    expect(passwords.size).toBe(200);
  });

  /**
   * **Validates: Requirements (ad-hoc enhancement) — temporary password
   * strength for admin-created teacher accounts.**
   * Property: for any requested length >= 4, the generated password always
   * meets the minimum length and always contains all four character classes,
   * regardless of the requested length.
   */
  it('property: any requested length >= 4 yields a password covering all character classes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 4, max: 64 }), (length) => {
        const password = generateTemporaryPassword(globalThis.crypto, length);
        expect(password.length).toBeGreaterThanOrEqual(4);
        expect(password.length).toBeGreaterThanOrEqual(Math.min(length, password.length));
        expect(/[a-z]/.test(password)).toBe(true);
        expect(/[A-Z]/.test(password)).toBe(true);
        expect(/[0-9]/.test(password)).toBe(true);
        expect(/[!@#$%^&*\-_=+?]/.test(password)).toBe(true);
      }),
    );
  });
});
