# Project Audit

Audit date: 2026-06-30

Scope: architecture inspection only. No production code was modified.

## Folder Structure

Top-level structure:

- `.kiro/` - project specification and recovered session material.
- `.vscode/` - editor settings.
- `.wrangler/` - Cloudflare/Wrangler local deployment output/state.
- `dist/` - built Vite output.
- `node_modules/` - installed dependencies.
- `src/` - application source.
- `docs/` - generated architecture audit documentation.
- `.env`, `.env.example`, `.env.production` - build/runtime configuration files.
- `DEPLOYMENT.md`, `SETUP_GUIDE.md`, `PROJECT_HANDOFF.md`, `MIS_Premium_UX_Spec.md` - project documentation.
- `package.json`, `package-lock.json` - Node package manifest and lockfile.
- `tailwind.config.js`, `postcss.config.js` - Tailwind/PostCSS configuration.
- `tsconfig*.json`, `vite.config.ts` - TypeScript and Vite configuration.
- `wrangler.toml` - Cloudflare Pages/Wrangler configuration.

Source structure:

- `src/main.tsx` - React entry point.
- `src/index.css` - Tailwind layers and shared utility classes.
- `src/presentation/` - UI, routing, pages, views, context, auth guards, hooks, formatting.
- `src/domain/` - pure business/domain logic and shared types/results/messages.
- `src/data/` - Supabase client, data access wrappers, storage integration, migrations, seeds.
- `src/test/` - shared test setup/tooling tests.

Important subfolders:

- `src/presentation/pages/` - connected page wrappers that load data and pass props into views.
- `src/presentation/views/` - pure UI screens.
- `src/presentation/components/` - shared reusable layout, navigation, loading, notice, and skeleton components.
- `src/presentation/auth/` - auth context and teacher route guard.
- `src/presentation/context/` - global selected section provider.
- `src/presentation/hooks/` - reusable React hooks.
- `src/data/access/` - Supabase table/RPC wrappers.
- `src/data/storage/` - Supabase Storage and Cloudinary upload abstraction.
- `src/data/migrations/` - manually applied database migrations.
- `src/data/seeds/` - seed SQL and CSV roster data.
- `src/domain/services/` - core MIS business operations.
- `src/domain/shared/` - shared result, message, and actor/error/storage types.

## Architecture Overview

This is a Vite React single-page application with a layered architecture:

- Presentation layer: React Router routes, contexts, page wrappers, pure views, shared UI components.
- Domain layer: pure TypeScript services for attendance, marks, quiz logic, roster import, storage routing, analytics, leaderboard, syllabus, timetable, and input validation.
- Data layer: Supabase client, Supabase query/RPC wrappers, row mappers, storage integration, migrations, and seeds.

The boundaries are mostly clean:

- Domain services do not depend on React or Supabase.
- Data access wrappers bind Supabase I/O to domain types.
- Pages are connected wrappers that call access modules or Supabase directly for some joins.
- Views are mostly pure UI with props, state, and event handlers.
- Authorization is split between client-side route gating and database RLS. RLS is the real security boundary.

Vite aliases are configured in `vite.config.ts` and `tsconfig.app.json`:

- `@presentation/*`
- `@domain/*`
- `@data/*`

## Routing Overview

Routing is centralized in `src/presentation/App.tsx`.

Providers and router structure:

- `AuthProvider`
- `BrowserRouter`
- `Suspense` with `PageLoader`
- `Routes`

Public routes:

- `/sign-in` - teacher sign-in.
- `/quiz/:token` - student quiz access.
- `/quiz/:token/attempt` - student quiz attempt.

Teacher-protected routes are nested under `TeacherShell`, which wraps:

- `RequireTeacher`
- `SelectedSectionProvider`
- `AppLayout`
- `Outlet`

Teacher routes:

- `/dashboard`
- `/timetable`
- `/roster`
- `/attendance`
- `/syllabus`
- `/marks`
- `/quizzes`
- `/assignments`
- `/material`
- `/analytics`
- `/leaderboard`
- `/heatmap`
- `/ai/quiz-generator`
- `/ai/risk-predictor`
- `/ai/*`

Root and catch-all behavior:

- `/` redirects authenticated teachers to `/dashboard`.
- `/` redirects unauthenticated users to `/sign-in`.
- `*` uses the same redirect logic.

Page components are lazy-loaded with `React.lazy`, so Vite can split the bundle by route.

## State Management

State is intentionally lightweight and React-native:

- `AuthContext` stores the current actor, loading state, teacher flag, sign-in methods, OAuth method, and sign-out.
- `SelectedSectionContext` stores all sections, selected section id, selected section object, loading state, and the setter.
- `useDataCache` provides a module-level stale-while-revalidate cache with TTL, in-flight request deduplication, background revalidation, and manual invalidation.
- Screen-level state is local `useState`, `useEffect`, `useMemo`, and `useCallback`.
- `localStorage` is used for selected section persistence under `mis_selected_section_id`.
- Supabase Auth persistence is handled by the Supabase client.

There is no Redux, Zustand, React Query, TanStack Query, or external global state package.

## Authentication Flow

Auth implementation lives primarily in:

