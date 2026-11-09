# Teacher pilot: CSE / 2025-29 / Semester 3

Branch: `fix/teacher-pilot-2025-29`, based on verified `origin/main` commit `92266342d87404ea96db7b78fc58e35070f16097`.
Inspection date: 8 November 2026. **Not pilot-ready yet:** owner migration review, real-account testing and the teacher's original CSV are still required. Nothing was deployed or migrated to production by this work.

## Verified findings and fixes

| Finding | Targeted change |
| --- | --- |
| Roster import committed deletes before inserts; failure could destroy students and linked history. | One authenticated `import_section_roster` transaction. Adds/updates only; keeps student IDs, omitted students, email bindings, attendance and attempts. Empty/invalid/conflicting imports fail without partial writes. Single-student admin add reuses it. |
| Onboarding upserted profile, deleted assignments, then inserted replacements in separate requests. | `save_teacher_onboarding` validates identity and scope, updates profile and current assignments atomically. Historical assignments and unchanged assignment IDs remain. Unique-claim failures roll back the profile and assignment changes. |
| Live `2025-29.current_sem=5`, while the requested pilot is Semester 3. Wizard also inferred semester from batch ordering. | Owner-approved, per-teacher academic scope supplies the effective teaching semester. Live onboarding filters odd/even sessions without recalculating semesters. Global batch state is unchanged; ordinary stale/promotion protection remains. |
| Assignment-to-section joins matched batch and A/B/C without semester/department. | Current selectors resolve existing real UUIDs through a scoped RPC. Subject options and quiz section targeting check the academic tuple. No browser-side section creation. |
| Teachers had broad student/allowlist writes. Attendance owner isolation alone permitted mismatched student/section payloads. | Assigned-class roster reads remain shared; writes use the atomic RPC. RLS restricts attendance writes to the assigned subject/class and a student actually in that section. Admin maintenance and explicitly granted cross-section read visibility remain available. |
| Live quiz registration still upserted students without `section_id`. | Registration uses an authoritative imported roster mapping or an existing verified student mapping; never a quiz target or enrollment pattern. Conflicting/missing membership is denied before binding. Existing IDs, attempts, multi-section targets, answer privacy and server grading remain. |
| Teacher-wide identity reset deleted attempts across all teachers. | Identity reset is verified-admin maintenance and preserves attempts. Per-quiz owner-controlled resets remain. Registration listings are scoped. |
| Live November 8 security hardening was ahead of Git. | Migration 0058 versions the verified-email trigger/RLS, ten specific RPC privilege fixes and `normalize_subject_code` search path. New signed-in-only RPCs also revoke PUBLIC/anon execution. |
| `npm run lint` referenced an uninstalled ESLint; routing tests expected obsolete login labels/reloads. | Added a minimal ESLint toolchain/config, retaining existing debt as warnings. Auth tests now publish the current subscription event and assert the real admin/teacher routes. |

## Live evidence and boundaries

Live inspection used the authenticated Supabase CLI with `db query --read-only` and a **schema-only** dump. Production student rows, credentials and teacher emails were not copied into tests or committed.

| Section | Existing real UUID | Students at inspection |
| --- | --- | ---: |
| CSE-3A | `7f3a9cea-bdf2-4300-8645-9237f1b4e342` | 0 |
| CSE-3B | `6ce610f0-2f0c-459e-b55e-f6a900d94852` | 0 |
| CSE-3C | `30311f08-0ed9-4138-a1a2-8f239a5066a6` | 0 |

All three are CSE, batch `2025-29`, `3rd Semester`. No Semester 3 assignments existed for this batch. Semester 4/5 sections and assignments also exist. The batch schedule has advanced across multiple cohorts; its original intent cannot be established from the current rows alone. **Do not classify it as synthetic or demote it automatically.**

Live migration history also includes promotion/`semester_at_time` changes beyond the July handoff and Git migrations. Those definitions were inspected and retained; these migrations do not replace `promote_batch`, history triggers or timetable functions.

## Production deployment gate (updated 9 November 2026)

**Do not apply migrations 0058–0060 or use the live-connected Cloudflare preview for real student uploads until these gates are resolved.** The live Supabase organization is currently on the **Free** plan, which does not include scheduled daily backups. Existing data includes teacher, quiz and attendance records; a same-database table copy is NOT a recoverable off-site backup.

