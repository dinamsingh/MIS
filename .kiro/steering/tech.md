# Tech Stack & Build

## Core stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict mode) |
| Framework | React 18 with react-router-dom v6 |
| Build tool | Vite 5 |
| Styling | Tailwind CSS 3 + PostCSS |
| Animation | Framer Motion |
| Backend | Supabase (Postgres, Auth, RLS) |
| Hosting | Cloudflare Pages |
| Edge functions | Cloudflare Pages Functions (in `functions/`) |

## Key libraries

- `@supabase/supabase-js` — database and auth client
- `framer-motion` — page transitions and micro-interactions
- `react-router-dom` — client-side routing with lazy-loaded page chunks
- `fast-check` — property-based testing
- `agentation` — dev-only agent overlay (excluded from prod builds)

## Path aliases

Configured in both `tsconfig.app.json` and `vite.config.ts`:

```
@presentation/* → src/presentation/*
@domain/*       → src/domain/*
@data/*         → src/data/*
```

Always use these aliases in imports, not relative paths across layers.

## Commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Build (typecheck + bundle) | `npm run build` |
| Preview production build | `npm run preview` |
| Lint | `npm run lint` |
| Run tests once | `npm run test` |
| Run tests (watch) | `npm run test:watch` |

## Test setup

- Runner: Vitest with jsdom environment
- Globals enabled (`describe`, `it`, `expect` available without import)
- Property-based tests use `fast-check`; global numRuns defaults to 10 (override with `FC_NUM_RUNS`)
- Setup file: `src/test/setup.ts`
- Test file pattern: `src/**/*.{test,spec}.{ts,tsx}`

## TypeScript config

- Target: ES2020
- Strict mode enabled (`strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`)
- Module: ESNext with bundler resolution

## Environment variables

Prefixed with `VITE_` for client-side access via `import.meta.env`:
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Supabase connection
- `VITE_FEATURE_AI` — feature flag for AI quiz generation

Server-side secrets go in `.dev.vars` (Cloudflare Workers format).

## Build output

- Output directory: `dist/`
- Manual chunk splitting for vendor code (supabase, motion, react)
- Pages are lazy-loaded via `React.lazy()` for code splitting
