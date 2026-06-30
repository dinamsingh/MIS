# Risk Analysis

Audit date: 2026-06-30

Scope: architecture and migration risk only. No production files were modified.

## Safe Files

Safe for documentation-only changes:

- `docs/*`

Usually low-risk for future non-functional documentation updates:

- `README`-style docs if added later.
- `PROJECT_HANDOFF.md`, when updating status accurately.
- `SETUP_GUIDE.md`
- `DEPLOYMENT.md`
- `MIS_Premium_UX_Spec.md`

Moderate-risk but generally safe for visual-only future work, if scoped carefully:

- `src/presentation/components/*`
- `src/presentation/views/*`
- `src/index.css`
- `tailwind.config.js`

These are not safe for this audit task because the current instruction is documentation only.

## Sensitive Files

High-sensitivity configuration:

- `.env`
- `.env.production`
- `.env.example`
- `wrangler.toml`
- `vite.config.ts`
- `package.json`
- `package-lock.json`
- `tsconfig*.json`
- `postcss.config.js`
- `tailwind.config.js`

Authentication and authorization:

- `src/presentation/auth/AuthContext.tsx`
- `src/presentation/auth/RequireTeacher.tsx`
- `src/data/access/authService.ts`
- `src/data/supabase/config.ts`
- `src/data/supabase/client.ts`
- `src/data/migrations/0002_rls_policies.sql`
- `src/data/migrations/0003_quiz_functions.sql`

Database and data integrity:

- `src/data/migrations/*`
- `src/data/seeds/*`
- `src/data/access/*`
- `src/data/access/rows.ts`
- `src/data/access/support.ts`
- `src/data/storage/*`

Routing and global shell:

- `src/presentation/App.tsx`
- `src/presentation/components/AppLayout.tsx`
- `src/presentation/components/Sidebar.tsx`
- `src/presentation/navigation.ts`
- `src/presentation/context/SelectedSectionContext.tsx`

Business rules:

- `src/domain/services/*`
- `src/domain/shared/*`
- `src/domain/featureFlags.ts`

## Files Never To Modify Casually

Treat these as "do not modify without an explicit task, test plan, and rollback plan":

- `.env`
- `.env.production`
- `package-lock.json`
- `src/data/migrations/*`
- `src/data/seeds/seed_real_roster.sql`
- `src/data/seeds/section_A.csv`
- `src/data/seeds/section_B.csv`
- `src/data/seeds/section_C.csv`
- `src/data/supabase/client.ts`
- `src/data/supabase/config.ts`
- `src/data/access/authService.ts`
- `src/data/access/rosterImportAccess.ts`
- `src/data/storage/fileStorage.ts`
- `src/presentation/App.tsx`
- `src/presentation/context/SelectedSectionContext.tsx`
- `src/presentation/auth/*`

Reason:

- These files affect deployment config, auth, RLS behavior, database shape, real roster data, storage routing, or global app routing/state.

## High-Risk Modules

Authentication:

- The client identifies teachers through Supabase metadata or `VITE_TEACHER_EMAIL`.
- Database RLS depends on the Supabase JWT and database setting for teacher email.
- Any mismatch can cause login to work while data access fails, or vice versa.

Selected section state:

- `SelectedSectionContext` is the single source of truth for selected section.
- Many pages depend on `selectedSection.id`.
- Reintroducing name-based matching such as `CS-5A`/`CSE-5A` would be risky.

Dashboard RPC:

- `get_dashboard_data()` has been migrated multiple times.
- Migration `0009` is the active section-scoped behavior.
- Any change could regress section-scoped dashboard metrics.

Roster import:

- `rosterImportAccess` performs replace-style operations by deleting existing section students/roster rows and inserting new ones.
- Incorrect section id or import data could cause destructive roster changes.

File storage:

- `fileStorage` routes sensitive files to Supabase private storage and public/heavy files to Cloudinary.
- Misrouting can expose private files or break public material delivery.

Migrations/seeds:

- SQL files are manually applied in Supabase.
- Changing already-applied migration files can confuse source-of-truth history unless a new migration is created.

Deployment env:

- Vite inlines `VITE_*` values at build time.
- Cloudflare builds rely on `.env.production` according to current handoff.
- Missing or changed env values can produce a deployed app that renders but cannot authenticate or access data.

## Potential Migration Risks

Tasko/Next.js architecture mismatch:

- Tasko is described as a Next.js template, while this app is Vite + React Router.
- Directly copying route files, server components, API routes, middleware, Next metadata, or framework config would break architecture.

Tailwind version mismatch:

- Current app is Tailwind v3.
- Tasko/shadcn references may use Tailwind v4 syntax.
- Direct CSS token copying can fail or silently not apply.

Component system mismatch:

- Current app has few shared primitives and many screen-local UI patterns.
- A template may assume shadcn/Radix primitives and a richer component registry.
- Copying components without their dependency chain can introduce broken imports.

Auth/data mismatch:

- Current app uses Supabase Auth, RLS, client query wrappers, and security-definer RPCs.
- Template auth/data logic must not replace Supabase/RLS flows.

Icon mismatch:

- Current app uses string/emoji-like nav icons and inline SVGs.
- Template likely uses an icon package.
- Mixing both without a deliberate icon strategy will make the UI inconsistent.

Dark mode mismatch:

- Tailwind has `darkMode: "class"` but no complete dark theme.
- A template may assume CSS variables and full dark tokens.
- Partial adoption can create unreadable states.

Build/deploy mismatch:

- Current deployment is static Vite output to Cloudflare Pages.
- Next.js features requiring SSR, route handlers, middleware, or server actions are not supported by the current static SPA deployment model.

