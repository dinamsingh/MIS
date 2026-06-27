import { describe, expect, it } from 'vitest';
import {
  readCloudinaryConfig,
  CLOUDINARY_CLOUD_NAME_ENV,
  CLOUDINARY_UPLOAD_PRESET_ENV,
} from './config';
import { isOk, isErr } from '../../domain/shared/result';

describe('readCloudinaryConfig', () => {
  it('resolves both values when present', () => {
    const r = readCloudinaryConfig({
      [CLOUDINARY_CLOUD_NAME_ENV]: 'demo-cloud',
      [CLOUDINARY_UPLOAD_PRESET_ENV]: 'public_preset',
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.cloudName).toBe('demo-cloud');
      expect(r.value.uploadPreset).toBe('public_preset');
    }
  });

  it('trims surrounding whitespace', () => {
    const r = readCloudinaryConfig({
      [CLOUDINARY_CLOUD_NAME_ENV]: '  demo  ',
      [CLOUDINARY_UPLOAD_PRESET_ENV]: '  preset  ',
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.cloudName).toBe('demo');
      expect(r.value.uploadPreset).toBe('preset');
    }
  });

  it('fails with missing-cloud-name when the cloud name is absent', () => {
    const r = readCloudinaryConfig({ [CLOUDINARY_UPLOAD_PRESET_ENV]: 'preset' });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe('missing-cloud-name');
  });

  it('fails with missing-upload-preset when only the cloud name is present', () => {
    const r = readCloudinaryConfig({ [CLOUDINARY_CLOUD_NAME_ENV]: 'demo' });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe('missing-upload-preset');
  });

  it('treats a blank string as missing', () => {
    const r = readCloudinaryConfig({
      [CLOUDINARY_CLOUD_NAME_ENV]: '   ',
      [CLOUDINARY_UPLOAD_PRESET_ENV]: 'preset',
    });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe('missing-cloud-name');
  });
});
