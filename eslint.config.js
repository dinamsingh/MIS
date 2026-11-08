import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'graphify-out/**', '.wrangler/**', '.kiro/**', '.kilo/**'] },
  {
    files: ['src/**/*.{ts,tsx}', 'functions/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: Object.fromEntries(['window', 'document', 'console', 'localStorage', 'sessionStorage', 'navigator', 'File', 'FileReader', 'Blob', 'URL', 'fetch', 'Request', 'Response', 'Headers', 'FormData', 'AbortController', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'TextEncoder', 'TextDecoder', 'crypto', 'atob', 'btoa', 'Buffer', 'process'].map(name => [name, 'readonly'])),
    },
    rules: {
      // Existing handwritten Supabase row adapters still contain explicit any;
      // report that debt without forcing an unrelated repository rewrite.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/ban-ts-comment': 'warn',
      'prefer-const': 'warn',
      'no-useless-assignment': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-undef': 'off', // tsc checks DOM/Worker/Cloudflare ambient types.
    },
  },
);
