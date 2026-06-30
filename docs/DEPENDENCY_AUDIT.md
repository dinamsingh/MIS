# Dependency Audit

Audit date: 2026-06-30

Scope: direct installed package audit based on `npm ls --depth=0`, `package.json`, imports, config files, and project docs. No packages were installed or removed.

## Installed Packages

Runtime dependencies:

| Package | Installed | Manifest range | Observed role |
| --- | ---: | ---: | --- |
| `@supabase/supabase-js` | 2.108.2 | ^2.108.2 | Supabase Auth, database, and storage client. |
| `react` | 18.3.1 | ^18.3.1 | React UI runtime. |
| `react-dom` | 18.3.1 | ^18.3.1 | React DOM renderer. |
| `react-router-dom` | 6.30.4 | ^6.26.2 | SPA routing, redirects, route params, nested layout routes. |

Development dependencies:

| Package | Installed | Manifest range | Observed role |
| --- | ---: | ---: | --- |
| `@testing-library/jest-dom` | 6.9.1 | ^6.5.0 | DOM test matchers. |
| `@testing-library/react` | 16.3.2 | ^16.0.1 | React component testing. |
| `@types/node` | 22.20.0 | ^22.7.4 | Node types for Vite config and tests. |
| `@types/react` | 18.3.31 | ^18.3.10 | React TypeScript types. |
| `@types/react-dom` | 18.3.7 | ^18.3.0 | React DOM TypeScript types. |
| `@vitejs/plugin-react` | 4.7.0 | ^4.3.1 | Vite React plugin. |
| `autoprefixer` | 10.5.2 | ^10.4.20 | PostCSS/Tailwind vendor prefixing. |
| `fast-check` | 3.23.2 | ^3.22.0 | Property-based tests. |
| `jsdom` | 25.0.1 | ^25.0.1 | Vitest browser-like test environment. |
| `postcss` | 8.5.15 | ^8.4.47 | Tailwind CSS processing. |
| `tailwindcss` | 3.4.19 | ^3.4.13 | Utility CSS framework. |
| `typescript` | 5.9.3 | ^5.6.2 | Static type checking. |
| `vite` | 5.4.21 | ^5.4.8 | Dev server and build tool. |
| `vitest` | 2.1.9 | ^2.1.1 | Unit/component test runner. |
| `wrangler` | 4.105.0 | ^4.105.0 | Cloudflare Pages direct deployment tool. |

## Unused Packages

No clearly unused direct runtime dependency was found from static import inspection.

Notes:

- `wrangler` is not imported in source code, but it is used by deployment commands for Cloudflare Pages direct upload.
- `jsdom`, `@testing-library/*`, `fast-check`, and `vitest` are test-only and are actively referenced by tests/config.
- `postcss`, `autoprefixer`, and `tailwindcss` are build-time CSS dependencies and are referenced by config.
- `@types/node` is not a runtime package; it supports Vite config and Node-based test utilities.

This is not a full tree-shaking or bundle-size audit. A dedicated depcheck/bundle analysis would be needed before removing anything.

## Missing Packages

Observed current missing package:

| Package | Why it appears missing | Risk |
| --- | --- | --- |
| `eslint` | `package.json` defines `npm run lint` as `eslint .`, but no `eslint` package is installed directly. | Running `npm run lint` may fail unless eslint is available through an external/global install or a transitive binary. |

Packages not currently installed but commonly expected by the premium UX/Tasko direction:

| Package family | Why it may become relevant later |
| --- | --- |
| Icon library such as `lucide-react` | Current navigation uses string/emoji-like icons and inline SVG. Premium SaaS templates usually use a typed icon set. |
| Class composition utilities such as `clsx` and `tailwind-merge` | Useful if shadcn-style component variants are introduced later. |
| Variant utility such as `class-variance-authority` | Common in shadcn-style button/input/badge systems. |
| Radix UI packages | Likely useful for accessible dialogs, dropdowns, popovers, tabs, tooltips, select menus, and sheets. |
| Chart library such as `recharts` | Project UX spec mentions a chart kit; current charts are inline SVG/manual. |
| Animation library such as `framer-motion` | Project UX spec mentions micro-interactions and spring transitions. |
| Toast package such as `sonner` | Project UX spec mentions toast/undo behavior. |
| Command palette package such as `cmdk` | Project UX spec mentions global search/command palette. |
| Date picker/calendar package | Project UX spec mentions date/range picker behavior. |
| PWA package/tooling | Project UX spec mentions offline/PWA support. |

These are not immediate install recommendations. They are only likely future dependencies if the Tasko/premium UX features are implemented.

## Packages Likely Required Later

Most likely later additions, if the Tasko visual system is adapted:

- `lucide-react` for consistent iconography.
- `clsx` and `tailwind-merge` for predictable utility class composition.
- `class-variance-authority` if component variants follow shadcn conventions.
- Selected `@radix-ui/react-*` packages for accessible overlay/navigation primitives.
- `recharts` or another chart library for dashboard and analytics charts.
- `framer-motion` if animated nav/tabs/cards are adopted.
- `sonner` or equivalent for toast/undo flows.
- `cmdk` or equivalent for command palette.
- PWA/service worker tooling if offline attendance is implemented.

## Version Conflicts

No direct dependency conflict was observed.

Important compatibility notes:

- Manifest ranges and installed versions differ because the lockfile resolved newer patch/minor versions. Example: `typescript` range is `^5.6.2`, installed is `5.9.3`. This is normal with npm caret ranges.
- React and React DOM are both installed at `18.3.1`, so the core React pair is aligned.
- `@types/react` and `@types/react-dom` are React 18 type packages, aligned with React 18.
- Tailwind is v3.4.x. Any Tasko/shadcn source using Tailwind v4 syntax must be translated rather than copied directly.
- The app is Vite + React Router, not Next.js. Any Tasko code depending on Next App Router, server components, `next/link`, `next/image`, route handlers, middleware, or `app/` conventions is architecturally incompatible without rewriting.

