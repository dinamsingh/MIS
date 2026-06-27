/**
 * Result<T, E> — a discriminated union representing either a successful value
 * (`ok`) or a failure (`err`). Used across the domain layer so that
 * correctness-critical operations (validation, grading, routing) return
 * explicit success/failure outcomes instead of throwing.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Construct a successful Result. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Construct a failed Result. */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Type guard narrowing a Result to its success branch. */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

/** Type guard narrowing a Result to its failure branch. */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/** Transform the success value of a Result, leaving failures untouched. */
export function map<T, E, U>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Transform the error of a Result, leaving successes untouched. */
export function mapError<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/** Return the success value or a fallback when the Result is a failure. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}
