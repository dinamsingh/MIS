# Codex Implementation Guide

Purpose: this guide defines how future Codex sessions should implement the Tasko-inspired UI migration for this MIS project.

This is a process document only. It does not authorize changing production code by itself.

## Overall Migration Workflow

Future Codex sessions should work in small, reviewable increments:

1. Read `PROJECT_HANDOFF.md`.
2. Read the relevant audit docs in `docs/`.
3. Confirm the active task is UI migration, bug fix, or documentation.
4. Inspect the affected files before editing.
5. Make the smallest safe change that completes the requested scope.
6. Preserve routes, data flow, authentication, Supabase behavior, and existing features.
7. Run the appropriate verification checks.
8. Update documentation only when project status changes.
9. Commit only the intended files.
10. Stop after the agreed scope is complete.

## Phase Order

Recommended UI migration order:

1. Foundation review: confirm design tokens, Tailwind version, existing component boundaries, and Tasko reference constraints.
2. Layout shell: sidebar, topbar, content container, mobile drawer, global section selector presentation.
3. Shared primitives: buttons, inputs, cards, badges, tables, skeletons, dialogs, notices.
4. Dashboard: cards, charts, attention list, timetable panel, empty/loading/error states.
5. High-frequency academic screens: Attendance, Marks, Roster, Timetable.
6. Assessment screens: Quizzes, Assignments, Quiz Attempt, Student Quiz Access.
7. Resource and analytics screens: Material, Analytics, Leaderboard, Heatmap, Syllabus.
8. Cross-cutting polish: accessibility, responsive QA, dark mode, animation, performance.

Each phase should be independently buildable and testable.

## Safe Implementation Strategy

Use an adaptation-first strategy:

- Prefer modifying existing components over replacing them.
- Prefer existing data contracts over new props or new models.
- Keep page wrappers connected to the same data sources.
- Keep view props backward-compatible unless the current task explicitly permits deeper refactoring.
- Avoid moving files unless a migration task explicitly requires it.
- Avoid introducing new dependencies unless the user explicitly approves.
- Keep UI text in professional English.
- Preserve all loading, empty, error, and disabled states.

For every screen:

1. Identify data dependencies.
2. Identify local state and mutation behavior.
3. Identify reusable pieces already available.
4. Restyle without changing behavior.
5. Verify that navigation, data loading, saving, validation, and errors still work.

## Review Process

Before editing:

- Read the exact target files.
- Check adjacent components and shared helpers.
- Identify sensitive dependencies such as auth context, selected section context, Supabase access modules, and migrations.

During editing:

- Keep changes scoped to the requested screen or component group.
- Avoid unrelated cleanup.
- Avoid speculative abstractions.
- Preserve existing tests and public exports.

After editing:

- Review the diff mentally and with file inspection.
- Confirm no unrelated production files changed.
- Confirm no route, query, auth, or migration behavior changed unless explicitly requested.
- Run relevant checks.
- Summarize what changed and what was verified.

## Build Process

Default verification order:

1. Type check: `npx tsc --noEmit`
2. Unit tests: `npx vitest run`
3. Production build: `npm run build`

For UI-only changes:

- At minimum, run type check and build.
- Run targeted tests if the touched component has tests.
- Run all tests when shared components, hooks, or data-aware page wrappers are touched.

For documentation-only changes:

- No build is required unless the user asks.
- Verify files exist and are inside `docs/`.

## Commit Process

Before committing:

- Check working tree status.
- Stage only files related to the task.
- Do not stage unrelated user changes.
- Do not stage generated build output unless explicitly requested.
- Use a clear, scoped commit message.

Commit message pattern:

- `docs: add implementation guide`
- `style: migrate layout shell visuals`
- `style: restyle dashboard screen`
- `fix: correct dashboard empty state`
- `test: cover section label formatting`

For UI migration, commit one completed screen or one shared primitive group at a time.

## Rollback Strategy

Preferred rollback strategy:

- Keep every change small enough that a normal revert commit can undo it.
- Do not use destructive git commands without explicit user instruction.
- For a bad UI migration, revert the specific commit or apply a focused corrective patch.
- For a bad dependency/config change, restore from the last known-good commit and rerun build checks.
- For a database migration issue, do not edit already-applied migration history casually; create a new corrective migration only when explicitly approved.

Rollback readiness checklist:

- One screen or component group per commit.
- No mixed feature/UI/config changes in the same commit.
- Document any manual verification gaps.
- Keep screenshots or notes when visual QA matters.

## Pull Request Workflow

PR preparation:

- Confirm branch is up to date with the intended base.
- Ensure the PR contains one coherent scope.
- Include screenshots for UI changes when possible.
- Include verification commands and results.
- Mention any skipped tests and why.

PR title examples:

- `Restyle layout shell using Tasko reference`
- `Restyle dashboard screen`
- `Add implementation documentation for UI migration`

PR description should include:

- Summary of changes.
- Screens affected.
- Functional behavior intentionally preserved.
- Verification performed.
- Risks or follow-up tasks.

Merge rules:

- Do not merge if type check fails.
- Do not merge if build fails.
- Do not merge if auth, section selection, or Supabase data access regresses.
- Do not merge broad UI migrations without at least one desktop and one mobile visual check.

