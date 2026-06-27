# Implementation Plan: Teacher Academic MIS

## Overview

This plan implements the Teacher Academic MIS as a static Vite/React/TypeScript bundle backed by Supabase and Cloudinary. The approach builds the testable domain layer first (pure functions verified by property-based tests with fast-check), then the data layer (Postgres schema, RLS, `SECURITY DEFINER` functions, audit triggers verified by integration tests), then the data-access wrappers, then the UI modules wired to those services, and finally seed data and deployment configuration.

Each correctness property from the design is implemented as a single fast-check property test (minimum 100 iterations) placed next to the function it validates, so logic errors surface immediately. Test sub-tasks are marked optional with `*`; core implementation sub-tasks are mandatory.

## Tasks

- [x] 1. Set up project structure, design tokens, and shared foundations
  - [x] 1.1 Initialize the Vite + React + TypeScript project and tooling
    - Scaffold the Vite React-TS app, configure Tailwind CSS, set up Vitest and fast-check
    - Create the directory structure for `presentation` (components/views), `domain` (services), and `data` (Supabase wrappers, migrations)
    - _Requirements: 22.1_

  - [x] 1.2 Define Tailwind design tokens and base layout shell
    - Configure Inter font; background #f4f5f9, surface #ffffff, border #ecedf4
    - Configure accent #5b54e6, accent hover #4a42d4, accent tint #eef0fe; text #1d2030, soft #5a6072, muted #969cad
    - Configure status colors green #12b886, amber #f59e0b, red #f0506e, blue #4c8dff; card radius 16px with soft shadow, button radius 11px
    - Implement the left sidebar grouped-section navigation shell and responsive breakpoints (mobile/tablet/desktop) with no horizontal overflow
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8_

  - [x] 1.3 Define shared types, Result type, English message catalog, and feature flags
    - Create the `Result<T, E>` type, shared domain interfaces, and a centralized English message catalog for validation/error/empty-state text
    - Implement the `featureFlags` module reading `FEATURE_AI` from build-time env
    - _Requirements: 20.1, 15.4, 18.3_

- [x] 2. Implement input validation and sanitization (`inputGuard`)
  - [x] 2.1 Implement `sanitizeText` and `validateStructured`
    - Neutralize script/markup on text input; validate structured input against schema (type/format/range) and return English validation errors
    - _Requirements: 17.1, 17.2, 17.3_

  - [ ]* 2.2 Write property test for text sanitization
    - **Property 23: Text sanitization neutralizes markup and is idempotent**
    - **Validates: Requirements 17.1**

- [x] 3. Implement roster and quiz-access domain (`rosterService`)
  - [x] 3.1 Implement enrollment validation and roster upsert
    - Implement `isValidEnrollmentNumber` (pattern `^[0-9]{4}[A-Z]{2}[0-9]{6}$`) and `upsertEntry` accepting conforming and rejecting non-conforming values with an English message
    - _Requirements: 2.1, 2.2, 21.3_

  - [ ]* 3.2 Write property test for enrollment number validation
    - **Property 1: Enrollment number validation matches the pattern**
    - **Validates: Requirements 2.2, 21.3**

  - [x] 3.3 Implement `resolveQuizAccess` decision logic
    - Resolve `granted` only when email matches a roster entry and provided enrollment equals the stored enrollment; otherwise `denied` (not-registered); surface `already-attempted` path
    - _Requirements: 2.5, 2.6, 2.7, 2.8, 8.5, 8.6_

  - [ ]* 3.4 Write property test for roster-gated access decision
    - **Property 2: Roster-gated access decision**
    - **Validates: Requirements 2.5, 2.6, 8.5, 8.6**

- [x] 4. Implement attendance domain (`attendanceService`)
  - [x] 4.1 Implement live counts and upsert save/load over an in-memory store
    - Implement `liveCounts`; implement `savePeriod`/`loadPeriod` keyed by `(section, subject, date, time_slot, student)` with upsert (no duplicates)
    - _Requirements: 5.3, 5.4, 5.5, 5.6_

  - [ ]* 4.2 Write property test for live attendance counts
    - **Property 3: Live attendance counts partition the roster**
    - **Validates: Requirements 5.3**

  - [ ]* 4.3 Write property test for attendance save/load round-trip
    - **Property 4: Attendance save/load round-trip**
    - **Validates: Requirements 5.4, 5.5**

  - [ ]* 4.4 Write property test for attendance idempotent save
    - **Property 5: Attendance save is idempotent**
    - **Validates: Requirements 5.6**

