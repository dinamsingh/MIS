# Attendance Module — Complete Fix Plan

> **Purpose:** This document is the implementation brief for fixing every known gap in the
> Attendance section. It was produced by a deep code audit (teacher's perspective).
> The implementing agent should work through the phases **in order** — Phase 1 changes
> the data model that later phases depend on.
>
> **Rule for the implementer:** Read every file listed in "Key files" before writing code.
> Follow existing project conventions (layered architecture: `presentation → domain → data/access`,
> pure functions in `domain/services` with unit tests, Supabase access in `data/access`,
> SQL migrations in `src/data/migrations` with the next sequential number and a
> Problem/Fix header comment like the existing migrations).

---

## Key files (current state)

| Layer | File | Role |
|---|---|---|
| Page | `src/presentation/pages/AttendancePage.tsx` | Wires view to data access; hardcoded time slots; roster loader |
| View | `src/presentation/views/AttendanceView.tsx` | Entire attendance UI (~1100 lines): marking table, quick mark, summary tiles, range report modal |
| Domain | `src/domain/services/attendanceService.ts` | Types (`PeriodKey`, `AttendanceStatus`, `AttendanceStatusMark`), pure aggregation (`liveCounts`, `aggregateRangeTallies`), in-memory service |
| Domain | `src/domain/services/quickAttendance.ts` | Present-list paste matching (`parsePresentTokens`, `previewPresentList`, `applyPresentList`) + tests in `quickAttendance.test.ts` |
| Data | `src/data/access/attendanceAccess.ts` | Supabase access; **localStorage hack for leave/N-A** (`mis_attendance_status_v1`) |
| Data | `src/data/access/rows.ts` | Row mappers (`toAttendanceMark`, `fromAttendanceMark`) |
| Demo | `src/data/demo/localDemoMode.ts` | Local demo attendance access (must be kept in parity with any contract change) |
| DB | `src/data/migrations/0001_init_schema.sql` | `attendance` table: `present boolean`, unique `(student_id, section_id, subject_id, date, time_slot)` |
| DB | `src/data/migrations/0002_rls_policies.sql` | `teacher_all_attendance` policy — any teacher, all rows |
| DB | `src/data/migrations/0004_audit_trigger.sql` | Audit trigger already writes to `audit_log` on attendance changes |
| Related | `timetable_entries` table (see `0001_init_schema.sql`, `0019_unify_subjects_units.sql`) | Exists but unused by attendance |
| Related | `src/presentation/context/SelectedSectionContext` | Global section/subject selector the page is scoped to |

Latest migration at time of writing: `0028_submit_attempt_specific_errors.sql` → new migrations start at **0029**.

---

# PHASE 1 — Data integrity (CRITICAL, do first)

## Fix 1: Persist Leave / Not-Applicable status in the database (removes localStorage hack)

**Problem.** `AttendanceStatus` has 4 values (`present | absent | leave | not-applicable`) but the
`attendance` table only stores `present boolean`. The extended status lives ONLY in browser
localStorage (`mis_attendance_status_v1` in `attendanceAccess.ts`). Worse, on save, leave/N-A
students' rows are **deleted** from the DB (`saveStatusPeriod`, the `excludedStudentIds` delete).
Consequences: leave marks vanish on another device/browser or after cache clear; DB and UI
disagree; official records are device-local.

**Fix.**
1. **Migration `0029_attendance_status.sql`:**
   - `alter table public.attendance add column if not exists status text not null default 'present' check (status in ('present','absent','leave','not-applicable'));`
   - Backfill: `update public.attendance set status = case when present then 'present' else 'absent' end;` (guard so re-runs are idempotent — e.g. only where status is default-mismatched, or rely on the add-column default + a one-shot update).
   - Keep the `present` boolean column **in sync as a generated concept**: it is used by dashboard RPCs, heatmap, leaderboard, reports. Simplest safe approach: keep `present` as a real column and always write both from the app (`present = (status = 'present')`). Add a comment in the migration explaining that `present` is derived and `status` is authoritative.
   - Leave/N-A rows now REMAIN in the table (status = 'leave'/'not-applicable'), and every percentage aggregation must count only `status in ('present','absent')` in the denominator.
2. **`rows.ts`:** extend `AttendanceRow` with `status`; add mappers `toAttendanceStatusMark(row)` / `fromAttendanceStatusMark(key, mark)` that set both `status` and `present`.
3. **`attendanceAccess.ts`:**
   - Rewrite `loadStatusPeriod` to select `status` directly from the table. Delete the localStorage merge logic.
   - Rewrite `saveStatusPeriod` as a **single upsert of ALL marks** (including leave/N-A) on the existing conflict target. Remove the delete-excluded-students step entirely. This also fixes the multi-step partial-failure problem (Fix 2) because it becomes one statement.
   - **One-time migration of existing localStorage data:** on first load after deploy, if `mis_attendance_status_v1` exists, offer/perform an import: for each stored period, upsert the leave/N-A marks into the DB, then remove the key. Implement as a small function `migrateLocalStatusStore(client)` called from the page (or app bootstrap), wrapped in try/catch, idempotent.
   - Update `loadStudentOverall` and `loadRangeReport` to select `status` and count denominators as `status in ('present','absent')` only. (Currently every row counts toward `total`, which after this change would wrongly include leave/N-A rows.) `aggregateOverallRows` and `aggregateRangeTallies` must take status-aware rows: `total += 1` only when status is present/absent.
4. **`attendanceService.ts`:** update `aggregateRangeTallies` (and its row type `RangeAttendanceRow`) to carry `status` instead of bare `present`; keep it pure; update/extend unit tests.
5. **Demo mode:** `createLocalDemoAttendanceAccess` in `localDemoMode.ts` must implement the same contract (store status, not just present) so demo behaves identically.
6. **Everything downstream that reads `attendance.present`** (dashboard RPCs `0005/0008/0009/0015`, heatmap, leaderboard) keeps working because `present` stays in sync — but note in code review that leave/N-A rows now exist in the table with `present = false`; any SQL that computes `count(*)` as the denominator must be checked and, where needed, changed to `count(*) filter (where status in ('present','absent'))`. **Audit each RPC/migration that aggregates attendance and patch in the same migration file 0029 (create or replace function).**

**Acceptance:** mark a student Leave, save, hard-refresh in an incognito window → Leave still shows. Overall % excludes leave from denominator. No references to `mis_attendance_status_v1` remain except the one-time import.

## Fix 2: Atomic save (no partial failure)

**Problem.** `saveStatusPeriod` did localStorage write + upsert + delete as 3 uncoordinated steps.

**Fix.** After Fix 1 this collapses to a single `upsert`. Verify no other multi-step write remains.
If any multi-statement write is still needed, move it into a Postgres function (RPC) so it runs in
one transaction. **Acceptance:** a single failed network call leaves DB unchanged.

## Fix 3: Accidental full-roster save guard

**Problem.** Roster defaults everyone to Present (`statusMapFromMarks` fallback `'present'`) and
Save writes ALL students. One accidental Save on an untouched period = fake 100% attendance
permanently recorded.

**Fix.**
1. In `AttendanceView.tsx`, when the period has **no saved attendance** (`hasSavedAttendance === false`)
   and the teacher clicks Save **without having changed anything** (`dirty === false` — note Save is
   currently possible in this state), show a confirmation dialog: *"You haven't marked anyone —
   this will record all N students as Present for {date}, {slot}. Continue?"* with Confirm/Cancel.
2. Additionally show a persistent subtle banner on unsaved fresh periods: "Not yet saved — all
   students default to Present" so the state is legible.
3. Do NOT change the default-Present convention itself (teachers rely on mark-the-absentees flow);
   the guard is on the save action.

**Acceptance:** untouched fresh period + Save → confirm dialog; after any explicit mark or quick-mark, Save is direct.

## Fix 4: Unsaved-changes navigation warning

**Problem.** Changing date/section/subject/timeSlot while `dirty === true` silently reloads the
period and discards edits.

**Fix.** In `AttendanceView.tsx`, intercept the four selector changes when `dirty`: show a confirm
dialog ("Discard unsaved changes for {date} {slot}?" Discard / Keep editing). Implement by staging
the pending selector value in state and only committing it on confirm. Also add a `beforeunload`
handler while `dirty` (browser tab close). Keep the existing `dirty` flag as the single source.

---

# PHASE 2 — Accountability & correctness

## Fix 5: Past-date edit lock window

**Problem.** Any attendance from any past date is silently editable forever.

**Fix.**
1. Add a configurable lock window (default **7 days**) — store in the existing `settings` table
   (migration 0030: `alter table public.settings add column if not exists attendance_lock_days integer not null default 7;`).
2. UI: when `date < today - lock_days` and the period has saved attendance, render the table
   **read-only** (reuse the existing `disabled` prop path on `AttendanceTableRow`, disable Save and
   Quick Mark) with an amber banner: "This period is locked (older than N days)."
3. Enforce server-side too: a Postgres `before insert or update` trigger on `attendance` that raises
   an exception when `date < current_date - (select attendance_lock_days from settings limit 1)`
   **unless** the row is being inserted for the first time on that same day-window. Keep the trigger
   simple: block UPDATE and INSERT where `date` is older than the window. (Demo mode: skip.)
4. Do not build an approval/override workflow yet — out of scope; note it as future work.

## Fix 6: Edit-history visibility (audit surface)

**Problem.** `audit_log` + trigger already capture attendance changes (`0004_audit_trigger.sql`),
`updated_by/updated_at` columns exist, but no UI shows them.

**Fix.**
1. In the marking table header area, show a small "Last saved: {date time} " line for the loaded
   period (max `updated_at` of its rows; expose via a new `loadPeriodMeta(key)` on `AttendanceAccess`).
2. Add a "History" button on the period that opens a modal listing `audit_log` rows for the
   period's attendance record refs (change_type, actor, timestamp), newest first. Read-only,
   simple list. New access function `loadPeriodAudit(key)` — join `audit_log.record_ref` to
   attendance ids for the period. If RLS blocks `audit_log` reads for teachers, add a read policy
   in the migration.
3. Ensure `updated_by` is actually written on save: set `updated_by: auth.uid()` — simplest via a
   DB default/trigger (`updated_by uuid default auth.uid()` won't work on upsert-update; use a
   `before insert or update` trigger setting `new.updated_by = auth.uid(); new.updated_at = now();`).
   Add to migration 0030.

## Fix 7: Quick Mark — ambiguous tokens must not auto-mark

**Problem.** In `applyPresentList` (`quickAttendance.ts`), a token matching multiple students marks
**all** of them present (line ~196). The warning is shown but the wrong action already happened.

**Fix.**
1. Change `applyPresentList`: ambiguous tokens go to `ambiguous` and mark **nobody**.
2. In the preview modal (`AttendanceView.tsx` confirm dialog), for each ambiguous token render the
   candidate students with radio buttons so the teacher resolves them before confirming; resolved
   picks are passed into apply (extend the API: `applyPresentList(roster, input, { mode, resolved?: Record<token, studentId> })`).
3. Update `previewPresentList` to return candidate `{id, name?}` lists per ambiguous token (the
   view already has the roster to map ids → names).
4. Update `quickAttendance.test.ts`: ambiguous token alone marks 0; with a resolution marks exactly 1.

## Fix 8: Quick Mark — absent-list mode

**Problem.** Teachers often dictate the 5 absentees, not the 55 present. Only present-list exists.

**Fix.** Add a mode toggle (segmented control: "Present list" / "Absent list") above the input.
Implement `applyAbsentList` in `quickAttendance.ts` (mirror logic: matched → `absent`; first-time
mode → unmatched become `present`; correction mode → unmatched untouched). Reuse
`parsePresentTokens` (rename to `parseRollTokens` with a re-export alias to avoid breaking tests).
Preview modal copy must reflect the mode. Add unit tests.

## Fix 9: Quick Mark — surface students without enrollment numbers

**Problem.** Students with no `enrollmentNumber` can never match a token and are silently marked
Absent in first-time mode.

**Fix.** In `previewPresentList`, return `unmatchable: string[]` (ids of roster students lacking
enrollment numbers). In the confirm modal, if non-empty, show a warning block: "N students have no
roll number and can't be matched: {names} — they will be marked {Absent/left unchanged}." No
behavior change beyond visibility.

---

# PHASE 3 — Teacher workflow

## Fix 10: Timetable-driven periods (replace hardcoded slots)

**Problem.** `DEFAULT_TIME_SLOTS` is hardcoded in `AttendancePage.tsx`; `timetable_entries` exists
but is unused. Teacher must remember/select the right slot manually.

**Fix.**
1. New access function (in a new `src/data/access/timetableAccess.ts` or extend existing sections
   access): `loadDayPeriods({ sectionId, date })` → the day-of-week's `timetable_entries` for the
   section (join subject name), ordered by start time. Inspect the actual `timetable_entries`
   schema in `0001_init_schema.sql`/`0019` first and adapt.
2. `AttendancePage.tsx`: fetch day periods for the selected section+date. If entries exist for that
   weekday, the time-slot `Select` lists those periods labeled "{slot} — {subject}" and picking one
   also sets the subject. If the timetable is empty, **fall back to the current
   `DEFAULT_TIME_SLOTS`** so nothing breaks for un-onboarded sections.
3. Auto-select the period whose slot contains the current time when the date is today.

## Fix 11: "Already marked" indicators

**Problem.** No way to see which slots/dates already have attendance without loading each one.

**Fix.**
1. New access function `loadMarkedSlots({ sectionId, subjectId?, date })` → distinct `time_slot`s
   having rows for that date; render a small ✓ next to those options in the slot dropdown.
2. New access function `loadMarkedDates({ sectionId, subjectId, fromDate, toDate })` → distinct
   dates; use it for Fix 12's month strip. Both are cheap `select distinct` queries.

## Fix 12: Month calendar strip

**Problem.** No overview of taken/missed days.

**Fix.** Above the filter bar add a collapsible month strip (current month, prev/next buttons):
each day cell colored — green = attendance saved (from `loadMarkedDates`), gray = nothing, muted =
future/weekend. Clicking a day sets the date filter. Keep it lightweight (pure CSS grid, no
calendar library).

## Fix 13: Defaulter / shortage report (<75%)

**Problem.** No dedicated below-threshold list; only per-row badge colors.

**Fix.**
1. In the range-report modal (or a new tab within it), add a "Defaulters" view: threshold input
   (default 75, prefill from `settings.performance_threshold` if appropriate), listing students
   with `percent < threshold`, columns: name, roll, present/total, %, shortfall (classes needed to
   reach threshold: smallest `k` with `(present+k)/(total+k) ≥ threshold` — pure function in
   `attendanceService.ts` with unit tests: `classesNeededToReach(present, total, thresholdPct)`).
2. Sort ascending by percent.

## Fix 14: Student-wise attendance history

**Problem.** Cannot answer "when was this student absent?"

**Fix.**
1. New access function `loadStudentHistory({ sectionId, subjectId?, studentId, fromDate?, toDate? })`
   → date-ordered rows `{date, timeSlot, status}`.
2. In the marking table, clicking a student's name (or the % badge) opens a drawer/modal:
   student header (name, roll, overall present/total/%), then a date-descending list with status
   chips, absences highlighted. Read-only.

## Fix 15: Export — CSV + print

**Problem.** No CSV/PDF/print anywhere; teachers must submit registers.

**Fix.**
1. **CSV (no new dependency):** build the CSV string client-side and download via a Blob link.
   - Range report modal → "Export CSV": columns `Roll, Name, Present, Held, Percent`, plus header
     rows for section/subject/date-range.
   - Marking table → "Export CSV" for the loaded period: `Roll, Name, Status`.
2. **Print:** a "Print" button on the range report that opens `window.print()` with a print
   stylesheet (`@media print` rules in `index.css`: hide nav/filters, black-on-white table). A
   proper monthly register grid (students × dates matrix) is the stretch goal: build the matrix
   from a new `loadRangeMatrix` access function (rows per student per date) — implement if time
   allows, else note as follow-up.

## Fix 16: Cancelled-class / holiday marking

**Problem.** No way to record "class did not happen"; skipping leaves ambiguous gaps.

**Fix (minimal viable).**
1. Migration 0030: new table `attendance_period_flags (id uuid pk, section_id uuid not null, subject_id uuid not null, date date not null, time_slot text not null, flag text not null check (flag in ('cancelled','holiday')), note text, created_by uuid, created_at timestamptz default now(), unique (section_id, subject_id, date, time_slot))` + RLS mirroring attendance.
2. UI: a "Mark class as cancelled/holiday" action (overflow menu near Save) when the period has no
   saved attendance. Flagged periods show a banner and a read-only table; the flag can be removed.
3. Access: `loadPeriodFlag(key)`, `setPeriodFlag(key, flag, note?)`, `clearPeriodFlag(key)`.
4. Flagged periods must NOT appear in held-classes counts (they have no attendance rows, so
   aggregation is already correct); show them distinctly (blue) in the Fix 12 month strip.

## Fix 17: Daily worklist ("My periods today")

**Problem.** Page is scoped to one global section+subject; a teacher with 4 sections must switch
repeatedly.

**Fix.** At the top of the attendance page (today's date only), render a horizontal chip row of
today's timetable periods across **all** the teacher's sections (from Fix 10's access function,
queried per section of the teacher's sections list): "{time} {section} {subject}" with a ✓ when
already marked (Fix 11 data). Clicking a chip switches the global section/subject/slot selection
(via `SelectedSectionContext` — inspect its API for a setter; if it has none, add one). Collapse
the row when empty.

---

# PHASE 4 — UX polish (small, batch together)

## Fix 18: Overall % tooltip with fraction
In `AttendanceTableRow`, the % badge gets `title`/tooltip: "{present}/{total} classes". The data
already exists (`overallById`); pass the tally down, not just the percent.

## Fix 19: Bulk actions — add Leave and N/A
Floating bulk toolbar: add "Mark Leave (L)" and "Mark N/A (N)" buttons; extend the keydown handler
(`l`/`n`). Keep P/A primary-styled, L/N secondary.

## Fix 20: Status filter — add N/A option
`AttendanceView.tsx` status-filter `Select` options (~line 967): add `{ label: 'N/A', value: 'not-applicable' }`.

## Fix 21: Roll-number sort + sensible fallback
1. Add a sort toggle (Name / Roll) above the table; Roll sorts by `enrollmentNumber` with
   natural/numeric comparison (`localeCompare(..., undefined, { numeric: true })`), missing numbers last. Persist choice in localStorage (UI preference only — fine there).
2. Where `enrollmentNumber` is missing, display `—` instead of `student.id.slice(0, 8)`
   (`AttendanceTableRow`, `studentCode`).

## Fix 22: Range report — per-day drill-down + held count
1. Report modal already receives `heldDates` — display "Classes held: N" prominently (verify it is
   currently rendered; if not, add it).
2. Add a per-day view: clicking a date from a held-dates list shows who was absent that day
   (needs raw rows — reuse `loadRangeMatrix` from Fix 15, or a `loadDayDetail` query).

---

# Cross-cutting requirements

1. **Migrations:** next numbers 0029 (status column + RPC patches), 0030 (lock settings, updated_by
   trigger, period flags). Idempotent (`if not exists` / `create or replace`), with the
   Problem/Fix comment header style used by `0013`/`0019`.
2. **Demo mode parity:** every change to the `AttendanceAccess` contract must be mirrored in
   `createLocalDemoAttendanceAccess` (`src/data/demo/localDemoMode.ts`) so demo mode still works.
3. **Tests:** all new pure logic lives in `domain/services` with unit tests (existing pattern:
   `quickAttendance.test.ts`). Minimum new tests: status-aware `aggregateRangeTallies`,
   `classesNeededToReach`, absent-list mode, ambiguous-no-automark, token parsing regressions.
4. **Types:** keep `readonly` conventions; no `any` (there is one existing `ref as any` — leave it).
5. **Do not break:** dashboard RPCs, heatmap, leaderboard, reports pages all read `attendance` —
   after Fix 1, grep for `from('attendance')` and `attendance` in `src/data/migrations/*.sql`,
   and verify every aggregation's denominator logic against the new status column.
6. **Verify after each phase:** `npm run build` + existing test suite + manual flow: mark → save →
   reload → values persist; leave survives incognito reload (Phase 1's key acceptance).

# Suggested implementation order & sizing

| Phase | Fixes | Est. size |
|---|---|---|
| 1 | 1, 2, 3, 4 | Large (schema + access rewrite + downstream audit) — do alone, verify hard |
| 2 | 5, 6, 7, 8, 9 | Medium |
| 3 | 10, 11, 12, 17 (timetable cluster), then 13, 14, 15, 16 | Large — split into two PRs |
| 4 | 18–22 | Small — one batch |

Each phase should be a separate commit/PR so regressions are bisectable.
