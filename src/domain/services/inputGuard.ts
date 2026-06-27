/**
 * inputGuard — input validation and sanitization for the domain layer
 * (Requirement 17.1, 17.2, 17.3).
 *
 * This module is pure and dependency-free. It provides two capabilities:
 *
 *  - `sanitizeText`: neutralizes script and active markup in free-text input
 *    before storage or rendering (Req 17.1). The transform is idempotent:
 *    sanitizing an already-sanitized string yields the same string.
 *
 *  - `validateStructured`: validates structured input against a `Schema`
 *    describing the expected type, format, and range, returning a typed value
 *    on success or an English `ValidationError` on failure (Req 17.2, 17.3).
 *
 * All validation messages are sourced from the centralized English message
 * catalog so the "in English" requirement (Req 20.1) is satisfied
 * consistently.
 */
import { type Result, ok, err } from '../shared/result';
import { type ValidationError } from '../shared/types';
import { messages } from '../shared/messages';

// ---------------------------------------------------------------------------
// Text sanitization (Requirement 17.1)
// ---------------------------------------------------------------------------

/** Matches `<script>...</script>` blocks (and their content), case-insensitive. */
const SCRIPT_BLOCK = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
/** Matches `<style>...</style>` blocks (and their content), case-insensitive. */
const STYLE_BLOCK = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
/** Matches any remaining opening/closing HTML or XML tag. */
const HTML_TAG = /<\/?[a-zA-Z!][^>]*>/g;
/** Matches any stray angle bracket left after tag removal. */
const STRAY_ANGLE = /[<>]/g;

/**
 * Neutralize script and markup in a text input so it cannot execute or render
 * as active HTML when later stored or displayed (Requirement 17.1).
 *
 * Strategy: remove `<script>`/`<style>` blocks (including their content),
 * strip any remaining tags, then remove any leftover angle brackets. Because
 * the output can contain no `<` or `>` characters, no markup can be
 * reconstructed and re-sanitizing produces an identical string (idempotence).
 *
 * Non-string input is coerced to an empty string defensively; callers should
 * normally only pass strings.
 */
export function sanitizeText(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input
    .replace(SCRIPT_BLOCK, '')
    .replace(STYLE_BLOCK, '')
    .replace(HTML_TAG, '')
    .replace(STRAY_ANGLE, '');
}

// ---------------------------------------------------------------------------
// Structured validation (Requirements 17.2, 17.3)
// ---------------------------------------------------------------------------

/**
 * A schema validates unknown input and narrows it to a typed value of `T`, or
 * returns an English `ValidationError`. The optional `field` identifies the
 * input so the message can be surfaced inline next to it.
 */
export interface Schema<T> {
  validate(input: unknown, field?: string): Result<T, ValidationError>;
}

/** Infer the validated type produced by a schema. */
export type Infer<S> = S extends Schema<infer T> ? T : never;

/** Build a `ValidationError`, defaulting the message to the catalog text. */
function validationError(
  code: string,
  field: string | undefined,
  message: string,
): ValidationError {
  return field === undefined ? { code, message } : { code, message, field };
}

/** Options accepted by the string schema. */
export interface StringSchemaOptions {
  /** Sanitize the value with `sanitizeText` before length/format checks. */
  readonly sanitize?: boolean;
  /** Minimum allowed length (inclusive). */
  readonly minLength?: number;
  /** Maximum allowed length (inclusive). */
  readonly maxLength?: number;
  /** Required format the value must fully match. */
  readonly pattern?: RegExp;
  /** Override message used for a format/pattern failure. */
  readonly message?: string;
}

/** Schema for a string with optional sanitization, length, and format checks. */
export function string(options: StringSchemaOptions = {}): Schema<string> {
  return {
    validate(input, field) {
      if (typeof input !== 'string') {
        return err(
          validationError('invalid_type', field, messages.validation.invalidFormat),
        );
      }
      const value = options.sanitize ? sanitizeText(input) : input;
      if (options.minLength !== undefined && value.length < options.minLength) {
        return err(
          validationError(
            'too_short',
            field,
            options.message ?? messages.validation.invalidFormat,
          ),
        );
      }
      if (options.maxLength !== undefined && value.length > options.maxLength) {
        return err(
          validationError(
            'too_long',
            field,
            options.message ?? messages.validation.invalidFormat,
          ),
        );
      }
      if (options.pattern !== undefined && !options.pattern.test(value)) {
        return err(
          validationError(
            'invalid_format',
            field,
            options.message ?? messages.validation.invalidFormat,
          ),
        );
      }
      return ok(value);
    },
  };
}

