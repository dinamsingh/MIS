# Migration Plan Audit

Audit date: 2026-06-30

Scope: architecture comparison only. This document does not prescribe implementation code.

Important constraint: no Tasko source folder was found in the current workspace during this audit. This plan compares the current MIS architecture against the stated Tasko direction: a premium SaaS dashboard template that uses Next.js.

## Current Architecture

Current project:

- React 18.
- Vite static SPA.
- React Router DOM v6.
- Tailwind CSS v3.
- Supabase Auth, Postgres, RLS, RPCs, and Storage.
- Cloudinary for public/heavy files.
- Cloudflare Pages static deployment.
- Layered folders: `domain`, `data`, `presentation`.
- Lazy-loaded page chunks.
- Lightweight React state through contexts and hooks.

Current strengths to preserve:

- Clear domain/data/presentation separation.
- Pure domain services with tests.
- Supabase access wrappers and row mappers.
- RLS as the real authorization boundary.
- Global selected section context.
- Existing migration/seed source of truth.
- Lazy routes and skeleton loading states.

## Tasko/Next.js Template Assumptions

A Next.js SaaS dashboard template usually includes some or all of these:

- `app/` or `pages/` framework routing.
- `layout.tsx`, `page.tsx`, route groups, and metadata files.
- Server components and client components.
- `next/link`, `next/navigation`, and `next/image`.
- Server actions or route handlers.
- Middleware.
- Next-specific font handling.
- Tailwind token files, often CSS-variable based.
- shadcn/Radix-style component primitives.
- Icon library usage.
- Dashboard shell, sidebar, topbar, cards, chart widgets, tables, menus, dialogs, and theme provider.

These concepts are useful as a visual and component reference, but many framework-level pieces do not map directly into the current app.

## What Should Be Adapted

Visual language:

- Overall dashboard density, hierarchy, spacing rhythm, typography scale, and card treatment.
- Sidebar and topbar composition.
- Navigation item styling, active indicators, badge treatment, and compact states.
- Dashboard stat cards and data-widget composition.
- Table visual treatment.
- Empty/loading/error visual patterns.
- Consistent icon style.
- Badge, chip, input, select, button, and card visual conventions.
- Light/dark token philosophy, if Tasko uses robust CSS variables.

Component concepts:

- Reusable primitives for buttons, inputs, selects, cards, badges, dialogs, dropdowns, tabs, skeletons, and tooltips.
- Layout shell patterns that improve scanability.
- Responsive navigation patterns.
- Accessible overlay primitives if Tasko uses proven headless components.

Token ideas:

- Color roles.
- Radius scale.
- Border and shadow scale.
- Chart color palette.
- Sidebar-specific tokens.
- Semantic status tokens.

Interaction ideas:

- Focus states.
- Hover/active states.
- Reduced-motion-safe animation concepts.
- Better loading and empty-state consistency.

## What Should Never Be Copied

Do not copy framework architecture:

- Next.js `app/` directory structure.
- Next.js `pages/` routing structure.
- `layout.tsx` and `page.tsx` files as route files.
- Next server components.
- Server actions.
- Route handlers/API routes.
- Middleware.
- Next metadata files.
- `next.config.*`.
- `next/link`, `next/navigation`, or `next/image` usage.

Do not copy backend/auth/data logic:

- Any template auth provider that replaces Supabase Auth.
- Any database abstraction that bypasses existing Supabase access wrappers.
- Any API route that duplicates existing Supabase RPC/data access.
- Any role/permission model that conflicts with RLS.
- Any seed/schema/migration from Tasko.

Do not copy dependency/config blindly:

- Template `package.json`.
- Template lockfile.
- Template TypeScript config.
- Template Tailwind config without translating to Tailwind v3.
- Template PostCSS config.
- Template environment variable names.
- Template deployment settings.

Do not copy product content:

- Mock SaaS metrics unrelated to the MIS domain.
- Placeholder users, organizations, invoices, projects, tasks, or CRM objects.
- Template route names that do not map to MIS features.

## What Needs Rewriting Because Tasko Uses Next.js

Routing:

- Next file routes must be mapped to existing React Router routes.
- Nested Next layouts must be translated into `AppLayout`, `TeacherShell`, and route children.
- Next redirect/navigation APIs must become React Router navigation.

Links and navigation:

- `next/link` must become React Router link/navigation patterns.
- `useRouter`, `usePathname`, and `useSearchParams` from Next must become React Router equivalents.

Server/client boundaries:

- Server components must become normal React components.
- Client components that rely on `"use client"` need review, but the directive itself is irrelevant in Vite.
- Server actions must become existing Supabase access calls or explicit frontend event flows.

Images and fonts:

- `next/image` patterns need replacement with normal image handling or existing asset strategy.
- `next/font` patterns need replacement with current CSS/Tailwind font loading strategy.

CSS and tokens:

- Tailwind v4 syntax must be translated to Tailwind v3 config and/or CSS compatible with this project.
- CSS-variable tokens can be adopted conceptually, but they must fit the current Tailwind setup.
- Global CSS resets should not be copied over existing Tailwind base without review.

Data fetching:

- Next server-side data fetching patterns must be rewritten to current client-side Supabase access wrappers.
- Any template fetch/cache abstraction must not replace `useDataCache` without a deliberate architecture decision.

Auth:

- Next middleware-based route protection must be rewritten into current `RequireTeacher`/React Router gating.
- Existing Supabase RLS remains authoritative.

Deployment:

- Next SSR/edge/serverless expectations must not be assumed.
- Current deploy target is static Vite output on Cloudflare Pages.

## Adaptation Boundaries

Keep:

- Existing routes.
- Existing feature behavior.
- Existing Supabase schema and RLS model.
- Existing page/view separation.
- Existing domain services.
- Existing data access wrappers.
- Existing global selected-section behavior.
- Existing Cloudflare Pages static deployment.

Adapt:

- Visual tokens.
- Shared component vocabulary.
- Sidebar/topbar visual shell.
- Screen-level layout composition.
- Accessible overlay/menu/dialog patterns.
- Icon system.
- Loading/empty/error visual consistency.

Rewrite:

- Any Next.js route/layout component.
- Any server component.
- Any Next-specific data fetching.
- Any Next-specific image/font/navigation code.
- Any Tailwind v4/shadcn code that assumes a different token runtime.

Reject:

- Any Tasko code that changes the MIS domain model.
- Any Tasko code that replaces Supabase Auth/RLS.
- Any Tasko migration/seed/backend layer.
- Any template deployment/config file that conflicts with Vite/Cloudflare Pages.

## Architectural Migration Sequence

Documentation-only sequence for future planning:

1. Inventory Tasko primitives and separate visual ideas from framework-specific implementation.
2. Map Tasko visual roles to current MIS screens and component categories.
3. Decide which shared primitives the MIS actually needs.
4. Translate tokens into the current Tailwind v3-compatible design system.
5. Adapt the layout shell while preserving routes and selected-section behavior.
6. Adapt one screen at a time, keeping data access and domain behavior unchanged.
7. Verify each migrated surface against auth, RLS, selected section, loading, empty, and error states.

This sequence is intentionally architectural. It contains no implementation code.

