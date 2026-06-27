/**
 * Public entry point for the hybrid file storage data layer.
 *
 * Re-exports the storage facade (sensitive → Supabase private bucket + signed
 * URL; public/heavy → Cloudinary CDN) and the Cloudinary configuration helpers
 * (Requirements 16.2, 16.3, 16.4, 10.1, 10.2).
 */

export {
  fileStorage,
  createFileStorage,
  type FileStorage,
  type FileStorageDeps,
  type UploadRequest,
  type UploadedFile,
  type UploadFailure,
  type StorageError,
} from './fileStorage';

export {
  readCloudinaryConfig,
  CLOUDINARY_CLOUD_NAME_ENV,
  CLOUDINARY_UPLOAD_PRESET_ENV,
  SUPABASE_PRIVATE_BUCKET,
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  type CloudinaryConfig,
  type CloudinaryConfigError,
} from './config';
