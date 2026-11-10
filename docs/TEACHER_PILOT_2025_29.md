# Teacher pilot: CSE / 2025-29 / Semester 3

Branch: `fix/teacher-pilot-2025-29`, based on verified `origin/main` commit `92266342d87404ea96db7b78fc58e35070f16097`.
Initial inspection: 8 November 2026. Live rollout updated: **9 November 2026**. Reviewed migrations 0058-0060 and the verified pilot teacher's Semester 3 CSE A/B/C scope are now applied. The owner waived the backup and explicitly chose to keep the other unapproved teacher unapproved. No student roster was imported and no existing academic records were changed. **Not pilot-ready yet:** actual subject selection, real-account/original-CSV testing and frontend release approval remain pending. Main was not merged and no production frontend deployment was initiated. **Follow-up correction 0061 is prepared and tested, but NOT applied live:** normal teacher batch/section self-selection must be restored as described below.

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

## Live rollout status - 9 November 2026

The owner resolved the two rollout decisions: proceed without a backup, and keep the existing unapproved teacher unapproved. No account was guessed or automatically approved. The selected pilot teacher was confirmed in live Auth, allowlisted, non-admin and not a student before setup.

Applied through the Supabase connector in order:

| Source migration | Live version |
| --- | --- |
| 0058_reconcile_verified_identity_security | 20261109162726 |
| 0059_teacher_scope_atomic_writes | 20261109162732 |
| 0060_verified_quiz_section_access | 20261109162739 |

The guarded owner setup configured only the selected pilot teacher for `2025-29`, Semester 3, CSE, A/B/C. Their existing Semester 5 theory/lab assignments remain unchanged. The unapproved teacher was not added to the allowlist and received no scope rows. Global `batches.current_sem` remains **5**. Seven Semester 3 catalog subjects exist; the actual teaching subjects were not guessed or assigned automatically.

Before/after content fingerprints and row counts matched for all existing records in these tables. For `student_roster`, comparison used the existing columns, and separately confirmed that the new `section_id` column is null for all historic rows. These checks are verification metadata, **not a recoverable backup**.

| Preserved records | Before | After |
| --- | ---: | ---: |
| students | 185 | 185 |
| student_roster | 196 | 196 |
| attendance | 1000 | 1000 |
| quiz_attempts | 2 | 2 |
| teacher_assignments | 34 | 34 |
| teachers | 5 | 5 |
| sections | 24 | 24 |

All pilot sections remain empty. Zero historic roster rows were automatically assigned to sections. The scope table has RLS enabled, authenticated users cannot write it directly, raw teacher-assignment writes are revoked, and the 18 checked sensitive RPC signatures have zero anonymous EXECUTE grants. Required authenticated RPC grants are present. No fake Auth session or synthetic student was created in production to test this.

A matching local pilot build is served on port **5175**, at `http://172.19.43.74:5175` while the current Wi-Fi address remains assigned. It is connected to the live Supabase project and must be used deliberately with the real pilot account. The original port 5173 UI workspace was preserved separately and does not contain this pilot client. The local build explicitly uses `VITE_DEMO_MODE=false` so localhost cannot silently enter demo mode. Vite preview serves the static app; Cloudflare Pages Functions and hosted Auth/email delivery still require their real-environment checks.

Production frontend rollout remains a separate approval. The Pages branch preview can be automatically built by the repository's existing CI and also points at the live backend; it is not an isolated staging database. No main merge or manual production deploy was performed. Old clients do not have the new atomic write path, so use the compatible pilot build for onboarding/roster work until the reviewed release is complete.

Post-change Supabase advisors report two existing RLS-with-no-policy informational entries (function-only/internal tables), 28 anonymous and 54 authenticated SECURITY DEFINER exposure warnings, and disabled leaked-password protection. The new scope table has an own-row SELECT policy and no client write grant. Do not blindly revoke all RPCs: review each function's actual caller checks and role grants using the [function-exposure advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable). Account-level [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains a separate owner setting. This rollout is not a declaration that the whole project is free of security debt.

## Follow-up: restore the original teacher self-selection workflow (0061 pending)

The owner clarified that approved teachers must be able to choose additional teaching batches/sections themselves. The 0059 per-batch approval prerequisite restricted that existing workflow too far. Migration `0061_restore_teacher_self_selection.sql` corrects this without returning to browser-side destructive writes. **Live still runs 0058-0060 until the owner applies this additional migration.**

After 0061, a verified, allowlisted teacher uses the existing **Profile / My Teaching Subjects** editor to select any configured, non-graduated CSE batch's current-semester subjects and sections. No new admin screen, per-batch approval or new scope row is required for ordinary classes. The global selector lists their saved teaching assignments, not every available class. Merely viewing an available batch does not grant access to its students: roster, attendance and quizzes still require the teacher's own subject assignment for the exact real section. The existing cross-teacher unique index remains the final protection against concurrent occupied-subject claims; ordinary conflicts also return the occupying teacher's display name, subject code, batch and section. The UI preserves that server warning.

