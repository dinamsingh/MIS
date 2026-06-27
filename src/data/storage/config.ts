/**
 * Cloudinary configuration and storage constants (Requirements 16.3, 10.1,
 * 22.3, 22.4).
 *
 * Public/heavy uploads are sent directly from the static frontend bundle to
 * Cloudinary using an **unsigned upload preset**, so no privileged Cloudinary
 * API secret is ever shipped to the browser. The cloud name and the upload
 * preset are both read from build-time `VITE_`-prefixed environment variables
 * rather than hard-coded (Req 22.4).
 *
 * `readCloudinaryConfig` is a pure function over an injected environment record
 * so it can be unit-tested without depending on `import.meta.env`.
 */

import { type Result, ok, err } from '../../domain/shared/result';
import type { EnvRecord } from '../supabase/config';

/** Resolved, validated configuration required to upload to Cloudinary. */
export interface CloudinaryConfig {
  /** Cloudinary cloud name (`VITE_CLOUDINARY_CLOUD_NAME`). */
  readonly cloudName: string;
  /** Cloudinary unsigned upload preset (`VITE_CLOUDINARY_UPLOAD_PRESET`). */
  readonly uploadPreset: string;
}

/** Reasons Cloudinary configuration resolution can fail. */
export type CloudinaryConfigError =
  | { readonly kind: 'missing-cloud-name' }
  | { readonly kind: 'missing-upload-preset' };

/** Environment variable names read for Cloudinary configuration. */
export const CLOUDINARY_CLOUD_NAME_ENV = 'VITE_CLOUDINARY_CLOUD_NAME';
export const CLOUDINARY_UPLOAD_PRESET_ENV = 'VITE_CLOUDINARY_UPLOAD_PRESET';

/**
 * The name of the private Supabase Storage bucket that sensitive files are
 * uploaded to (Requirement 16.2). Objects here are never public; access is
 * always brokered through a time-limited signed URL (Requirement 16.4).
 */
export const SUPABASE_PRIVATE_BUCKET = 'sensitive-files';

/**
 * Default lifetime, in seconds, of a signed URL minted for a private-bucket
 * file (Requirement 16.4). One hour balances usability against exposure; the
 * value can be overridden per call.
 */
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Normalize an env value to a trimmed non-empty string, or undefined. */
function readNonEmpty(env: EnvRecord, key: string): string | undefined {
  const raw = env[key];
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolve the Cloudinary configuration from an environment record. Returns a
 * failed Result when a required value is missing rather than throwing, so the
 * caller can surface a clear error or fail fast at startup.
 */
export function readCloudinaryConfig(
  env: EnvRecord,
): Result<CloudinaryConfig, CloudinaryConfigError> {
  const cloudName = readNonEmpty(env, CLOUDINARY_CLOUD_NAME_ENV);
  if (cloudName === undefined) {
    return err({ kind: 'missing-cloud-name' });
  }

  const uploadPreset = readNonEmpty(env, CLOUDINARY_UPLOAD_PRESET_ENV);
  if (uploadPreset === undefined) {
    return err({ kind: 'missing-upload-preset' });
  }

  return ok({ cloudName, uploadPreset });
}