- [x] 5. Implement syllabus domain (`syllabusService`)
  - [x] 5.1 Implement progress and schedule-status functions
    - Implement `progressPercent` (completed/total*100, 0 when empty) and `scheduleStatus` (behind-schedule iff actual < planned)
    - _Requirements: 6.5, 6.6, 6.7_

  - [ ]* 5.2 Write property test for syllabus progress
    - **Property 6: Syllabus progress equals completed over total**
    - **Validates: Requirements 6.5, 6.7**

  - [ ]* 5.3 Write property test for schedule status
    - **Property 7: Schedule status reflects planned comparison**
    - **Validates: Requirements 6.6**

- [x] 6. Implement marks domain (`marksService`)
  - [x] 6.1 Implement mark-value validation and internal-marks computation
    - Implement `validateMarkValue` (0..maxValue) and `computeInternalMarks` (deterministic weighted total)
    - _Requirements: 7.3, 7.4, 7.5_

  - [ ]* 6.2 Write property test for mark value validation
    - **Property 8: Mark value validation respects bounds**
    - **Validates: Requirements 7.5**

  - [ ]* 6.3 Write property test for internal marks computation
    - **Property 9: Internal marks are the weighted total of components**
    - **Validates: Requirements 7.4**

- [x] 7. Implement quiz grading domain (`quizService`)
  - [x] 7.1 Implement grading and single-attempt store logic
    - Implement `gradeAttempt` (sum marks of correct answers, no negative marking) and single-attempt upsert preserving the first submitted result
    - _Requirements: 8.4, 8.8, 8.10, 8.11_

  - [ ]* 7.2 Write property test for quiz grading
    - **Property 10: Quiz grading sums correct answers with no negative marking**
    - **Validates: Requirements 8.4, 8.8**

  - [ ]* 7.3 Write property test for single attempt enforcement
    - **Property 11: Exactly one stored quiz attempt per student per quiz**
    - **Validates: Requirements 8.10, 8.11**

- [x] 8. Implement assignment trackers domain (`assignmentService`)
  - [x] 8.1 Implement independent Assignment and Lab Manual submission trackers
    - Implement `setAssignmentSubmission` and `setLabManualSubmission` over independent grids with per-(student, unit) status
    - _Requirements: 9.4, 9.5, 9.6, 9.7_

  - [ ]* 8.2 Write property test for submission trackers
    - **Property 12: Submission trackers round-trip and are independent**
    - **Validates: Requirements 9.5, 9.6, 9.7**

- [x] 9. Implement leaderboard domain (`leaderboardService`)
  - [x] 9.1 Implement combined score and ranking
    - Implement `combinedScore` (teacher weightages) and `rankStudents` (desc score, tie-break name asc)
    - _Requirements: 11.3, 11.4, 11.6_

  - [ ]* 9.2 Write property test for leaderboard ranking
    - **Property 13: Leaderboard ranking is a sorted permutation with deterministic tie-break**
    - **Validates: Requirements 11.4, 11.6**

- [x] 10. Implement analytics domain (`analyticsService`)
  - [x] 10.1 Implement analytics computations
    - Implement `classAverage`, `lowestScoringUnit`, `gradeDistribution`, and `isAtRisk` (threshold default 60)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 4.5_

  - [ ]* 10.2 Write property test for class average
    - **Property 14: Class average is the arithmetic mean**
    - **Validates: Requirements 12.2**

  - [ ]* 10.3 Write property test for lowest-scoring unit
    - **Property 15: Lowest-scoring unit has the minimum average**
    - **Validates: Requirements 12.3**

  - [ ]* 10.4 Write property test for grade distribution
    - **Property 16: Grade distribution partitions the scores**
    - **Validates: Requirements 12.4**

  - [ ]* 10.5 Write property test for at-risk classification
    - **Property 17: At-risk classification respects the threshold**
    - **Validates: Requirements 4.5, 12.5**

- [x] 11. Implement heatmap domain (`heatmapService`)
  - [x] 11.1 Implement attendance percentage, defaulters, and day heat level
    - Implement `attendancePercent` (attended/held*100, 0 when held is 0), `defaulters` (< 75%), and `dayHeatLevel`
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [ ]* 11.2 Write property test for attendance percentage
    - **Property 18: Attendance percentage equals attended over held**
    - **Validates: Requirements 13.2, 13.1**

  - [ ]* 11.3 Write property test for defaulter list
    - **Property 19: Defaulter list contains exactly the below-threshold students**
    - **Validates: Requirements 13.3, 13.4**