1. **Backup waived by explicit owner instruction (9 November 2026).** Continue with the read-only preflight and reviewed pilot setup without requiring an external backup. Preserve the transaction/authorization checks and the safe operational rollback; do not describe a schema inspection or a same-database table copy as a recovery backup.
2. **Review the existing teacher allowlist discrepancy.** Read-only live preflight found four teachers with current assignments, but one confirmed auth user with two current assignment rows was NOT allowlisted. The new scope bootstrap in migration 0059 excludes that teacher and could unexpectedly remove working access. Run the added `docs/sql/teacher_pilot_preflight.sql` deployment gate and resolve as owner without guessing or auto-approving any account. Re-run until all intended existing teachers have a deliberate approval/status decision.
3. **Prevent preview-to-production confusion.** The Cloudflare Pages branch preview was automatically built and the repository's production Vite environment points at the live Supabase project. A preview build is not an isolated staging backend. Do NOT enter real teacher credentials or import original student CSVs into that preview until the matching DB migrations and release plan are reviewed. The owner's backup waiver remains in effect.
4. **Verify release alignment and environment.** Review 0058–0060 against live migration history and the November 8 hardening; snapshot teacher/attendance/quiz counts. Release the compatible frontend and SQL changes in a controlled window. A failed separate Cloudflare Workers deployment was reported even though the Pages branch preview build succeeded—verify which platform/route actually serves this MIS.
5. **Do not assume tests prove hosted integration.** Passing isolated DB checks do not test the real Auth email provider, teacher onboarding, browser, Cloudflare Functions, or original roster. Complete the real-account checklist after the deployment gates pass.

## Owner review and setup (no operated admin console required)

1. The owner has waived the backup prerequisite for this rollout. Run `docs/sql/teacher_pilot_preflight.sql` in the Supabase SQL Editor as project owner. It is read-only. Save the outputs, especially current scopes/assignments and before-counts. Review any duplicate/mismatched academic records before proceeding.
2. Review and manually apply these files **in order**, without replaying the historic migration/seed directory on the live database:
   - `src/data/migrations/0058_reconcile_verified_identity_security.sql`
   - `src/data/migrations/0059_teacher_scope_atomic_writes.sql`
   - `src/data/migrations/0060_verified_quiz_section_access.sql`
3. 0059 creates **one** owner-controlled scope table. It preserves existing verified teachers' already-configured current classes as ordinary approvals (`semester_override=false`). It does not approve old/future classes, new teachers, or the pilot automatically. Review this bootstrap inventory before applying it.
4. Identify the actual teacher's confirmed `auth.users` identity. They can complete the existing email/OTP login once to establish it; an approval notice before owner setup is expected. Do not create a fake teacher, student, password or email binding. Use a teacher-only identity, not an admin account.
5. Save any existing rows in `teacher_academic_scopes` for that teacher. Edit the **one email declaration** in `docs/sql/teacher_pilot_owner_setup.sql` and run it as owner. Guards require the reviewed global semester 5 state, the exact existing empty A/B/C UUIDs, a confirmed non-student/non-admin identity and a Semester 3 catalog. A guard failure requires owner review, not bypassing it.
6. This setup allowlists the real teacher and approves CSE / `2025-29` / Semester 3 / A/B/C with an explicit override. It disables that dedicated pilot teacher's other batch scopes so their current dashboard is limited to the pilot. Other teachers and all `batches` rows remain unchanged. Assignments, students, history and quizzes are not changed by this setup.
7. Review and release the matching application code through the owner's normal deployment process. Confirm live Supabase configuration and `VITE_DEMO_MODE=false` for the real pilot. Keep the app paired with the RPC migrations: the new client deliberately has no destructive fallback. This task does not deploy or merge it.
8. Replace the email in `docs/sql/teacher_pilot_validate.sql` and run its read-only checks. Global semester stays **5**; effective teacher semester is **3**; A/B/C are initially empty. After real imports, counts must match the original files and mapping conflicts must be zero.

Owner SQL access is the approval authority. Authenticated teachers cannot edit the scope table, impersonate another teacher in the RPC, or self-assign another batch. New ordinary teachers also need owner-approved current scopes; multi-batch scopes remain supported. Normal promotion expires ordinary scopes until the owner approves the new semester. The deliberate pilot override must be disabled/reviewed when the pilot ends.

