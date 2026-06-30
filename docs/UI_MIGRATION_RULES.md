# UI Migration Rules

Purpose: strict rules for Tasko-inspired UI migration work.

These rules apply to every future Codex session unless the user explicitly overrides them.

## Non-Negotiable Rules

- Do not modify authentication unless the task is explicitly about authentication.
- Do not modify Supabase queries unless the task explicitly requires a data fix.
- Do not modify database migrations unless the task explicitly requires schema or RPC work.
- Do not rename routes.
- Do not rename files without explicit approval.
- Do not remove features.
- Do not remove loading, empty, error, disabled, or validation states.
- Do not replace the app architecture with Tasko or Next.js architecture.
- Do not install packages without explicit approval.
- Do not copy Next.js-specific APIs into this Vite app.
- Do not change deployment configuration during UI migration.
- Do not alter `.env`, `.env.production`, or Supabase credentials during UI migration.

## Architecture Preservation Rules

- Keep React + Vite + React Router.
- Keep Tailwind CSS v3 compatibility.
- Keep Supabase Auth and RLS as the security model.
- Keep `SelectedSectionContext` as the global selected-section source of truth.
- Keep existing domain services.
- Keep existing data access wrappers.
- Keep page wrappers responsible for data loading.
- Keep views focused on presentation.
- Keep all UI copy in English.

## Component Rules

- Prefer adapting existing components over rewriting them.
- Extract reusable primitives only when duplication becomes real.
- Do not create a new component system that competes with existing components.
- Keep component props simple and explicit.
- Avoid screen-specific styling leaking into shared components.
- Shared components must support loading, disabled, focus, and responsive states where relevant.
- New shared UI must be documented or obvious from naming.

## Screen Migration Rules

- Complete one screen before moving to another.
- Preserve all existing interactions on the screen.
- Preserve existing data load and save behavior.
- Preserve route path and route params.
- Preserve selected-section behavior.
- Preserve permissions and locked feature behavior.
- Preserve student-facing quiz flows.
- Verify desktop and mobile layouts before marking the screen complete.

## Tasko Adaptation Rules

Adapt from Tasko:

- Visual hierarchy.
- Spacing rhythm.
- Sidebar/topbar composition ideas.
- Card, table, badge, button, input, and chart styling ideas.
- Motion principles.
- Responsive behavior principles.

Never copy from Tasko directly:

- Next.js routes.
- Next.js layouts.
- Server components.
- Server actions.
- Middleware.
- API routes.
- `next/link`, `next/navigation`, or `next/image`.
- Template auth logic.
- Template database logic.
- Template package manifest.
- Template lockfile.
- Template deployment config.

## Data Safety Rules

- Avoid touching `src/data/*` for visual tasks.
- Avoid touching `src/domain/*` for visual tasks.
- Avoid touching `src/data/migrations/*` unless explicitly requested.
- Avoid touching real seed data unless explicitly requested.
- Any Supabase query change must explain the user-facing bug it fixes.
- Any mutation behavior change must include a rollback plan.

## Styling Rules

- Use existing Tailwind tokens first.
- Do not paste Tailwind v4 syntax into this Tailwind v3 project.
- Avoid one-off colors when a token exists.
- Keep focus states visible.
- Keep touch targets usable on mobile.
- Preserve text contrast.
- Avoid layout shifts caused by hover, loading text, or dynamic labels.
- Do not introduce horizontal overflow.

## Verification Rules

Every UI change must verify:

- Route still loads.
- Data still loads.
- Save/update/delete behavior still works if present.
- Loading state is present.
- Empty state is acceptable.
- Error state is acceptable.
- Keyboard focus is visible.
- Mobile layout is usable.

Required commands should match change risk:

- Documentation only: verify files.
- Local UI-only screen change: type check and build.
- Shared component/hook/data-adjacent change: type check, tests, build.

