# 📋 PROJECT HANDOFF & CONTEXT — Teacher Academic MIS

> **Purpose of this file.** This is the single source of truth for project context and progress.
> If a chat session crashes, you switch AI agents, or you start a new session, **read this file first**
> to understand what the project is, everything that has been done, where work stopped, and how to resume.
>
> **Keep it updated.** After finishing any meaningful task, update the "Current Status" and "Work Log"
> sections below (newest entry on top). Treat this like a flight recorder — small, frequent updates.

---

## 0. Quick Status (READ THIS FIRST)

- **Last updated:** 2026-07-05
- **Active branch:** `feature/onboarding` (multi-teacher + onboarding + syllabus work; pushed to origin up to the agentation commit). NOT yet merged to `main`.
- **Latest commit (pushed):** `133d38e` — "feat(dev): wire dev-only Agentation annotation tool at app root".
  **Uncommitted (working tree):** Syllabus Tracker feature — migration `0018`, `syllabusTrackerAccess.ts`, reworked `SyllabusTrackerView.tsx`/`SyllabusTrackerPage.tsx`, seeds `sem4_syllabus_seed.sql` + `sem4_java_lab_seed.sql`. (Pending commit — user to confirm.)
- **Build/tests:** ✅ green — `npx tsc --noEmit` clean, `npx vitest run` 197 tests pass, `npx vite build` succeeds.
- **Model shift this session:** moved from single-teacher to **MULTI-TEACHER**. Identity is now membership-based
  (`is_teacher()` = has a row in `teachers`), NOT the hardcoded `VITE_TEACHER_EMAIL`. See §11.
- **Where work stopped / resume point:** Syllabus Tracker is code-complete; user is uploading remaining
  semesters' curriculum later. Optional follow-up: wire dashboard "syllabus progress %" to the new
  master+progress model (currently still reads legacy topics). See §6.

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

Seeds in `src/data/seeds/`:
- `seed.sql` — original 12 demo students (IWT 5th Sem). 
- `seed_real_roster.sql` — **real 196 students** across 3 sections `CSE-5A/5B/5C` (batch 2024-2028, 5th Sem). ✅ ran.
- `section_A.csv`, `section_B.csv`, `section_C.csv` — source roster (enrollment,name) for the seed/import.
- `onboarding_seed.sql` — RGPV CSE Sem 1-8 `syllabus_subjects` + live `batches`. ✅ ran.
- `sem4_syllabus_seed.sql` — **sem-4 master syllabus**: 6 subjects (BT-401, CS-402/403/404/405, CS-406 Java), **30 units, 312 topics**. Idempotent + progress-safe. ⏳ RUN after 0018.
- `sem4_java_lab_seed.sql` — optional one-click: adds CS-406 Java 20 lab programs as an extra unit. ⏳ optional.

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

### Work Log (newest first)
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

### Known follow-ups
- Dashboard "syllabus progress %" still uses the legacy topics model; wire it to
  `syllabus_topics` + `teacher_topic_progress` for the section's subjects (next optional task).
- Remaining semesters' curriculum: user will provide unit/topic data; add as more seed files matching
  `syllabus_subjects` codes.
- Onboarding does not auto-create legacy `subjects` rows, so attendance/marks pages need their own subject
  data path — separate from the syllabus master (not yet bridged).
