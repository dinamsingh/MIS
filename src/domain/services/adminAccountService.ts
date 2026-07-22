/**
 * Admin-creates-teacher-account — pure, testable core.
 *
 * Holds the provider-agnostic logic used by the Cloudflare Pages Function
 * `functions/api/admin-create-teacher.ts`:
 *  - `isValidEmail` — the same lightweight format check used elsewhere in the
 *    app (mirrors the non-empty + basic-shape checks in `authService.ts`/
 *    `onboarding.ts`, rather than inventing a new regex).
 *  - `generateTemporaryPassword` — a cryptographically random temporary
 *    password (Web Crypto `crypto.getRandomValues`, never `Math.random()`)
 *    with guaranteed character-class coverage (upper, lower, digit, symbol).
 *
 * No network, environment, or Supabase access lives here, so it can be
 * imported by both the Workers runtime (which has `globalThis.crypto`) and
 * Vitest/jsdom (which also provides `globalThis.crypto` via Node's Web Crypto
 * polyfill) — the exact same rules are exercised in both places.
 */

/** Basic, non-exhaustive email shape check: local part `@` domain with a dot. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate a trimmed email is non-empty and has a plausible shape. */
export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length > 0 && EMAIL_SHAPE.test(trimmed);
}

/** Character pools used to build the temporary password. */
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*-_=+?';
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

/** Minimum length of a generated temporary password. */
export const TEMP_PASSWORD_LENGTH = 16;

/**
 * Pick a random index into `pool` using `crypto.getRandomValues` (rejection
 * sampling to avoid modulo bias).
 */
function randomIndex(pool: string, crypto: Crypto): number {
  const max = pool.length;
  const range = 256 - (256 % max);
  const bytes = new Uint8Array(1);
  let value: number;
  do {
    crypto.getRandomValues(bytes);
    value = bytes[0];
  } while (value >= range);
  return value % max;
}

/** Fisher-Yates shuffle using `crypto.getRandomValues`, so no positional bias leaks. */
function shuffle<T>(items: T[], crypto: Crypto): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const bytes = new Uint8Array(1);
    let j: number;
    const range = 256 - (256 % (i + 1));
    do {
      crypto.getRandomValues(bytes);
      j = bytes[0];
    } while (j >= range);
    j %= i + 1;
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generate a cryptographically random temporary password, at least
 * {@link TEMP_PASSWORD_LENGTH} characters, guaranteed to contain at least one
 * lowercase letter, one uppercase letter, one digit, and one symbol.
 *
 * Uses `crypto.getRandomValues` (available in both the Workers runtime and
 * Node/jsdom test environments via `globalThis.crypto`) — never `Math.random()`.
 */
export function generateTemporaryPassword(
  crypto: Crypto = globalThis.crypto,
  length: number = TEMP_PASSWORD_LENGTH,
): string {
  if (!crypto || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Web Crypto (crypto.getRandomValues) is not available in this environment.');
  }
  const effectiveLength = Math.max(length, 4); // room for the 4 guaranteed classes

  // Guarantee one character from each class first.
  const guaranteed = [
    LOWER[randomIndex(LOWER, crypto)],
    UPPER[randomIndex(UPPER, crypto)],
    DIGITS[randomIndex(DIGITS, crypto)],
    SYMBOLS[randomIndex(SYMBOLS, crypto)],
  ];

  // Fill the remainder from the full pool.
  const rest: string[] = [];
  for (let i = guaranteed.length; i < effectiveLength; i += 1) {
    rest.push(ALL[randomIndex(ALL, crypto)]);
  }

  return shuffle([...guaranteed, ...rest], crypto).join('');
}