- [x] 12. Implement timetable domain (`timetableService`)
  - [x] 12.1 Implement today's-classes derivation
    - Implement derivation of current-day classes as exactly the timetable entries matching the given day of week
    - _Requirements: 14.1, 14.3_

  - [ ]* 12.2 Write property test for today's classes
    - **Property 20: Today's classes derive from matching timetable entries**
    - **Validates: Requirements 14.3**

- [x] 13. Implement storage router domain (`storageRouter`)
  - [x] 13.1 Implement storage routing and upload validation
    - Implement `routeStorage` (sensitive → 'supabase', public/heavy → 'cloudinary') and `validateUpload` (type allowlist + max size)
    - _Requirements: 16.2, 16.3, 16.6, 10.1, 10.3_

  - [ ]* 13.2 Write property test for storage routing
    - **Property 21: Storage routing maps category to the correct store**
    - **Validates: Requirements 16.2, 16.3, 10.1**

  - [ ]* 13.3 Write property test for upload validation
    - **Property 22: Upload validation respects type allowlist and size limit**
    - **Validates: Requirements 16.6, 10.3**

- [x] 14. Checkpoint - domain layer complete
  - Ensure all property and unit tests pass, ask the user if questions arise.

- [ ] 15. Implement database schema, constraints, RLS, functions, and triggers
  - [x] 15.1 Create the Postgres schema migration with tables and constraints
    - Create all tables from the data model with PKs/FKs, the enrollment CHECK, the `files.storage_type` CHECK, the attendance unique key, the `quiz_attempts` unique key, the assignment/lab unique keys, and default values (quiz marks 1, time limit 15, threshold 60)
    - _Requirements: 5.6, 8.11, 16.1, 8.1, 8.3, 12.1_

  - [x] 15.2 Implement RLS policies and the `is_teacher()` helper
    - Enable RLS on every table; teacher full access, student own-row access, admin-only tables deny student, anonymous denial; deny student read on `audit_log`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 2.10, 16.5, 19.4_

  - [x] 15.3 Implement `SECURITY DEFINER` access and grading functions
    - Implement `request_quiz_access` (roster check, enrollment store/verify, already-attempted) and `submit_attempt` (server-side grade, single-attempt upsert, persist score) using the pure grading logic
    - _Requirements: 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 2.5, 2.7, 2.8_

  - [x] 15.4 Implement the audit trigger
    - Trigger on `attendance`, `mark_values`, `mark_components` writing one `audit_log` row (actor, record ref, change type, timestamp) per insert/update/delete
    - _Requirements: 5.7, 7.7, 19.1, 19.2, 19.3_

  - [ ]* 15.5 Write integration tests for RLS enforcement
    - Assert teacher full access, student own-row access, student denial on others/admin tables, anonymous denial, and student denial on `audit_log`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 2.10, 16.5, 19.4_

  - [ ]* 15.6 Write integration tests for quiz access and single-attempt enforcement
    - Verify rostered grading and single-attempt enforcement through the DB function and uniqueness constraint
    - _Requirements: 8.5, 8.6, 8.8, 8.10, 8.11_

  - [ ]* 15.7 Write integration tests for audit triggers
    - Verify a marks/attendance create/update/delete writes exactly one audit row with actor, record ref, change type, timestamp
    - _Requirements: 5.7, 7.7, 19.1, 19.2, 19.3_

- [x] 16. Implement Supabase data-access wrappers and storage integration
  - [x] 16.1 Implement the Supabase client and secret handling
    - Initialize the Supabase JS client with the Anon_Key from env only; ensure the Service_Role_Key is never referenced in frontend code; read all secrets from env
    - _Requirements: 18.1, 18.2, 18.3, 17.4_

  - [x] 16.2 Implement data-access wrappers binding domain services to Supabase
    - Wire roster, attendance, syllabus, marks, quiz, assignment, leaderboard, analytics, heatmap, and timetable services to parameterized Supabase queries and the DB functions
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.6, 9.1, 11.5, 12.6, 17.4_

  - [x] 16.3 Implement storage upload routing and signed-URL access
    - Route sensitive uploads to the Supabase private bucket (served via time-limited signed URL) and public/heavy uploads to Cloudinary (direct CDN), recording `files.storage_type`
    - _Requirements: 16.2, 16.3, 16.4, 10.1, 10.2_

  - [ ]* 16.4 Write integration tests for auth flows and storage
    - Valid/invalid teacher credentials, Google profile capture, sign-out redirect, session expiry re-auth; sensitive upload signed URL vs Cloudinary public serve
    - _Requirements: 1.2, 1.3, 1.4, 1.6, 2.4, 18.4, 18.5, 10.1, 10.2, 16.4_