- `src/presentation/auth/AuthContext.tsx`
- `src/presentation/auth/RequireTeacher.tsx`
- `src/data/access/authService.ts`
- `src/data/supabase/client.ts`

Flow:

1. `AuthProvider` mounts at the top of the app.
2. It calls `authService.getCurrentActor()` to restore any existing Supabase session.
3. It subscribes to Supabase auth changes through `authService.subscribe()`.
4. `actorFromSession()` maps Supabase sessions into `teacher`, `student`, or `anonymous` actors.
5. Teacher detection uses either `app_metadata.role === "teacher"` or the configured `VITE_TEACHER_EMAIL`.
6. `RequireTeacher` blocks teacher pages until loading finishes, then redirects non-teachers to `/sign-in`.
7. Sign-out calls Supabase Auth sign-out and redirects to `/sign-in`.

Important security note:

- Client actor resolution is only navigation gating.
- Database RLS and security-definer functions are the authoritative authorization boundary.

## Database Layer

Supabase configuration:

- `src/data/supabase/config.ts` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `src/data/supabase/client.ts` creates one shared Supabase client.
- Missing Supabase env vars fall back to placeholder config so the frontend can render with backend calls failing visibly.

Data-access pattern:

- Access wrappers live in `src/data/access/`.
- Shared helpers live in `src/data/access/support.ts`.
- Row-to-domain mappers live in `src/data/access/rows.ts`.
- Query wrappers use Supabase query builder calls and RPC calls, not handwritten frontend SQL strings.

Core data modules:

- `sectionsAccess`
- `rosterAccess`
- `rosterImportAccess`
- `attendanceAccess`
- `syllabusAccess`
- `marksAccess`
- `quizAccess`
- `assignmentAccess`
- `leaderboardAccess`
- `analyticsAccess`
- `heatmapAccess`
- `timetableAccess`
- `authService`

Tables created by the base migration include:

- `sections`
- `subjects`
- `units`
- `topics`
- `student_roster`
- `students`
- `timetable_entries`
- `attendance`
- `mark_components`
- `mark_values`
- `quizzes`
- `questions`
- `quiz_attempts`
- `files`
- `assignments`
- `assignment_submissions`
- `lab_manual_submissions`
- `leaderboard_config`
- `settings`
- `audit_log`

Important RPC/functions:

- `is_teacher()`
- `request_quiz_access()`
- `submit_attempt()`
- `quiz_total_marks()`
- `get_dashboard_data()`
- `write_audit_log()`

Storage:

- Sensitive files use a private Supabase Storage bucket named `sensitive-files`.
- Public/heavy files use Cloudinary direct unsigned uploads.
- Metadata is recorded in the `files` table.

## Component Hierarchy

Runtime hierarchy:

- `main.tsx`
  - `App`
    - `AuthProvider`
      - `BrowserRouter`
        - `Suspense`
          - public route views
          - `TeacherShell`
            - `RequireTeacher`
              - `SelectedSectionProvider`
                - `AppLayout`
                  - desktop `Sidebar`
                  - mobile drawer `Sidebar`
                  - topbar with global section selector
                  - main page content
                    - page wrapper
                      - pure view
                      - reusable components/skeletons

Pattern:

- `pages/*Page.tsx` files connect to data and compose providers/options.
- `views/*View.tsx` files render screen UI.
- `components/*` files are shared reusable UI.

## Current Design System

The current design system is Tailwind-first and partly tokenized.

Observed foundations:

- Tailwind CSS v3.4.
- `darkMode: "class"` configured, but no complete dark theme variables or toggle are implemented.
- Geist is imported from Google Fonts in `src/index.css`.
- Tailwind theme extends colors, radius, shadows, fonts, sidebar tokens, chart tokens, and status colors.
- Shared component classes are defined for `.card`, `.btn`, `.btn-primary`, and `.btn-secondary`.
- Icons are currently inline SVGs and string/emoji-like values in the navigation model.
- Charts are currently inline SVG/manual UI, not a charting library.

Primary tokens:

- Background/surface: white.
- Border/input: light neutral.
- Accent: near-black neutral.
- Text: default, soft, muted.
- Status: green, amber, red, blue.
- Sidebar and chart palettes are present.

## Existing Reusable Components

Shared components:

- `AppLayout`
- `Sidebar`
- `PageLoader`
- `SharedAcrossSectionsNotice`
- `SkeletonPulse`
- `DashboardSkeleton`
- `TableSkeleton`
- `CardGridSkeleton`
- `ChartSkeleton`
- `CalendarSkeleton`
- `FormSkeleton`

Reusable non-visual utilities/hooks:

- `AuthProvider`
- `RequireTeacher`
- `SelectedSectionProvider`
- `useSelectedSection`
- `useDataCache`
- `clearCache`
- `formatSectionLabel`

Screen-level pure views:

- `TeacherSignInView`
- `DashboardView`
- `TimetableView`
- `RosterView`
- `AttendanceView`
- `SyllabusTrackerView`
- `MarksCalculatorView`
- `QuizCreationView`
- `AssignmentView`
- `MaterialView`
- `AnalyticsView`
- `LeaderboardView`
- `HeatmapView`
- `StudentQuizAccessView`
- `QuizAttemptView`
- `LockedFeatureView`

