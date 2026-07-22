# 📋 PROJECT HANDOFF & CONTEXT — Teacher Academic MIS

> **Purpose of this file.** This is the single source of truth for project context and progress.
> If a chat session crashes, you switch AI agents, or you start a new session, **read this file first**
> to understand what the project is, everything that has been done, where work stopped, and how to resume.
>
> **Keep it updated.** After finishing any meaningful task, update the "Current Status" and "Work Log"
> sections below (newest entry on top). Treat this like a flight recorder — small, frequent updates.

---

## 0. Quick Status (READ THIS FIRST)

- **Last updated:** 2026-07-21
- **Active branch:** `main`. **NOTHING has been pushed** — user explicitly said "no push without permission". Everything below is LOCAL ONLY.
- **Latest commit (pushed):** `75b03b3` (unchanged since last push).
- **Build/tests (as of last full run):** ✅ green — `npx vite build` succeeds (6s), `npx vitest run` 306 tests pass (33 files). `npx tsc -b tsconfig.app.json --noEmit` has 2 pre-existing minor errors in unrelated test files (not blocking).

### 🔴 CURRENT RESUME POINT
**ALL 4 PHASES of `.kiro/specs/admin-console-and-scheduling-upgrade/` are IMPLEMENTED + MIGRATIONS APPLIED to Supabase.** The spec is functionally complete (61/110 tasks done — remaining 49 are all optional PBT tests marked `*`).

**What was built this session (2026-07-21):**
- Phase 1: Admin Role Foundation (complete since prior session)
- Phase 2: Admin Bulk Roster/Session Import — `create_session()` RPC, duplicate-assignment guard, admin roster CSV wrapper, roster remove/permanently-delete RPCs, AdminSessionCreationPage, AdminRosterImportPage
- Phase 3: Batch Promotion & History — `promote_batch()` RPC, stale-assignment derivation + wiring, stale-assignment dashboard banner, read-only Teaching History page
- Phase 4: Timetable Overhaul — fixed periods catalog, timetable_entries schema extension (period_id, span_periods, room, is_tutorial, special_activity), section_timetable_status, confirm/unlock RPCs with cross-batch conflict detection + RLS mutation block, TimetableView period-based editor with confirm/unlock UI, My Schedule unified weekly grid, Attendance → confirmed-timetable-derived periods integration
- Ad-hoc: Admin-only login redirect bugfix (race condition fix), "Create teacher account" feature (temp password + forced password reset on onboarding), Supabase Power setup + CLI login/link

**Migrations applied to Supabase (all ✅ via MCP):**
- 0042-0044: already applied in prior sessions
- 0045: `teachers.must_reset_password` column
- 0046: `create_session()` RPC + duplicate-assignment partial unique index
- 0047: `remove_student_from_roster()` + `permanently_delete_student()` RPCs
- 0048: `promote_batch()` RPC
- 0049: `periods` table + seed data (9 rows)
- 0050: timetable_entries Phase 4 columns + `section_timetable_status` table
- 0051: `find_teacher_schedule_conflicts()` + `confirm_timetable()` + `unlock_timetable()` RPCs + confirmed-section RLS mutation block

**Data fix applied:** Removed Ujjawal Singh's duplicate DBMS claim for sections A (batch 2024-28) to unblock the unique index creation.

### ⚠️ Remaining manual steps (for the human)
1. **Production deploy**: push to `main` (after permission) → Cloudflare auto-builds. Also add these 3 Cloudflare Pages secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. **"Create teacher account" feature testing**: use `npx wrangler pages dev dist` (port 8788) instead of `npm run dev` (port 5173) — only wrangler runs the real Cloudflare Function that creates Auth users.
3. **Security hardening** (optional, recommended): Supabase Dashboard → Auth → "Leaked password protection" enable; revoke `EXECUTE` from `anon` role on sensitive RPCs.
4. **Optional PBT tests** (49 tasks): formal property-based tests. Skip for MVP.