Owner-approved `semester_override=true` exceptions still take precedence for their batch, including the pilot teacher's 2025-29 / Semester 3 / A-B-C scope. They do not hide other ordinary current-semester batches. Disabled scope rows continue to block that batch instead of falling back to normal access. Non-override bootstrap rows no longer freeze an old semester or section subset: ordinary classes follow the current batch and its actually configured sections. Unapproved accounts remain blocked. Historical assignments are preserved; promotion still blocks stale subjects. One teacher/batch still has one effective current semester; simultaneous different semesters of the same batch are outside this change.

Owner rollout:

1. Review `0061_restore_teacher_self_selection.sql` and rerun the read-only preflight. Confirm the existing `teacher_assignments_subject_section_batch_unique` index, actual current-semester CSE section rows, existing overrides/disabled scopes and the unapproved-account decision. Do not change a batch semester or import any students for this correction.
2. Apply **only 0061**, once reviewed, through the project owner's SQL Editor/migration workflow. It replaces three functions and their explicit grants; it performs no academic-data writes, scope changes or account approvals. Keep the owner backup waiver already recorded for this rollout; do not mistake schema metadata for a backup.
3. Validate using the real teacher's session: My Teaching Subjects lists the Semester 3 pilot plus other configured current classes; choose an available subject/section, save and switch using the global selector. A claim occupied by another teacher must warn and leave previous assignments intact. An unassigned section must remain unavailable for roster modification. Use the normal current semester of the other batch, not an arbitrary historical semester.
4. Owner-level SQL validation: confirm the three function definitions match 0061 with `pg_get_functiondef`, check the two helper signatures and `save_teacher_onboarding(text,text,jsonb)` have authenticated EXECUTE but no anon EXECUTE, and rerun before/after counts/fingerprints for existing academic tables. No data should change merely by applying the migration. Actual teacher saves intentionally change that teacher's current assignments.
5. If this correction must be rolled back, review/run `docs/sql/teacher_pilot_self_selection_rollback.sql`. It restores only the three 0059 functions and grants, not the unsafe old importer or raw assignment writes. This returns to per-batch approval-only selection and does not revert any teacher edits made after rollout. Reapply 0061 after resolving the issue.

Executed follow-up checks: `npm run build` passed with demo mode disabled; `npm run lint` passed with 0 errors / 58 existing warnings; `npm test` passed 440 tests. Isolated full-migration-chain database checks passed **98 checks**, including targeted function rollback/reapplication, new-teacher self-selection without scope rows, adding another batch and section, named occupied-subject warnings, failed claims preserving profiles/assignments, a forced post-deletion insertion failure rolling back all onboarding writes, blocked unassigned imports, unapproved accounts and disabled exceptions. The schema-only live-snapshot run of 74 checks above predates 0061; it is not evidence of a live 0061 rollout. Real-account verification remains pending.

## Owner review and setup (no operated admin console required)

The steps below are the reproducible setup reference. This live rollout has already applied 0058-0060 and the selected teacher scope; do not replay the complete historical migration directory or rerun empty-section setup after original CSV data has been uploaded.

1. The owner has waived the backup prerequisite for this rollout. Run `docs/sql/teacher_pilot_preflight.sql` in the Supabase SQL Editor as project owner. It is read-only. Save the outputs, especially current scopes/assignments and before-counts. Review any duplicate/mismatched academic records before proceeding.
2. Review and manually apply these files **in order**, without replaying the historic migration/seed directory on the live database:
   - `src/data/migrations/0058_reconcile_verified_identity_security.sql`
   - `src/data/migrations/0059_teacher_scope_atomic_writes.sql`
   - `src/data/migrations/0060_verified_quiz_section_access.sql`
- `src/data/migrations/0061_restore_teacher_self_selection.sql`
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

The database migrations and pilot scope are now configured. The pilot is **not ready for real teaching** until the actual teacher selects their subjects, uploads original A/B/C CSVs, and completes hosted login/registration, attendance, grading/results and physical-browser checks. No original roster or real teaching/student workflow was exercised by the agent. Production frontend merge/deployment still needs approval. Existing lint warnings, the legacy attendance view's `@ts-nocheck`, first-claim registration when CSV email is absent, and the advisor items above remain explicit limitations. No Google Forms, Excel importer, replacement onboarding, new timetable system or new MIS project was added.

## Exact change inventory

- `.gitignore`
- `PROJECT_HANDOFF.md`
- `docs/TEACHER_PILOT_2025_29.md`
- `docs/sql/teacher_pilot_owner_setup.sql`
- `docs/sql/teacher_pilot_preflight.sql`
- `docs/sql/teacher_pilot_rollback.sql`
- `docs/sql/teacher_pilot_self_selection_rollback.sql`
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
- `src/data/migrations/0061_restore_teacher_self_selection.sql`
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
