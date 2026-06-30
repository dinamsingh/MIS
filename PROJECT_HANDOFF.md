# 📋 PROJECT HANDOFF & CONTEXT — Teacher Academic MIS

> **Purpose of this file.** This is the single source of truth for project context and progress.
> If a chat session crashes, you switch AI agents, or you start a new session, **read this file first**
> to understand what the project is, everything that has been done, where work stopped, and how to resume.
>
> **Keep it updated.** After finishing any meaningful task, update the "Current Status" and "Work Log"
> sections below (newest entry on top). Treat this like a flight recorder — small, frequent updates.

---

## 0. Quick Status (READ THIS FIRST)

- **Last updated:** 2026-06-30
- **Active branch:** `main` (all recent work merged here and pushed to GitHub)
- **Latest commit:** `dd8afd1` — "fix: stop gitignoring project migrations/seeds; add dashboard section-scoped RPC (0008, 0009)"
- **Build/tests:** ✅ green — `npx tsc --noEmit` clean, `npx vitest run` 177 tests pass, `npx vite build` succeeds.
- **Production site:** https://mis-app.pages.dev — ✅ login fixed (deployed via direct upload; see §4).
- **Where work stopped / resume point:** The **UI redesign** is only at **Step 1 of N** (theme tokens merged).
  The next planned step is **Step 2: restyle the layout shell (sidebar + topbar + content)**, then restyle
  one screen at a time. See §6 "Resume Here".

### ⚠️ Action items the human still needs to do (cannot be automated from code)
1. ✅ **DONE** — Migrations `0007`, `0008`, `0009` and `seed_real_roster.sql` have all been run in Supabase.
   (0009 supersedes 0008 — dashboard is now section-scoped.)
2. **Supabase Auth**: ensure the teacher user exists & email is confirmed (login depends on it).
3. **Supabase DB setting** for data visibility (RLS): 
   `ALTER DATABASE postgres SET app.teacher_email = 'singhdindayal394@gmail.com';`

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
- `git push origin main` triggers a Cloudflare auto-build — **but see §4: that build does NOT inject env vars**.

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
| `0009_dashboard_section_scoped.sql` | Scope dashboard metrics to the SELECTED section (not whole semester) | ✅ ran (active version) |

Seeds in `src/data/seeds/`:
- `seed.sql` — original 12 demo students (IWT 5th Sem). 
- `seed_real_roster.sql` — **real 196 students** across 3 sections `CSE-5A/5B/5C` (batch 2024-2028, 5th Sem). ✅ ran.
- `section_A.csv`, `section_B.csv`, `section_C.csv` — source roster (enrollment,name) for the seed/import.

> **Note:** `.gitignore` previously had a blanket `*.sql` rule (added by collaborator) that hid migrations.
> Fixed by adding `!src/data/migrations/*.sql` and `!src/data/seeds/*.sql` exceptions.

---

## 4. Environment & Deployment (CRITICAL — read before deploying)

### Required env vars (Vite inlines `VITE_*` at BUILD time)
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TEACHER_EMAIL`,
`VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`, `VITE_FEATURE_AI`.
Values live in local `.env` (git-ignored). For local dev: `npm run dev`.

### 🔴 Known Cloudflare issue (IMPORTANT)
The Cloudflare Pages **Git auto-build does NOT inject the dashboard env vars** into the build, even though
they are set as Plaintext under "Variables and secrets" for Production. Result: Git-built bundles fall back
to placeholder Supabase config (`http://localhost:54321` / `placeholder-anon-key`) and **login fails on the
hosted site** ("incorrect email/password"), while localhost works fine.

**Why:** `src/data/supabase/client.ts` uses a placeholder fallback when env is missing at build time, so the
app still renders but all backend calls fail. The Git build isn't receiving the vars (a Cloudflare build-env
config quirk for this project — likely the vars need to be under the **Build** configuration, not only
"Variables and secrets").

### ✅ Reliable deploy method (until the Git-build env issue is fixed): DIRECT UPLOAD
Build locally (env is baked from `.env`), then upload the bundle directly:
```bash
npm run build
npx wrangler pages deploy dist --project-name=mis-app --branch=main
```
- `wrangler` is already authenticated as `singhdindayal394@gmail.com`.
- `--branch=main` deploys to **production** (`mis-app.pages.dev`). Use a different branch name for a preview.
- This was used to fix production login on 2026-06-30 (verified: bundle now contains the real Supabase URL).

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
- [ ] (Optional) Fix the Cloudflare **Git-build env injection** so `git push` deploys work without manual
      direct upload. Until then, deploy via `wrangler pages deploy` (see §4).
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