/** Options accepted by the number schema. */
export interface NumberSchemaOptions {
  /** Require an integer value. */
  readonly integer?: boolean;
  /** Minimum allowed value (inclusive). */
  readonly min?: number;
  /** Maximum allowed value (inclusive). */
  readonly max?: number;
  /** Override message used for a range failure. */
  readonly message?: string;
}

/** Schema for a finite number with optional integer and range constraints. */
export function number(options: NumberSchemaOptions = {}): Schema<number> {
  return {
    validate(input, field) {
      if (typeof input !== 'number' || Number.isNaN(input) || !Number.isFinite(input)) {
        return err(
          validationError('invalid_type', field, messages.validation.invalidFormat),
        );
      }
      if (options.integer && !Number.isInteger(input)) {
        return err(
          validationError('invalid_format', field, messages.validation.invalidFormat),
        );
      }
      if (options.min !== undefined && input < options.min) {
        return err(
          validationError(
            'out_of_range',
            field,
            options.message ?? messages.validation.invalidFormat,
          ),
        );
      }
      if (options.max !== undefined && input > options.max) {
        return err(
          validationError(
            'out_of_range',
            field,
            options.message ?? messages.validation.invalidFormat,
          ),
        );
      }
      return ok(input);
    },
  };
}

/** Schema for a strict boolean value. */
export function boolean(): Schema<boolean> {
  return {
    validate(input, field) {
      if (typeof input !== 'boolean') {
        return err(
          validationError('invalid_type', field, messages.validation.invalidFormat),
        );
      }
      return ok(input);
    },
  };
}

/** Schema accepting only one of a fixed set of string literals. */
export function enumValue<const T extends readonly string[]>(
  values: T,
): Schema<T[number]> {
  return {
    validate(input, field) {
      if (typeof input !== 'string' || !values.includes(input)) {
        return err(
          validationError('invalid_enum', field, messages.validation.invalidFormat),
        );
      }
      return ok(input as T[number]);
    },
  };
}

/** Wrap a schema so `undefined` (a missing value) is accepted as valid. */
export function optional<T>(schema: Schema<T>): Schema<T | undefined> {
  return {
    validate(input, field) {
      if (input === undefined) {
        return ok(undefined);
      }
      return schema.validate(input, field);
    },
  };
}

/** The validated shape produced by an object schema's field map. */
type ObjectShape = Record<string, Schema<unknown>>;
type InferObject<S extends ObjectShape> = { [K in keyof S]: Infer<S[K]> };

/**
 * Schema for a plain object. Each declared field is validated by its own
 * schema; the first failing field short-circuits and its error (with the
 * field name) is returned. Unknown extra properties are ignored.
 */
export function object<S extends ObjectShape>(shape: S): Schema<InferObject<S>> {
  return {
    validate(input, field) {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        return err(
          validationError('invalid_type', field, messages.validation.invalidFormat),
        );
      }
      const source = input as Record<string, unknown>;
      const result = {} as InferObject<S>;
      for (const key of Object.keys(shape)) {
        const fieldSchema = shape[key];
        const fieldName = field ? `${field}.${key}` : key;
        const fieldResult = fieldSchema.validate(source[key], fieldName);
        if (!fieldResult.ok) {
          return fieldResult;
        }
        (result as Record<string, unknown>)[key] = fieldResult.value;
      }
      return ok(result);
    },
  };
}

/**
 * Validate structured input against a schema (Requirements 17.2, 17.3).
 *
 * Returns `ok` with the typed value when the input conforms to the schema's
 * expected type, format, and range; otherwise returns `err` with an English
 * `ValidationError` describing the first failure so the submission can be
 * rejected and the message surfaced inline.
 */
export function validateStructured<T>(
  input: unknown,
  schema: Schema<T>,
): Result<T, ValidationError> {
  return schema.validate(input);
}

/**
 * Schema combinators grouped for ergonomic, namespaced use, e.g.
 * `schema.object({ name: schema.string({ sanitize: true }) })`.
 */
export const schema = {
  string,
  number,
  boolean,
  enum: enumValue,
  optional,
  object,
} as const;
