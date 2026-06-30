# Commit Strategy

Purpose: define branch, commit, PR, merge, and rollback rules for future work.

## Branch Naming

Recommended branch prefixes:

- `docs/` for documentation-only work.
- `style/` for UI-only migration work.
- `fix/` for bug fixes.
- `test/` for test-only changes.
- `refactor/` for internal restructuring with no behavior change.
- `data/` for database/data-access work.

Examples:

- `docs/implementation-guides`
- `style/layout-shell-tasko`
- `style/dashboard-tasko`
- `fix/dashboard-section-scope`
- `test/selected-section-context`

Rules:

- Use one branch per coherent task.
- Do not mix unrelated UI, data, config, and docs changes.
- Avoid long-lived migration branches unless the user requests one.

## Commit Naming

Use concise conventional-style commits:

- `docs: add implementation guide`
- `docs: define UI migration rules`
- `style: restyle layout shell`
- `style: restyle dashboard`
- `fix: preserve selected section after reload`
- `test: cover roster CSV validation`

Rules:

- One complete screen per UI migration commit.
- One shared component group per shared UI commit.
- One bug fix per fix commit when practical.
- Do not commit generated build output unless explicitly requested.
- Do not commit unrelated user changes.

## Pull Request Naming

PR title format:

- `Docs: Add implementation guides`
- `UI: Restyle layout shell`
- `UI: Restyle dashboard screen`
- `Fix: Preserve section-scoped dashboard data`

PR description should include:

- Summary.
- Scope.
- Screens or files affected.
- Verification commands.
- Visual QA notes for UI changes.
- Known risks.
- Follow-up tasks.

## Merge Rules

Do not merge if:

- Type check fails.
- Production build fails.
- Existing tests fail without explanation.
- Auth flow regresses.
- Selected-section flow regresses.
- Supabase data visibility regresses.
- Routes are renamed accidentally.
- Features are removed accidentally.
- UI migration includes unrelated data/config changes.

Recommended before merge:

- `npx tsc --noEmit`
- `npx vitest run`
- `npm run build`
- Desktop visual check.
- Mobile visual check.
- Auth/section selector smoke test.

For docs-only PRs:

- Verify files are in `docs/`.
- Verify no production files changed.

## Rollback Procedure

Preferred rollback:

1. Identify the exact bad commit.
2. Revert that commit with a normal revert commit.
3. Run verification checks.
4. Document the reason for rollback.

For uncommitted changes:

- Review changed files.
- Manually remove only the changes from the current task.
- Do not reset or discard unrelated user changes.

For bad UI migration:

- Revert the screen-specific commit.
- Keep unrelated successful screen migrations intact.
- Reopen the screen task with a narrower scope.

For bad dependency change:

- Revert package manifest and lockfile changes together.
- Reinstall only when explicitly approved.
- Rerun build and tests.

For bad database migration:

- Do not edit applied migration history casually.
- Create a corrective migration only with explicit approval.
- Document manual Supabase steps.

For bad production deploy:

- Revert the source commit or redeploy the last known-good build.
- Verify the live bundle has correct environment configuration.
- Confirm login and section-scoped dashboard behavior after rollback.