| State | Before owner setup | After owner setup |
| --- | --- | --- |
| Global `2025-29.current_sem` | 5 | 5, unchanged |
| Dedicated pilot scope | Not configured | Semester 3, CSE, A/B/C, explicit owner override |
| Section UUIDs | Existing A/B/C UUIDs above | Same UUIDs |
| Pilot students | 0 at inspected preflight | Still 0; only the later teacher-uploaded CSV creates/updates students |
| Subject assignments | No Semester 3 pilot assignments | Still unchanged until the real teacher saves actual subjects |

## Teacher workflow and acceptance checklist

- [ ] Log in with the real teacher account. Complete the existing onboarding wizard or open **Profile / My Teaching Subjects**.
- [ ] Choose the existing odd academic session. Confirm only batch `2025-29`, Semester III appears. Select actual Semester 3 subjects for A/B/C; enable the appropriate theory/lab attachments and save.
- [ ] Global section selector lists the three real Semester 3 sections; subject selector lists only that section's authorized subjects. Reload and verify saved selections. Other semesters must not appear in the current dashboard.
- [ ] Select **A**, open the existing **Student Roster** screen, upload/paste the teacher's original CSV, inspect all preview/rejection rows, then confirm. Required format remains CSV (`enrollment,name`, optional email), using the existing parser. Fix every rejected row before importing.
- [ ] Compare A's saved names/enrollments/count with the original file. Repeat the same file: expect unchanged counts and the same IDs, not duplicates. Missing rows in a later CSV are retained. Imports are additive; this pilot provides no bulk destructive replacement mode.
- [ ] Repeat separately for **B** and **C**, selecting the section explicitly before uploading its original file. Enrollment patterns do not determine section membership. Do not use historic/demo database rows as pilot source data.
- [ ] If an enrollment is already in another/unverified section or has a conflicting email binding, the **whole import fails**. The owner must review identity and history before any deliberate correction; never delete old students to get past an error.
- [ ] Take attendance in A with an authorized subject and save. Switch to B/C: their rosters and saved marks must remain separate. Reopen the period, reload the app, and verify values. Check a historical period remains intact.
- [ ] Create a native MIS quiz for the authorized subject and select A/B/C as appropriate. Confirm target labels and share link using the existing UI.
- [ ] With real students' own confirmed email accounts, complete the existing registration flow using verified enrollments, start timed attempts and submit. Confirm the teacher sees correct server-graded results and section labels. A different section/account must be denied.
- [ ] Verify student identity before distributing quiz links. When a CSV omits email, the existing first-claim enrollment binding remains: a confirmed email alone does not prove ownership of an unbound enrollment. Prefer original CSV email mappings where available, and review initial bindings with the teacher.
- [ ] Try an unrelated teacher/student session: import, direct assignment writes, forged attendance section/student pairs and another teacher's quiz targets must be rejected. Verify no data changed.
- [ ] Check existing timetable editing, conflicts, confirmation/unlocking and teaching history with real accounts. No timetable implementation was replaced.

## Validation evidence

Executed on this branch:

| Check | Result |
| --- | --- |
| `npm run build` | Passed |
| `npm run lint` | Passed: 0 errors, 58 existing-code warnings |
| `npm test` | 438 passed, 0 failed |
| `npm run test:database`, full source migration chain | 74 checks passed |
| Same database suite, live schema-only snapshot | 74 checks passed |
| New migrations reapplied; guarded owner setup and operational rollback | Passed in both isolated database variants |

Baseline before these changes: 424 unit tests passed and 5 failed; lint could not run because ESLint was not installed. Existing routing mocks/assertions were brought up to date without changing the production login flow. Database checks include actual transaction rollback after a mid-import conflict and duplicate assignment failure, identity/history preservation, normal onboarding and promotion staleness, A/B/C UUID mapping, shared-class reads, authorization attacks, confirmed student-email binding, missing membership denial, and unchanged server grading. Timetable and existing subject-selection/domain tests are included in the passing Vitest suite.

Graphify update completed; its existing parser warning for `src/domain/services/inputGuard.test.ts` remains. TypeScript and Vitest still pass. Generated Graphify files are included because AGENTS.md requires graph maintenance.

