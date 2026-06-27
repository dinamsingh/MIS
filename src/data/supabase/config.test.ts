import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isErr, isOk } from '../../domain/shared/result';

/** Strip line and block comments so source scans only inspect executable code. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}
import {
  readSupabaseConfig,
  SUPABASE_URL_ENV,
  SUPABASE_ANON_KEY_ENV,
} from './config';

describe('readSupabaseConfig — secret handling', () => {
  const url = 'https://example.supabase.co';
  const anonKey = 'anon-public-key-123';

  it('resolves URL and Anon_Key when both are present (Req 18.1, 18.3)', () => {
    const result = readSupabaseConfig({
      [SUPABASE_URL_ENV]: url,
      [SUPABASE_ANON_KEY_ENV]: anonKey,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.url).toBe(url);
      expect(result.value.anonKey).toBe(anonKey);
    }
  });

  it('trims surrounding whitespace from env values', () => {
    const result = readSupabaseConfig({
      [SUPABASE_URL_ENV]: `  ${url}  `,
      [SUPABASE_ANON_KEY_ENV]: `\t${anonKey}\n`,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.url).toBe(url);
      expect(result.value.anonKey).toBe(anonKey);
    }
  });

  it('fails with missing-url when the URL is absent (Req 18.3)', () => {
    const result = readSupabaseConfig({ [SUPABASE_ANON_KEY_ENV]: anonKey });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('missing-url');
    }
  });

  it('fails with missing-anon-key when the Anon_Key is absent (Req 18.3)', () => {
    const result = readSupabaseConfig({ [SUPABASE_URL_ENV]: url });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('missing-anon-key');
    }
  });

  it('treats empty/whitespace-only values as missing', () => {
    const result = readSupabaseConfig({
      [SUPABASE_URL_ENV]: '   ',
      [SUPABASE_ANON_KEY_ENV]: anonKey,
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.kind).toBe('missing-url');
    }
  });

  it('reads only the Anon_Key and never references a service-role key (Req 18.2)', () => {
    // Resolution must succeed using only URL + Anon_Key, ignoring any other
    // env entries, and the resolved config exposes exactly those two fields.
    const result = readSupabaseConfig({
      [SUPABASE_URL_ENV]: url,
      [SUPABASE_ANON_KEY_ENV]: anonKey,
      VITE_SOMETHING_ELSE: 'ignored',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(Object.keys(result.value).sort()).toEqual(['anonKey', 'url']);
    }
  });
});

describe('frontend code must never reference the Service_Role_Key (Req 18.2)', () => {
  it('reads no service-role secret in the executable supabase data-layer code', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const sources = ['config.ts', 'client.ts', 'index.ts'].map((f) =>
      stripComments(readFileSync(join(here, f), 'utf8')).toLowerCase(),
    );
    for (const code of sources) {
      // No service-role env var is read and no service-role key identifier
      // exists anywhere in the actual code (documentation comments aside).
      expect(code).not.toContain('service_role');
      expect(code).not.toContain('servicerole');
    }
  });
});