### Supabase Power setup (new this session)
- Supabase CLI installed (v2.109.1), logged in, linked to project `sdhpgvshexqsidkivjnq`
- Kiro Power "supabase-hosted" installed + MCP connected — can run migrations, queries, inspect schema directly from IDE
- `.dev.vars` has all 4 secrets filled (GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
- `supabase/` folder initialized via `supabase init`

### Key files added/modified this session
- Migrations: `src/data/migrations/0045-0051_*.sql`
- Cloudflare Function: `functions/api/admin-create-teacher.ts`
- Pure services: `src/domain/services/adminAccountService.ts`, `teacherAssignmentService.ts`
- Data access: `src/data/access/adminRosterImportAccess.ts`, `adminSessionAccess.ts`, `mySchedule.ts`, `teachingHistoryAccess.ts`, `timetableAccess.ts` (extended)
- Pages: `AdminSessionCreationPage`, `AdminRosterImportPage`, `TeachingHistoryPage`, `MySchedulePage`
- Views: `TimetableView.tsx` (major Phase 4 update), `MyScheduleView.tsx`, `TeachingHistoryView.tsx`
- Onboarding: `PasswordStep.tsx` (forced password reset), `StaleAssignmentBanner.tsx`, `useStaleAssignmentNotice.ts`
- Auth: `App.tsx` (admin-only redirect fix, route wiring), `useUserRole.ts`, `RequireAdmin.tsx`
- Config: `vite.config.ts` (mock for admin-create-teacher), `.dev.vars`, `wrangler.toml`, `supabase/` folder
- **Teacher-account block restored** — migration 0037 accidentally dropped the `teacher-account` denial check from `request_quiz_access`; 0039 restores it
- **Atomic roster/enrollment binding** — race condition where two students could claim the same enrollment simultaneously is now prevented via atomic `UPDATE ... WHERE (email IS NULL)` + a case-insensitive unique index
- **OTP resend cooldown** — 60-second client-side cooldown prevents students from spamming the OTP endpoint
- **enrollment-required status mismatch bug fixed** — server returns `'enrollment-required'` but frontend only handled `'needs-enrollment'`; now handles both
- **Multi-section quiz assignment** — teacher can assign one quiz to multiple sections (instead of just one or all), with a checkbox-and-checklist UI at creation time
- **Student quiz UI premium redesign** — removed all hardcoded purple colors (#5746e3), replaced with app design tokens (warm gold/dark palette), added step tracker, progress bar, selected-option highlighting, mobile-friendly tap targets (min-h-44px), iOS safe-area padding, enrollment autocomplete dropdown (type last 3 digits to search)
- **Pre-existing test failures fixed** — `canReview` field always-present bug in parsers.ts, roster CSV email-column format drift in rosterImportService.test.ts (9 tests were failing before this session, now all 221 pass)

### ⚠️ Action items the human still needs to do (run in Supabase SQL editor, in order)
Migrations from this session that must be applied:
1. ✅ `0012_multi_teacher_identity.sql` — membership-based `is_teacher()` (ran).
2. ✅ `0013_dedupe_sections.sql` — remove duplicate sections + unique (name,batch) index (ran).
3. ✅ `0014_per_teacher_isolation.sql` — owner_id + owner RLS on operational tables (ran).
4. ✅ `0015_dashboard_owner_scoped.sql` — dashboard RPC per-teacher (ran).
5. ✅ `0016_align_roster_batch.sql` — align seeded roster batch 2024-2028 → 2024-28 (ran).
6. ✅ `0017_merge_legacy_section_a.sql` — merge legacy CS-5A 12 students into CSE-5A (ran, CSE-5A now 66).
7. ⏳ `0018_syllabus_master_and_progress.sql` — syllabus master + per-teacher progress tables (RUN THIS).
8. ⏳ `seeds/sem4_syllabus_seed.sql` — sem-4 curriculum (30 units, 312 topics) (RUN after 0018).
9. ⏳ (optional) `seeds/sem4_java_lab_seed.sql` — adds CS-406 Java lab programs as a unit.
10. ⏳ `0019_unify_subjects_units.sql` — repoint operational FKs (quizzes/assignments/attendance/marks/timetable) from legacy `subjects`/`units` to `syllabus_subjects`/`syllabus_units`. **DELETES orphan operational rows** that don't match the master (clean start). RUN after 0018 + seed.
11. ⏳ `0020_quiz_active_window.sql` — add `quizzes.active_from`/`active_until` + enforce window in `request_quiz_access`. RUN for the AI quiz feature.
12. ⏳ `0021_sem5_electives_and_subjects.sql` — add `syllabus_subjects.elective_group` + correct the sem-5 (V-SEM) subject list (CS-503A/B/C, CS-504A/B/C, CS-505 Linux Lab, CS-506 Python Lab; keeps CS-501/CS-502). RUN before the sem-5 seed.
13. ⏳ `seeds/sem5_syllabus_seed.sql` — sem-5 curriculum (units + topics for CS-501, CS-502, all elective variants, and both labs). Idempotent + progress-safe. RUN after `0021`.
14. ⏳ `0022_quiz_access_self_register.sql` — rework `request_quiz_access` (teacher preview + enrollment self-register/bind/lock) + add `reset_student_binding` / `list_student_registrations`. RUN to fix quiz "not registered" + enable teacher preview and registration reset.

### AI Quiz Generator setup (Gemini) — human action
- Get a free **Google Gemini API key** (aistudio.google.com).
- Set it as a **Cloudflare Pages secret** named `GEMINI_API_KEY` (Pages project → Settings → Env vars/secrets, or `npx wrangler pages secret put GEMINI_API_KEY`). NOT a `VITE_` var (must stay server-side).
- Local dev of the function: create `.dev.vars` with `GEMINI_API_KEY=...` and run `npx wrangler pages dev dist` (after `npm run build`); plain `npm run dev` does NOT run Pages Functions.
- Enable the UI: set `VITE_FEATURE_AI=true` in `.env` / `.env.production`, rebuild. Route `/ai/quiz-generator` then shows the real generator (else a locked placeholder).

> The old `app.teacher_email` DB setting is NO LONGER required for data visibility — membership-based
> `is_teacher()` handles it. Teachers are identified by having a `teachers` row (created at onboarding).
> OTP login still uses `shouldCreateUser:false`, so only pre-added Supabase Auth users can log in as teachers.

---

## 1. Project Overview

**Teacher Academic MIS** — a web app for a single college teacher to manage students, attendance,
syllabus, internal marks, quizzes, assignments, study material, analytics, leaderboard, and heatmap.

- A formal spec exists at `.kiro/specs/teacher-academic-mis/` (`requirements.md`, `design.md`, `tasks.md`).
- The spec's core implementation tasks are **complete**. Recent work (roster import, batch/section model,
  shared materials, global section selector, theme redesign) went **beyond** the original spec and is
  **not yet reflected** in the spec docs.

### Tech stack
- **Frontend:** React 18 + Vite 5 + TypeScript + Tailwind CSS **v3.4** (NOT v4) + react-router-dom v6
- **Backend:** Supabase (PostgreSQL, Auth, Storage) + Cloudinary (public/heavy files)
- **Testing:** Vitest + fast-check (property-based tests)
- **Hosting:** Cloudflare Pages (project name: `mis-app`, production domain `mis-app.pages.dev`)
- **Architecture:** layered — `domain/` (pure logic + services), `data/` (Supabase access, migrations, seeds,
  storage), `presentation/` (pages = connected wrappers, views = pure UI, context, components, hooks).

---

## 2. Repository & Branch State

| Branch | Purpose | State |
|--------|---------|-------|
| `main` | Production source | Has ALL recent work; pushed to `origin/main` (commit `dd8afd1`). |
| `feature/new-design` | UI redesign WIP | Merged into `main` (fast-forward). Same as main now. |
| `Dinamwork` / `origin/Dinamwork` | Collaborator branch | Source of the semester/section selector work (already merged). |

- Remote: `https://github.com/dinamsingh/MIS.git`
- `git push origin main` triggers a Cloudflare auto-build that now deploys a **working** build (env baked via `.env.production`). See §4.

---

## 3. Database Migrations & Seeds

Migrations live in `src/data/migrations/` (applied manually via Supabase SQL editor).

| File | What it does | Applied in Supabase? |
|------|--------------|----------------------|
| `0001_init_schema.sql` | Base tables, constraints, defaults | ✅ (pre-existing) |
| `0002_rls_policies.sql` | RLS + `is_teacher()` helper | ✅ |
| `0003_quiz_functions.sql` | Quiz access/grade `SECURITY DEFINER` fns | ✅ |
| `0004_audit_trigger.sql` | Audit log trigger | ✅ |
| `0005_dashboard_rpc.sql` | Original `get_dashboard_data` RPC (name-matched `CS-5%`) | ✅ (superseded by 0008/0009) |
| `0006_add_file_name_column.sql` | `files.file_name` column | ✅ |
| `0007_real_roster_support.sql` | Relax enrollment pattern, nullable email, unique enrollment, `sections.batch/semester/department` | ✅ (user ran it) |
| `0008_dashboard_rpc_by_id.sql` | Rewrite dashboard RPC to filter by `sections.semester` + `section_id` (removes `CS-` name matching) | ✅ ran |
| `0009_dashboard_section_scoped.sql` | Scope dashboard metrics to the SELECTED section (not whole semester) | ✅ ran |
| `0010_onboarding_schema.sql` | Onboarding tables: `teachers`, `batches`, `syllabus_subjects`, `teacher_assignments` + RLS by auth.uid() | ✅ ran |
| `0011_update_current_batches.sql` | Update live batch `current_sem` values | ✅ ran |
| `0012_multi_teacher_identity.sql` | **`is_teacher()` = has a `teachers` row** (membership-based, drops hardcoded-email dependency) | ✅ ran |
| `0013_dedupe_sections.sql` | Delete duplicate `(name,batch)` sections + add unique index | ✅ ran |
| `0014_per_teacher_isolation.sql` | Add `owner_id` + owner-scoped RLS to operational tables (attendance, marks, timetable, subjects, units, topics, quizzes, questions, assignments, files, leaderboard_config, settings). Sections/students stay SHARED | ✅ ran |
| `0015_dashboard_owner_scoped.sql` | Dashboard RPC: roster shared, attendance/marks/quiz/timetable filtered by `owner_id = auth.uid()` | ✅ ran |
| `0016_align_roster_batch.sql` | Relabel seeded sections batch `2024-2028` → `2024-28` so onboarded sections show the shared roster | ✅ ran |
| `0017_merge_legacy_section_a.sql` | Move 12 real students from legacy `CS-5A` (batch NULL) into `CSE-5A`; CSE-5A now 66 | ✅ ran |
| `0018_syllabus_master_and_progress.sql` | Syllabus Tracker: `syllabus_units` + `syllabus_topics` (shared master) + `teacher_topic_progress` (per-teacher, RLS owner) | ⏳ RUN |
| `0019_unify_subjects_units.sql` | Repoint operational FKs (quizzes.unit_id, assignments.subject_id/unit_id, assignment_submissions.unit_id, lab_manual_submissions.unit_id, attendance.subject_id, mark_components.subject_id, timetable_entries.subject_id) → `syllabus_subjects`/`syllabus_units`. Deletes orphan rows first. Legacy `subjects`/`units`/`topics` retired | ⏳ RUN |
| `0020_quiz_active_window.sql` | Add `quizzes.active_from`/`active_until` + enforce window in `request_quiz_access` (new `not-active` denied reason) | ⏳ RUN |
| `0021_sem5_electives_and_subjects.sql` | Add `syllabus_subjects.elective_group`; correct sem-5 subjects → CS-503A/B/C (Departmental Elective), CS-504A/B/C (Open Elective), CS-505 Linux Lab, CS-506 Python Lab. Removes old sem-5 placeholders; keeps CS-501/CS-502 | ⏳ RUN |

Seeds in `src/data/seeds/`:
- `seed.sql` — original 12 demo students (IWT 5th Sem). 
- `seed_real_roster.sql` — **real 196 students** across 3 sections `CSE-5A/5B/5C` (batch 2024-2028, 5th Sem). ✅ ran.
- `section_A.csv`, `section_B.csv`, `section_C.csv` — source roster (enrollment,name) for the seed/import.
- `onboarding_seed.sql` — RGPV CSE Sem 1-8 `syllabus_subjects` + live `batches`. ✅ ran.
- `sem4_syllabus_seed.sql` — **sem-4 master syllabus**: 6 subjects (BT-401, CS-402/403/404/405, CS-406 Java), **30 units, 312 topics**. Idempotent + progress-safe. ⏳ RUN after 0018.
- `sem4_java_lab_seed.sql` — optional one-click: adds CS-406 Java 20 lab programs as an extra unit. ⏳ optional.
- `sem5_syllabus_seed.sql` — **sem-5 master syllabus**: CS-501 (Theory of Computation), CS-502 (DBMS), elective variants CS-503A/B/C & CS-504A/B/C, and labs CS-505 (Linux) & CS-506 (Python) — units + topics. Idempotent + progress-safe (seeds a subject only if it has no units). ⏳ RUN after `0021`.

> **Note:** `.gitignore` previously had a blanket `*.sql` rule (added by collaborator) that hid migrations.
> Fixed by adding `!src/data/migrations/*.sql` and `!src/data/seeds/*.sql` exceptions.

---

## 4. Environment & Deployment (CRITICAL — read before deploying)

### Required env vars (Vite inlines `VITE_*` at BUILD time)
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TEACHER_EMAIL`,
`VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`, `VITE_FEATURE_AI`.
Values live in local `.env` (git-ignored). For local dev: `npm run dev`.

### 🟢 Cloudflare git-build env — RESOLVED (2026-06-30)
Previously the Git auto-build did not inject the dashboard env vars, so git-built bundles fell back to
placeholder config and broke login. **Fixed** by committing **`.env.production`** (repo root) which holds the
PUBLIC client-side values (anon key, URLs, etc. — no secrets). Vite reads `.env.production` during
`vite build`, so EVERY build (local or Cloudflare git-build) now bakes in the correct config.
**`git push origin main` is now SAFE** and auto-deploys a working build. (Verified: a build with `.env`
removed still produces the real Supabase URL.)

### Deploy methods (both work now)
- **Push to deploy:** `git push origin main` → Cloudflare git-build → correct bundle (thanks to `.env.production`).
- **Direct upload (manual):** `npm run build` then `npx wrangler pages deploy dist --project-name=mis-app --branch=main`.

### How to VERIFY a deploy has correct env (not placeholder)
```powershell
# fetch the live index bundle and check
$html = (Invoke-WebRequest "https://mis-app.pages.dev/" -UseBasicParsing).Content
$js = ([regex]::Matches($html,'/assets/index-[A-Za-z0-9_\-]+\.js')[0].Value)
$b  = (Invoke-WebRequest ("https://mis-app.pages.dev"+$js) -UseBasicParsing).Content
if ($b -match 'sdhpgvshexqsidkivjnq') { 'OK: real Supabase URL present' } else { 'BAD: still placeholder' }
```
> Note: the literal strings `placeholder-anon-key` / `localhost:54321` ALWAYS appear in the bundle (they are
> the fallback code). The decisive check is whether the **real project ref `sdhpgvshexqsidkivjnq`** is present.

---

## 5. Features Built Beyond the Original Spec (this engagement)

1. **CSV Roster Import** (`/roster` page)
   - Pure parser: `src/domain/services/rosterImportService.ts` (+ test). Parses `enrollment,name`, validates,
     dedupes, reports rejected rows with reasons.
   - Bulk "replace" import: `src/data/access/rosterImportAccess.ts` — deletes a section's existing students +
     roster entries, then inserts the new list (auto-detect by enrollment number).
   - UI: `RosterView.tsx` + `RosterPage.tsx` (section picker, CSV upload/paste, preview, delete-confirm).

2. **Batch / Semester / Section model**
   - `sections` gained `batch`, `semester`, `department` (migration 0007).
   - `Section` type + `toSection` mapper in `src/data/access/rows.ts`; `sectionsAccess.ts` (`listSections`).
   - `src/presentation/format/sectionLabel.ts` — `formatSectionLabel()` → "CSE · 2024-2028 · 5th Sem · Sec A".

3. **Shared materials across sections**
   - Assignments/quizzes/materials are subject/unit-scoped (already shared structurally).
   - `timetableService.sectionIdsForSubject()` + `timetableAccess.listSectionIdsForSubject()` resolve which
     sections study a subject. Trackers/attempts list students across all those sections, labeled by section.
   - `SharedAcrossSectionsNotice.tsx` banner communicates the shared nature. Attendance/marks stay per-section.

4. **Single global section selector** (replaced collaborator's hardcoded semester+section dropdowns)
   - `src/presentation/context/SelectedSectionContext.tsx` — ONE source of truth, loads real sections from DB,
     persists choice in localStorage (`mis_selected_section_id`).
   - `AppLayout.tsx` renders ONE database-driven dropdown.
   - All pages migrated to use `useSelectedSection()` and query by `selectedSection.id` (no more `CS-5A`
     name matching). Old `hooks/useSelectedSemester.ts` was deleted.

5. **Dashboard RPC fixes** (migrations 0008, 0009) — see §3. Fixes "all students show / not section-wise"
   and the `CSE` vs `CS` naming mismatch by filtering on `sections.semester` + `section_id`.

6. **UI redesign — Step 1 only** (branch was `feature/new-design`, now merged)
   - Merged reference template theme tokens into Tailwind v3: neutral shadcn palette (near-black primary,
     white cards, light-gray borders), Geist font, modern radius/shadow, added `sidebar`/`chart`/`ring` tokens.
   - Files: `tailwind.config.js`, `src/index.css`.

---

## 6. Resume Here ▶️ (where work stopped)

> **NOTE (2026-07-05):** The current active track is **multi-teacher + syllabus** on branch
> `feature/onboarding` — see §0 and §11. The UI-redesign track below is an OLDER, separate effort on `main`
> and is not what this session was about. Current resume point: (1) commit the uncommitted Syllabus Tracker
> work after user confirms, (2) optionally wire the dashboard "syllabus progress %" to the new
> master+progress model, (3) seed remaining semesters' curriculum as the user provides it.

**The UI redesign is incomplete.** Only Step 1 (theme tokens) is done. The agreed plan (one screen at a
time, pause + commit after each) was:

- [x] **Step 1 — Theme tokens** (colors, font, radius, shadow) → committed `f8a5644`.
- [ ] **Step 2 — Layout shell**: restyle sidebar + topbar + content area to match the reference template. ⬅️ NEXT
- [ ] **Step 3 — Dashboard** screen restyle.
- [ ] **Step 4..N — Remaining screens** one at a time (Attendance, Heatmap, Syllabus, Marks, Quiz, Assignment,
      Material, Analytics, Leaderboard, Roster, Timetable).

**Rules for the redesign (from the user):**
- Work ONLY on the redesign; do **not** change features, routes, state, or Supabase/data logic.
- Restyle ONE screen at a time, **pause after each** so the user can test, then **commit**.
- Keep all UI text in English. Talk in simple language.
- Reference template theme (`globals.css`, Tailwind v4 + shadcn) was provided; we adapted it into Tailwind v3.

---

## 7. Pending / TODO (besides the redesign)

- [ ] Human: run migrations **0008 & 0009** in Supabase (see §0 action items).
- [ ] Human: confirm Supabase Auth teacher user + `app.teacher_email` DB setting (login + RLS data visibility).
- [x] ✅ Fixed the Cloudflare **Git-build env injection** by committing `.env.production` — `git push` deploys
      now work without manual direct upload.
- [ ] (Optional) Update the spec docs (`.kiro/specs/teacher-academic-mis/`) to reflect the features in §5.
- [ ] (Optional) Add automated tests for the new RPC behavior and the global selector context.

---

## 8. Known Issues & Gotchas

- **`CSE` vs `CS` naming:** seed sections are named `CSE-5A/5B/5C`. Older collaborator code/RPC assumed
  `CS-5A`. Fixed in pages (now use section `id`) and in dashboard RPC (0008/0009 use `sections.semester` +
  `section_id`). If you add name-based matching anywhere, prefer matching by `id` or the `semester` column.
- **Tailwind is v3, not v4.** The reference `globals.css` is v4 syntax — do NOT paste it directly; adapt
  tokens into `tailwind.config.js` (already done for theme).
- **`.gitignore` had `*.sql`** — migrations/seeds are now explicitly un-ignored. If you add new SQL outside
  `src/data/migrations` or `src/data/seeds`, it will be ignored by default.
- **Cloudflare Git build ≠ env vars** (see §4). Always verify the deployed bundle after pushing.
- **Real students have no attendance/marks/quiz data yet** → dashboard/analytics/leaderboard may show
  zeros/empty for them; that's expected until data is entered.

---

## 9. Common Commands

```bash
npm run dev                 # local dev server (uses .env)
npm run build               # tsc -b + vite build → dist/
npx tsc --noEmit            # type-check only
npx vitest run              # run all tests (177 currently)
npx wrangler pages deploy dist --project-name=mis-app --branch=main   # direct deploy to production
git status -sb              # branch + change summary
```

---

## 10. Update Protocol (keep this file alive)

When you finish a task or before ending a session, update:
1. **§0 Quick Status** — date, latest commit, build state, resume point.
2. **§6 Resume Here** — check off completed steps, point to the next one.
3. **Work Log** below — add a dated entry at the TOP (newest first) describing what changed and why.

### Convention: specific error messages, not generic ones (added 2026-07-06)
Whenever a server-side function (RPC, `SECURITY DEFINER` function) can distinguish
**why** an operation failed, return that specific reason as a string field (e.g.
`{ status: 'denied', reason: 'wrong-section' }`), and thread it end-to-end:
domain type → parser allowlist (with a safe fallback for unrecognized values) →
a per-reason UI copy map (title + body). Never collapse multiple distinct
failure causes into one generic message just because it's convenient.
`messages.error.generic` ("Something went wrong…") is reserved for truly
unstructured failures only — network errors, unexpected JS exceptions, or
anything the server did not (or could not) explain. Before adding a new
`catch { setError(messages.error.generic) }`, check whether the failure path
actually has a knowable reason; if it does, give it its own message instead.
See `request_quiz_access` (migrations 0024/0025/0027) and `submit_attempt`
(migration 0028) for the reference pattern.

### Work Log (newest first)
- **2026-07-06** — **`submit_attempt` now returns specific denial reasons (migration `0028`)**: audited "does every error show a specific message, not a generic one" — found `request_quiz_access`/`StudentQuizAccessView` already did this (per-reason `DENIED_COPY`), but `submit_attempt` (quiz submission) still collapsed every failure into one generic `not-registered`, and `QuizAttemptView` always showed `messages.auth.notRegistered` for any denial. Fixed: `submit_attempt` now returns `not-authenticated` / `quiz-not-found` / `teacher-account` / `not-registered` distinctly (also re-checks the teacher-account gate at submission, matching `request_quiz_access`). Added `SubmitAttemptDeniedReason` (domain), threaded it through `parseSubmitOutcome` with a safe fallback for unrecognized values, and exported `DENIED_COPY` from `StudentQuizAccessView` so `QuizAttemptView` shows the exact same specific wording instead of a generic fallback — no duplicated copy. Added 2 new parser tests (reason preserved; unrecognized reason safely falls back). **Established convention for future work** (documented in "Update Protocol" below): whenever a server RPC can return a structured `reason`, thread it end-to-end (type → parser → UI copy) instead of collapsing to one generic string; `messages.error.generic` remains correct ONLY for truly unstructured failures (network errors, unexpected JS exceptions) where the server provided no reason at all. Audited remaining `messages.error.generic` usages across the app (Timetable, Syllabus, Roster, Quiz, Material, Marks, Leaderboard, Heatmap, Attendance views) — confirmed all of them are legitimate catch-all fallbacks for unstructured errors, not hidden structured reasons. tsc + 209 tests + build green. (Uncommitted — pending user confirm; migration 0028 must be run in Supabase.)
- **2026-07-06** — **Teacher/student identity separation (migration `0027`)**: closed a real security gap — `is_teacher()` only checked "does a teachers row exist", so ANY signed-in Google account (including a student who already self-registered via a quiz link) could complete onboarding and become a teacher, with full RLS access to every teacher's data. Fixed with: (A) new `allowed_teacher_emails` allowlist table, bootstrapped with every email already in `teachers` (grandfathered, nobody currently onboarded gets locked out); (B) a `BEFORE INSERT/UPDATE` trigger on `teachers` (`enforce_teacher_eligibility()`) that rejects the write at the DB level unless the email is on the allowlist AND no `students` row with that email exists yet — cannot be bypassed by any client code path, only by direct SQL; (C) `request_quiz_access` now denies with reason `teacher-account` if the signed-in email belongs to an existing teacher, so a teacher can never be silently self-registered as a "new student" on someone else's quiz; (D) `add_allowed_teacher(email)` RPC so an existing teacher can approve a new teacher's email without SQL Editor access. Added `teacher-account` to `QuizAccessDeniedReason` (domain + parser allowlist + student-facing copy in `StudentQuizAccessView`). Note: verified `students.id` is NOT `auth.uid()` in the current (0022+) design — identity is matched by email/enrollment, not id, correcting an earlier wrong assumption made mid-session. tsc + 207 tests + build green. (Uncommitted — pending user confirm; migration 0027 must be run in Supabase. Afterwards, approve any teacher email beyond the ones already onboarded via `select public.add_allowed_teacher('newteacher@gmail.com');` while signed in as an existing teacher, or insert directly into `allowed_teacher_emails`.)
- **2026-07-06** — **Dev/prod environment separation documented**: identified that `.env` and `.env.production` both point at the same Supabase project (`sdhpgvshexqsidkivjnq`), so local testing writes directly to the would-be production database with no isolation. Since only the developer is using the project so far (no real onboarding yet), this is a clean cutover: keep the current project as **testing**, create a NEW Supabase project as **production**. Wrote `docs/PRODUCTION_SETUP.md` — a full ordered checklist (all 26+ migrations in order, real-curriculum seeds only, Google OAuth + redirect URLs, the `sensitive-files` storage bucket, pre-provisioning teacher accounts since there's no self-signup, a separate Gemini key for prod, and the ongoing "test on dev project → then apply to prod project" migration workflow). No code/schema changes in this entry — purely a setup doc; `.env.production` will be updated once the user creates the new Supabase project and shares its URL/anon key.
- **2026-07-06** — **Fixed cross-section syllabus progress leak (migration `0026`)**: root cause was `teacher_topic_progress` keyed only by `(teacher_id, topic_id)` — a teacher teaching the same subject to two sections (e.g. CSE-5A and CSE-5B) would see a topic marked taught in BOTH as soon as they ticked it in one, since section was never part of the key (a "missing dimension in the key" / key-granularity bug). Verified this is the ONLY feature with this bug — attendance/marks/quiz-attempts/submissions are per-student (naturally section-safe since a student belongs to exactly one section) and shared materials (quiz/assignment content) are intentionally subject-wide, not per-teacher completion state. Fix: added `section_id` to `teacher_topic_progress`, new primary key `(teacher_id, section_id, topic_id)`. Per explicit user decision, existing progress rows were RESET (deleted) rather than guess-migrated, since the old rows never recorded which section they belonged to. `syllabusTrackerAccess.ts` (`listUnits`, `setTopicComplete`) now take `sectionId`; `SyllabusTrackerView`/`SyllabusTrackerPage` now read the global `selectedSectionId` and require both a subject AND section to be selected. tsc + 207 tests + build green. (Uncommitted — pending user confirm; migration 0026 must be run in Supabase — note it deletes all existing teacher_topic_progress rows, teachers will need to re-mark taught topics per section.)
- **2026-07-06** — **Syllabus Tracker redesign (all analyzed issues fixed in one pass)**: rewrote `SyllabusTrackerView.tsx` to use the shared UI kit (Card/SectionHeader/Badge/ProgressBar/SearchInput/Button + design tokens) instead of ad-hoc markup, matching Roster/Reports/Quiz pages. Fixes: (1) design-system mismatch → now token-based; (2) units are now collapsible (accordion, closed by default) instead of always-open walls of checkboxes; (3) auto-expands the first not-fully-taught unit on load, and auto-expands any unit matching a topic search, so the teacher lands where they need to; (4) added a topic search box in the header; (5) added a per-unit "Mark all taught / not taught" bulk action; (6) right sidebar is no longer near-empty — added a "Per-unit breakdown" progress list and an "Up next" panel (next 5 untaught topics across units); (7) progress bars are now color-coded by tone (red/amber/green via progressTone()) for at-a-glance status, and completed topics show a check icon (not just strikethrough) for a non-color-dependent signal; (8) clearer empty state explaining the master curriculum hasn't been seeded, vs a generic message. tsc + 207 tests + build green. (Uncommitted — pending user confirm; no DB migration needed for this change.)
- **2026-07-06** — **Quiz page redesign + saved quizzes + submissions + per-attempt reset**: the quiz data layer (listQuizzes / listQuizResults / deleteQuiz + SavedQuizSummary / QuizResultRow / deriveQuizStatus, in quizAccess.ts + demo) already existed but the View wasn't using it (only showed the just-published quiz in memory — that's why "saved quiz nahi dikh raha"). Rewrote `QuizCreationView.tsx` to a token-based redesign driven by the global Subject selector: a persistent "Saved quizzes" table (subject-scoped by filtering listQuizzes to the selected subject's unit ids — so AI-generated quizzes show too) with Status badge, active window, questions/responses/avg, Copy link, Results, Delete; a per-quiz Results panel (student, enrollment, section, score/total, submitted time) with a per-row "Remove attempt" (Action A). Added `resetAttempt(quizId, studentId)` to quizAccess + demo, backed by new migration `0023_reset_quiz_attempt.sql` (SECURITY DEFINER, is_teacher() + quiz-owner gate — deletes one attempt so that student can re-attempt THAT quiz only; other subjects untouched; identity binding not touched). `QuizCreationPage.tsx` now passes subjectId/subjectName and no longer needs the students prop (results come from listQuizResults; demo still fed roster for labels). Removed the old global "Quiz Registrations" panel from Profile (superseded). tsc + 206 tests + build green. (Uncommitted — pending user confirm; run migration 0023 in Supabase.)
- **2026-07-06** — **Quiz access fix + teacher preview + student self-register/reset** (migration `0022`): root-caused "This account is not registered for this quiz" — roster is imported enrollment-only (email NULL) but `request_quiz_access` matched by Google email, so nobody matched. Reworked the DB function: (A) owner-teacher gets a `preview` grant (frontend already renders read-only preview), (B+) email-not-on-roster falls back to enrollment self-registration — student enters enrollment once, verified Google email is bound+locked to that enrollment (student_roster.email + students.email filled; a different account can't reuse it), student row upserted by the stable unique enrollment (claims the seeded row, no dup). (C) `reset_student_binding(enrollment)` + `list_student_registrations()` (both `is_teacher()`-gated) added in the DB. NOTE: the global "Quiz Registrations" panel + `quizRegistrationAccess.ts` were REMOVED from the Profile page — per user decision the reset is being reworked as a SUBJECT-SCOPED "Remove attempt (re-allow this subject)" action on the Quiz page (driven by the global Subject selector), to be built during the quiz-page redesign (new fn `reset_quiz_attempts_for_subject(enrollment, subject_id)`). The identity `reset_student_binding` remains in DB for the rare global-unbind case. Frontend/domain/parser already supported `preview`/`not-active`. tsc + 206 tests + build green. (Uncommitted — pending user confirm; migration 0022 must be run in Supabase.)
- **2026-07-06** — **Teacher Profile & Teaching-Setup editor** (post-onboarding edit): new `src/features/profile/ProfilePage.tsx` + `hooks/useProfileData.ts` at route `/profile` (inside TeacherShell, onboarded-gated). Reuses onboarding `SemAccordion` pre-filled with the teacher's current assignments; edit subjects/sections across ALL live batches (Decision B) and Save via the existing idempotent `saveOnboarding` (delete-all + re-insert). New `fetchCurrentSelection()` + pure `assignmentsToSelection()` in onboarding api (inverse of buildAssignments). `SelectedSectionContext` gained `refresh()` (reloads sections → cascades subject reload) called after save so changes show instantly without page reload. Sidebar footer user block is now a button → `/profile` (logout stays separate). Removing a subject only hides it from the selector; historical attendance/marks are owner+section scoped so they are NOT deleted. tsc + 206 tests + build green. (Uncommitted — pending user confirm.)
- **2026-07-06** — **Sem-5 seed rewritten to match official RGPV V-SEM PDF**: reworked every subject in `sem5_syllabus_seed.sql` unit-by-unit to the AICTE Flexible Curricula scheme the user supplied. Corrected CS-503A (Descriptive Statistics wording + added Big Data Technologies topics), fully rewrote CS-503B Pattern Recognition (Introduction / Classification / Clustering / Feature Extraction / Recent Advances) and CS-503C Cyber Security (5 units per PDF ordering incl. Indian Evidence Act vs IT Act), aligned CS-504A/B/C to PDF wording, CS-505 Linux now 6 topic blocks (Overview / Shell / File System / Process Control / System Security / DHCP), CS-506 Python = the 15 official experiments grouped into 5 units. CS-501/CS-502 kept (already matched). Idempotent + progress-safe; apostrophes escaped. Pending user review before running in Supabase.
- **2026-07-06** — **Sem-5 syllabus + elective support**: migration `0021` adds `syllabus_subjects.elective_group` and corrects the V-SEM subject list (CS-503A/B/C Departmental Elective, CS-504A/B/C Open Elective, CS-505 Linux Lab, CS-506 Python Lab; keeps CS-501/CS-502). New seed `sem5_syllabus_seed.sql` (units + topics for all sem-5 subjects incl. both labs; idempotent + progress-safe). Onboarding now groups elective variants and enforces exactly one per group: new `ElectiveGroupRow.tsx` (radio + section chips), `SemAccordion.tsx` partitions non-elective vs grouped electives, `types.ts`/`onboarding.ts` carry `electiveGroup`. Also fixed a pre-existing test-harness gap: `AppLayout.test.tsx` now wraps in `AuthProvider` (with a stub service) since `GlobalCommandCenter` calls `useAuth`. tsc + 206 tests + build green. (Uncommitted — pending user confirm.)
- **2026-07-05** — **AI Quiz Generator** (Gemini): Phase 1 migration `0020` (quiz `active_from`/`active_until` + window check in `request_quiz_access`; new `not-active` denied reason threaded through parser + domain type + student view). Phase 2 Cloudflare Pages Function `functions/api/generate-quiz.ts` (server-side Gemini, `GEMINI_API_KEY` secret). Phase 3 pure `quizGenerationService.ts` (prompt builder + response validator + tests, 9 new). Phase 4 `quizAccess.createQuiz` active-window fields + `unitOptions.loadTopicNamesForUnit` + `aiQuizClient.ts`. Phase 5 `AiQuizGeneratorPage.tsx` (unit/#q/difficulty/time/active-window → generate → editable preview → save + share link) wired at `/ai/quiz-generator` behind `VITE_FEATURE_AI`. tsc + 206 tests + build green. (Uncommitted — pending user confirm + Gemini key/flag setup.)
- **2026-07-05** — **Subject/unit UNIFICATION** (migration `0019`): repointed operational FKs (quizzes, assignments, assignment_submissions, lab_manual_submissions, attendance, mark_components, timetable_entries) from legacy `subjects`/`units` to `syllabus_subjects`/`syllabus_units`; deletes orphan rows first (clean start). New `unitOptions.ts` loader; Quiz + Assignment pages now load units from `syllabus_units` by the selected subject. Root cause fixed: Quiz/Assignment showed empty units (and attendance/marks writes would FK-fail) because they were on the legacy id space. tsc + 197 tests + build green. (Uncommitted — pending user confirm.)
- **2026-07-05** — **Syllabus Tracker (multi-teacher)**: migration `0018` (syllabus_units + syllabus_topics master, teacher_topic_progress per-teacher). New `syllabusTrackerAccess.ts` (master + progress merge, toggle taught). Reworked `SyllabusTrackerView` to tracking-only (checkboxes + progress bars, unit heading shows "Unit N: Title"). `SyllabusTrackerPage` uses global subject. Seeds `sem4_syllabus_seed.sql` (30 units/312 topics) + optional `sem4_java_lab_seed.sql`. tsc + 197 tests + build green. (Uncommitted — pending user confirm.)
- **2026-07-05** — **Global Section | Subject selector**: `SelectedSectionContext` now also loads the selected section's subjects + holds selected subject (persisted per section). Top bar shows two dropdowns (fixed widths + truncation to stop overlap). Attendance/Marks/Syllabus follow the global subject; Timetable uses full subject list. Committed `dd2b025`.
- **2026-07-05** — **Agentation dev tool**: wired `<Agentation />` in `main.tsx` guarded by `import.meta.env.DEV` (dev-only, tree-shaken from prod — verified). Added `agentation` to devDependencies. Committed on `feature/agentation` then cherry-picked to `feature/onboarding` (`133d38e`). (Branching agentation off `main` briefly showed the old app — fixed by returning to `feature/onboarding`.)
- **2026-07-05** — **Multi-teacher per-teacher isolation**: migrations `0014` (owner_id + owner RLS on operational tables; sections/students stay shared) + `0015` (dashboard RPC owner-scoped) + `0016` (align roster batch) + `0017` (merge legacy CS-5A → CSE-5A = 66). `getOrCreateRealSection` uses limit(1) to survive stray dupes. Committed `dd2b025`.
- **2026-07-05** — **Multi-teacher identity**: migration `0012` — `is_teacher()` now true if a `teachers` row exists for auth.uid() (onboarding-based), removing hardcoded-email dependency. `0013` deduped sections + unique (name,batch). Fixed dashboard-empty root cause (RLS was blocking non-hardcoded emails). Committed `b9c1826`.
- **2026-07-05** — **Login redirect loop fix**: `App.tsx` `SignInRoute`/`RootRedirect` gate on `actor.kind !== 'anonymous'` (not `isTeacher`); removed buggy auto-signOut 403 loop; `RequireTeacher` allows any authenticated user. Committed `4d17614`, pushed to `origin/feature/onboarding`.
- **2026-06-30** — RESOLVED Cloudflare git-build env issue by committing `.env.production` (public values only).
  `git push origin main` is now safe and auto-deploys a working build (verified build without `.env` bakes real URL).
- **2026-06-30** — Confirmed migrations 0008 & 0009 were run in Supabase (dashboard now section-scoped via 0009).
- **2026-06-30** — Fixed hosted login: diagnosed Cloudflare Git build using placeholder env (confirmed via
  Network tab + bundle inspection). Merged `feature/new-design` → `main`, pushed. Git build still didn't inject
  env, so deployed production via `wrangler pages deploy dist --branch=main` (verified real Supabase URL live).
- **2026-06-30** — Added migration 0009 (dashboard scoped to selected section) + 0008 (RPC by semester/section_id,
  removed `CS-` name matching). Fixed `.gitignore` `*.sql` hiding migrations.
- **2026-06-30** — Built single global DB-driven section selector (SelectedSectionContext); migrated all pages
  off the hardcoded semester/section hooks; removed `useSelectedSemester.ts`.
- **2026-06-30** — UI redesign Step 1: merged reference theme tokens into Tailwind v3 (neutral shadcn palette,
  Geist font, radius/shadow). Step 2 (layout shell) is the next task.
- **2026-06-30** — Merged collaborator's `origin/main` (semester/section selectors) into local work; resolved
  5 page-level conflicts by combining both approaches.
- **2026-06-30** — Implemented 3 features beyond spec: CSV roster import, batch/section model wiring, shared
  materials across sections. Added migration 0007 + real 196-student seed (CSE-5A/5B/5C).
- **2026-06-30** — Recovered a crashed chat session (un-hid sessions in Kiro's session store) and exported a
  readable transcript to `.kiro/recovered-session-transcript.md`.

---

## 11. Multi-Teacher Model & Syllabus Tracker (2026-07-05 session)

### Identity (who is a "teacher")
- `is_teacher()` (migration `0012`) returns true when a row exists in `public.teachers` for `auth.uid()`
  (created at onboarding), OR the legacy JWT-role / `app.teacher_email` checks (kept for back-compat).
- Navigation: `RequireTeacher` + `App.tsx` allow ANY authenticated (non-anonymous) user into the teacher
  area; the onboarding gate (`teachers.onboarded`) decides dashboard vs `/onboarding`. `isTeacher` is no
  longer used for routing.
- OTP login uses `shouldCreateUser:false` → only pre-provisioned Supabase Auth users can log in as teachers.

### Data sharing model (confirmed with product owner)
- **SHARED across all teachers:** `sections`, `students`, `student_roster`, `syllabus_subjects`, `batches`,
  and the syllabus master (`syllabus_units`, `syllabus_topics`). Roster is imported once per batch and every
  teacher of that batch sees the same students.
- **PRIVATE per teacher (`owner_id = auth.uid()`, RLS-scoped):** attendance, mark_components, mark_values,
  timetable_entries, subjects, units, topics, quizzes, questions, assignments, assignment_submissions,
  lab_manual_submissions, files, leaderboard_config, settings, and `teacher_topic_progress`.
- `owner_id` columns default to `auth.uid()`, so client inserts self-stamp — no app change needed for writes.

### Two subject systems (IMPORTANT gotcha)
- `syllabus_subjects` (onboarding master, e.g. `CS-502`) — this is what the global Subject selector and
  `teacher_assignments` use. The Syllabus Tracker is keyed to THIS id.
- Legacy `subjects`/`units`/`topics` (from 0001) — per-teacher now, but their ids never matched
  `syllabus_subjects` (that mismatch broke the old tracker). The new Syllabus Tracker uses NEW tables
  (`syllabus_units`/`syllabus_topics`) keyed to `syllabus_subjects`, sidestepping this entirely.

### Syllabus Tracker (how it works)
- Master curriculum (units + topics) is shared/read-only; seeded via SQL (service role bypasses RLS).
- Per-teacher completion lives in `teacher_topic_progress` (presence of a row = that teacher taught that
  topic). Toggling a checkbox inserts/deletes the teacher's own row.
- `syllabusTrackerAccess.listUnits(subjectId)` loads master units+topics and overlays the teacher's progress;
  `setTopicComplete(topicId, complete)` upserts/deletes progress. Unit headings render "Unit N: Title".
- Files: `src/data/access/syllabusTrackerAccess.ts`, `src/presentation/views/SyllabusTrackerView.tsx`,
  `src/presentation/pages/SyllabusTrackerPage.tsx`, migration `0018`, seeds `sem4_syllabus_seed.sql` (+ optional
  `sem4_java_lab_seed.sql`).

### Unification (2026-07-05, migration 0019)
- The whole app now uses ONE subject/unit identity: `syllabus_subjects` + `syllabus_units` (the onboarding
  master that the global Subject selector uses). Operational FKs were repointed there; legacy
  `subjects`/`units`/`topics` are retired (unused, not dropped).
- New loader `src/presentation/loaders/unitOptions.ts` (`loadUnitsForSubject` / `loadUnitsForSubjects`) reads
  `syllabus_units` for the selected subject. Quiz + Assignment pages use it; Attendance/Marks/Timetable already
  used the global subject (they just needed the FK repoint).
- Net effect: pick a subject in the top bar → its units/topics appear and work in Syllabus, Quiz, Assignment;
  attendance/marks/timetable save against that same subject.

### Electives in onboarding (2026-07-06, migration 0021)
- `syllabus_subjects.elective_group` (nullable text) groups variants of one choice. Sem-5 uses two groups:
  **"Departmental Elective"** (CS-503A Data Analytics / CS-503B Pattern Recognition / CS-503C Cyber Security)
  and **"Open Elective"** (CS-504A Internet & Web Technology / CS-504B OOP / CS-504C Intro to DBMS).
- Onboarding UI: `SemAccordion.groupElectives()` partitions a semester's subjects into non-elective
  (rendered via `SubjectRow`) and elective groups (rendered via new `ElectiveGroupRow`, a radio that enforces
  **exactly one variant per group**; picking a variant then shows its section chips).
- Labs **CS-505 (Linux)** and **CS-506 (Python)** are real trackable subjects (kind `lab`), NOT skipped — they
  have full units/topics in `sem5_syllabus_seed.sql`.
- `SyllabusSubject.electiveGroup` (in `types.ts`) + `onboarding.ts` (`SubjectSeed`, `MOCK_SUBJECTS`,
  `SubjectRow`, `toSubject`, `fetchSubjectsForSems`) all carry the new column. CS ≡ CSE kept consistent.

### Known follow-ups
- Dashboard "syllabus progress %" still uses the legacy topics model; wire it to
  `syllabus_topics` + `teacher_topic_progress` for the section's subjects (next optional task).
- Remaining semesters' curriculum: user will provide unit/topic data; add as more seed files matching
  `syllabus_subjects` codes.
- Onboarding does not auto-create legacy `subjects` rows, so attendance/marks pages need their own subject
  data path — separate from the syllabus master (not yet bridged).