- [ ] 17. Implement authentication, session, and routing (`authService`)
  - [x] 17.1 Implement `authService` and route guards
    - Teacher email/password and Google login, student Google login, sign-out, session restoration; expose actor role for navigation gating only; no teacher signup and no student signup routes
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 2.9_

  - [x] 17.2 Implement teacher sign-in view and student access/enrollment flow
    - Teacher sign-in view with English error on invalid credentials; student Google sign-in via shareable link, first-sign-in enrollment prompt (once) vs returning-student skip, not-registered message
    - _Requirements: 1.4, 2.3, 2.4, 2.7, 2.8, 6.6_

  - [ ]* 17.3 Write unit tests for sign-in and enrollment flows
    - First-sign-in prompt vs returning-student skip, invalid-credential message, not-registered message
    - _Requirements: 1.4, 2.6, 2.7, 2.8_

- [x] 18. Implement Dashboard and Timetable UI
  - [x] 18.1 Implement the Timetable module UI
    - Weekly grid by day/time slot; add/edit class session entry persisted with Section and subject and shown in the correct cell
    - _Requirements: 14.1, 14.2_

  - [x] 18.2 Implement the Dashboard module UI
    - Summary cards (total students, avg attendance, avg internal marks, syllabus progress), At_Risk_Count placeholder, today's classes (derived from timetable), attendance trend chart (default last 30 days with range control), needs-attention list ranked by lowest combined performance, empty states
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 14.3_

  - [ ]* 18.3 Write unit/snapshot tests for Dashboard and Timetable
    - Timetable add/edit display, dashboard empty states, needs-attention ranking
    - _Requirements: 4.6, 14.2_

- [x] 19. Implement Attendance and Heatmap UI
  - [x] 19.1 Implement the Attendance module UI
    - Section/subject/date/time-slot selection showing the section roster with present/absent controls, live counts, save/reopen of saved values across multiple periods and lab sessions
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 19.2 Implement the Heatmap module UI
    - Calendar-style grid colored by aggregated daily attendance level and a defaulter list (< 75%) recomputed on load
    - _Requirements: 13.1, 13.3, 13.4_

  - [ ]* 19.3 Write snapshot tests for heatmap and attendance rendering
    - Heatmap grid coloring and defaulter list rendering
    - _Requirements: 13.1, 13.3_

- [x] 20. Implement Syllabus and Marks UI
  - [x] 20.1 Implement the Syllabus Tracker UI
    - Subject → units → topics with completion checkboxes, unit/topic CRUD, planning data, progress percentages per subject/unit, on/behind-schedule status, empty state
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 20.2 Implement the Marks Calculator UI
    - Define/edit/remove weighted mark components, per-student value entry with inline validation, auto-calculated internal marks display, persistence of values and computed totals
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 20.3 Write unit tests for syllabus and marks UI behavior
    - Zero-topic empty state, schedule status display, mark-value validation message
    - _Requirements: 6.7, 7.5_

- [x] 21. Implement Quiz UI (teacher creation and student attempt)
  - [x] 21.1 Implement quiz creation UI
    - Create MCQ quizzes linked to a unit with options/correct option/marks (default 1), configurable time limit (default 15), generate unique shareable link, and view attempts list with scores
    - _Requirements: 8.1, 8.2, 8.3, 8.12_

  - [x] 21.2 Implement student quiz attempt UI
    - Attempt flow with remaining-time display and auto-submit on expiry, score display on submit, already-attempted handling via the access function
    - _Requirements: 8.7, 8.9, 8.10_

  - [ ]* 21.3 Write unit tests for quiz defaults and timer behavior
    - Default marks/time-limit, auto-submit on expiry, already-attempted message
    - _Requirements: 8.3, 8.7, 8.10_

- [x] 22. Implement Assignment and Material UI
  - [x] 22.1 Implement the Assignment module UI
    - Create assignment (title/subject/unit/due date + file upload) with unique shareable link, public view/download (no student upload), Assignment Tracker and independent Lab Manual Tracker grids with per-unit submitted controls
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x] 22.2 Implement the Material module UI
    - Upload study material to Cloudinary with type/size validation, generate direct CDN link, serve without auth, and list uploaded material with links
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 22.3 Write unit tests for material listing and upload validation messages
    - Disallowed type/oversize rejection message and material list rendering
    - _Requirements: 10.3, 10.4_