Reproduce application checks with `npm ci`, `npm run build`, `npm run lint`, `npm test`.

Database tests: Docker must be running; execute `npm run test:database`. The runner creates a disposable PostgreSQL 17 container with networking disabled, applies the existing migration chain plus these migrations, reapplies new migrations for idempotency, exercises owner setup, and runs adversarial checks. It removes only the container it created. Auth identities and CSV rows are synthetic **inside this isolated container only**.

To test schema parity, set `MIS_PILOT_SCHEMA_SNAPSHOT` to an owner-created **schema-only** public dump and run the same command. This applies only 0058 onward over the dump. Never supply a data dump. Test Auth functions mimic verified identities/JWT claims; this does not prove hosted OAuth, OTP delivery, browser interaction or real account settings.

A lost network response can leave the import outcome unknown to the browser even if the transaction committed. The UI asks the teacher to refresh/verify, and repeating the identical CSV is safe; it does not claim that every network error implies a rollback.

## Rollback and remaining blockers

For a pilot problem, run the reviewed `docs/sql/teacher_pilot_rollback.sql` with the actual teacher email to disable that pilot scope. This stops current pilot writes without touching students or history. Restore a prior approval only from the owner's saved preflight scope rows after review. Do not drop the scope table/mapping column, revoke student authentication, reset the database, or restore the unsafe delete-first client/broad teacher policies. A code rollback to the old client will fail closed on protected writes; use maintenance/read-only mode and fix forward rather than restoring destructive access.

The pilot is **not ready for real teaching** until owner migrations/setup, the real teacher's subject selection, original A/B/C CSV uploads, physical browser/account checks, hosted student registration and actual attendance/quiz results have been verified. None of those production writes or imports were performed here. Existing lint warnings, the legacy attendance view's `@ts-nocheck`, and wider unrelated product/security areas remain technical debt, not a claim of a whole-repository security audit. No Google Forms, Excel importer, replacement onboarding, new timetable system or new MIS project was added.

## Exact change inventory

- `.gitignore`
- `PROJECT_HANDOFF.md`
- `docs/TEACHER_PILOT_2025_29.md`
- `docs/sql/teacher_pilot_owner_setup.sql`
- `docs/sql/teacher_pilot_preflight.sql`
- `docs/sql/teacher_pilot_rollback.sql`
- `docs/sql/teacher_pilot_validate.sql`
- `eslint.config.js`
- `graphify-out/.graphify_labels.json.sig`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.html`
- `graphify-out/graph.json`
- `package-lock.json`
- `package.json`
- `src/data/access/adminRosterImportAccess.test.ts`
- `src/data/access/adminRosterImportAccess.ts`
- `src/data/access/rosterImportAccess.test.ts`
- `src/data/access/rosterImportAccess.ts`
- `src/data/demo/localDemoMode.ts`
- `src/data/migrations/0058_reconcile_verified_identity_security.sql`
- `src/data/migrations/0059_teacher_scope_atomic_writes.sql`
- `src/data/migrations/0060_verified_quiz_section_access.sql`
- `src/domain/shared/messages.ts`
- `src/features/onboarding/api/onboarding.atomic.test.ts`
- `src/features/onboarding/api/onboarding.ts`
- `src/features/onboarding/components/ElectiveGroupRow.tsx`
- `src/features/onboarding/components/SectionChips.tsx`
- `src/features/onboarding/components/SemAccordion.tsx`
- `src/features/onboarding/components/SubjectRow.tsx`
- `src/features/onboarding/hooks/useOnboardingData.ts`
- `src/features/onboarding/hooks/useStaleAssignmentNotice.ts`
- `src/features/onboarding/types.ts`
- `src/presentation/App.routing.test.tsx`
- `src/presentation/loaders/subjectOptions.test.ts`
- `src/presentation/loaders/subjectOptions.ts`
- `src/presentation/pages/AdminRosterImportPage.tsx`
- `src/presentation/pages/AttendancePage.tsx`
- `src/presentation/pages/RosterPage.tsx`
- `src/presentation/views/RosterView.tsx`
- `tests/database/bootstrap.sql`
- `tests/database/existing-teacher.sql`
- `tests/database/run.mjs`
- `tests/database/teacher-pilot.sql`
