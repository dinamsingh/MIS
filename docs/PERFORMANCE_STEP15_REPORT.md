# Production Performance Optimization (Step 15) Report

## Objective

Optimize the MIS for production performance without changing UI design, business logic, authentication, routing, Supabase schema, or feature behavior.

## Constraints Respected

- UI design was not changed.
- Business logic was not changed.
- Authentication was not changed.
- Routing paths and route behavior were not changed.
- Supabase schema and migrations were not changed.
- No new dependencies were added.

## Bundle Improvements

Baseline production build before Step 15:

- Main app chunk: `index-BBtp7LsM.js` at 642.79 kB, 188.94 kB gzip.
- Vite emitted a chunk-size warning because the main chunk exceeded 500 kB.

After Step 15:

- Main app chunk: `index-DF6nxArx.js` at 140.10 kB, 39.81 kB gzip.
- React/router vendor chunk: `vendor-react-BkiToA_9.js` at 161.18 kB, 52.50 kB gzip.
- Supabase vendor chunk: `vendor-supabase-BKLNgqV_.js` at 206.25 kB, 53.44 kB gzip.
- Motion vendor chunk: `vendor-motion-DURYBDcs.js` at 129.11 kB, 42.45 kB gzip.
- Small shared vendor chunk: `vendor-CSuZJYuY.js` at 6.20 kB, 1.90 kB gzip.
- The >500 kB warning is gone.

Implementation:

- Added Rollup `manualChunks` in `vite.config.ts`.
- Split React/router, Supabase, Framer Motion, and remaining vendor code into stable production chunks.
- Kept route-level dynamic chunks intact.

## Lazy Loaded Routes

Already preserved through `React.lazy` in `src/presentation/App.tsx`:

- Dashboard: `/dashboard`
- Reports: `/reports`
- Students: `/roster`
- Attendance: `/attendance`
- Academic content routes: `/material`, `/assignments`, `/quizzes`, `/syllabus`
- Analytics/supporting routes: `/analytics`, `/leaderboard`, `/heatmap`, `/marks`, `/timetable`
- Onboarding: `/onboarding`
- Student quiz public routes
- AI quiz generator route

Notes:

- Teacher Management exists as a page module but is not currently routed, so no new lazy route was added.
- Settings has no route in the current app; adding one would be a routing change, so it was left unchanged.

## Optimized Components

1. `RosterView`
   - Extracted roster table rows into a memoized `RosterTableRow`.
   - Stabilized row profile-open handler with `useCallback`.
   - Reduced row mount animation delay cap from 200ms to 120ms for larger rosters.
   - Avoids rerendering unchanged row components during selection/profile state changes.

2. `DashboardView`
   - Memoized derived teacher display name.
   - Memoized dashboard stat-card configuration.
   - Stabilized the student modal opener callback.
   - Preserves all existing chart and widget behavior.

3. Shared `Avatar`
   - Added `loading="lazy"` and `decoding="async"` for real image avatars.
   - Existing fixed size classes continue to prevent layout shifts.

## Static Resource Caching

Added `public/_headers` for Cloudflare Pages:

- Hashed assets under `/assets/*` are cached for one year with `immutable`.
- `/` and `/index.html` remain `no-cache` so new deployments are picked up safely.

## Tables

- Attendance table already had a memoized row component from prior work.
- Student roster table now uses memoized rows.
- Full virtualization was not added because current real roster size is around 196 students and adding a virtualizer would require a new dependency or more invasive table behavior changes.

## Images

- Shared avatar images now lazy load and async decode.
- No new image assets were added.

## Charts

- Dashboard charts were already lazy-loaded separately.
- Vendor chunking now separates chart-adjacent shared runtime from the app entry chunk.
- Reports charts are lightweight inline mock charts and render only the active tab content.

## Animations

- Framer Motion is isolated into its own vendor chunk.
- Existing Step 14 reduced-motion support remains intact.
- No extra animation dependency or heavy animation loop was added.

## Supabase And Caching

- Supabase queries were not changed to avoid behavior/RLS risk.
- Existing route lazy loading and `useDataCache` behavior were preserved.
- Supabase client/runtime is split into a separate vendor chunk, improving browser cache reuse across route chunks.

## Remaining Bottlenecks

- `vendor-supabase` is the largest vendor chunk, but it is required by data-heavy routes and auth/data access.
- `vendor-motion` is sizeable because Framer Motion powers shared page/overlay/toast transitions.
- Full lint cannot run until `eslint` is installed or the lint script is updated.
- Full table virtualization may be useful later if rosters grow well beyond a few hundred rows.
- A formal bundle visualizer was not added because no new dependencies were approved.

## Verification

- `npx tsc --noEmit` passed.
- `npm run build` passed.
- Scoped `git diff --check` for Step 15 files passed.
- `npm run lint` was run but failed because `eslint` is not installed in the project.