- [x] 23. Implement Leaderboard, Analytics, and locked AI features
  - [x] 23.1 Implement the Leaderboard module UI
    - Enable/disable toggle (hidden when disabled), teacher-set weightages, ranked display reflecting updated data on next load
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 23.2 Implement the Analytics module UI
    - Configurable Performance_Threshold (default 60), class average chart, unit-wise quiz score chart highlighting the lowest-average unit, grade distribution chart, threshold applied to at-risk identification, empty states
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 23.3 Implement locked AI feature placeholders
    - Show AI Quiz Generator and Risk Predictor as nav items rendering a locked "Locked — unlock later" state while FEATURE_AI is false; execute no AI logic; expose entry points when the flag is true without code-structure changes
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [ ]* 23.4 Write unit tests for leaderboard visibility and locked-feature rendering
    - Disabled leaderboard hidden, locked-state rendering, flag-driven exposure
    - _Requirements: 11.2, 15.2, 15.3_

- [x] 24. Implement seed data
  - [x] 24.1 Create the seed data script
    - Seed the Internet and Web Technology (5th Semester) subject; the twelve named students each with a pattern-conforming roster enrollment number (reusing the Property 1 validator); varied attendance and marks producing non-uniform dashboard/leaderboard/analytics/heatmap results
    - _Requirements: 21.1, 21.2, 21.3, 21.4_

  - [ ]* 24.2 Write a smoke test for seed data integrity
    - Verify subject and twelve students load with conforming enrollment numbers and varied values
    - _Requirements: 21.1, 21.2, 21.3, 21.4_

- [x] 25. Implement deployment configuration and security smoke checks
  - [x] 25.1 Configure the Cloudflare Pages static build
    - Configure the static Vite build with documented build command and output directory; read all deployment config (Supabase, Cloudinary env vars) from environment at build time; document the Cloudflare Pages env configuration procedure
    - _Requirements: 22.1, 22.2, 22.3, 22.4_

  - [ ]* 25.2 Write configuration smoke tests
    - Assert no teacher/student signup routes exist, `files.storage_type` constraint rejects invalid values, built bundle contains the Anon_Key only (never Service_Role_Key), and build produces the documented output directory
    - _Requirements: 1.1, 2.9, 9.3, 16.1, 18.1, 18.2, 22.1_

- [x] 26. Final checkpoint - integration and full verification
  - [x] 26.1 Wire all modules into the routed application shell
    - Connect every module into the sidebar navigation and router, ensuring teacher views are guarded and student token routes are public; confirm no orphaned components
    - _Requirements: 1.5, 20.7_

  - [x] 26.2 Checkpoint - ensure all tests pass
    - Ensure all property, unit, integration, snapshot, and smoke tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP, though they validate the design's correctness properties and integration concerns.
- Each task references specific requirements (granular sub-requirements) for traceability.
- The 23 property-based tests use fast-check (minimum 100 iterations each) and target the pure domain layer.
- RLS, auth, audit, storage, and configuration concerns are verified by integration and smoke tests rather than property tests, per the design's testing strategy.
- Checkpoints ensure incremental validation at the domain-complete boundary and at final integration.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "3.1", "4.1", "5.1", "6.1", "7.1", "8.1", "9.1", "10.1", "11.1", "12.1", "13.1"] },
    { "id": 3, "tasks": ["2.2", "3.2", "3.3", "4.2", "4.3", "4.4", "5.2", "5.3", "6.2", "6.3", "7.2", "7.3", "8.2", "9.2", "10.2", "10.3", "10.4", "10.5", "11.2", "11.3", "12.2", "13.2", "13.3"] },
    { "id": 4, "tasks": ["3.4"] },
    { "id": 5, "tasks": ["15.1"] },
    { "id": 6, "tasks": ["15.2", "15.3", "15.4"] },
    { "id": 7, "tasks": ["15.5", "15.6", "15.7", "16.1"] },
    { "id": 8, "tasks": ["16.2", "16.3"] },
    { "id": 9, "tasks": ["16.4", "17.1"] },
    { "id": 10, "tasks": ["17.2"] },
    { "id": 11, "tasks": ["17.3", "18.1", "19.1", "20.1", "20.2", "21.1", "22.1", "22.2", "23.1", "23.2", "23.3", "24.1", "25.1"] },
    { "id": 12, "tasks": ["18.2", "19.2", "21.2", "24.2", "25.2"] },
    { "id": 13, "tasks": ["18.3", "19.3", "20.3", "21.3", "22.3", "23.4"] },
    { "id": 14, "tasks": ["26.1"] }
  ]
}
```
