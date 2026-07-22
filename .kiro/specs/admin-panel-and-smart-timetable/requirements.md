# Requirements Document

## Introduction

This feature introduces a third application role — Admin — and a self-service Admin Panel that eliminates the sole developer's manual Supabase SQL Editor work for four recurring operational tasks: approving teacher emails, provisioning a new intake's batch/section/roster, promoting a batch to its next semester, and cleaning up stuck quiz sessions. It also delivers a full overhaul of the Timetable module so it matches the college's real period-based schedule format and becomes the authoritative source of scheduled time slots for Attendance, closing the long-standing gap where Attendance showed a generic, disconnected list of time slots.

The work is delivered in four phases, each independently shippable:

- **Phase 1 — Admin role & core admin panel**: the `admin` role itself, teacher-allowlist management, granular delegated permissions, and quiz/session cleanup actions.
- **Phase 2 — Admin bulk session & roster management**: admin-driven creation of a new academic session (batch, sections, subjects) and bulk roster import, plus a duplicate-assignment safeguard that also benefits the existing teacher-driven "My Teaching Subjects" flow.
- **Phase 3 — Batch promotion & academic history**: admin-driven semester promotion of one batch at a time, the consequential handling of stale teacher assignments, and a new read-only academic history view for teachers.
- **Phase 4 — Timetable overhaul**: a fixed, college-wide period system, multi-period lab entries, a draft/confirmed lock workflow, a unified cross-batch "My Schedule" view, cross-batch conflict detection, and Attendance deriving its time options from a teacher's confirmed timetable.

Admin and Teacher are independent roles: granting admin power to an identity does not grant teacher power, and vice versa. An identity may hold both, one, or neither.

Phase 1 routing and role-checks extend the `get_my_role()` RPC and `useUserRole()` hook delivered by the `student-signin-role-routing-fix` bugfix, adding an `'admin'` outcome alongside the existing `'teacher' | 'pending-teacher' | 'none'` values, rather than reintroducing a client-side heuristic. Every new RPC an admin or a delegated teacher calls MUST be `SECURITY DEFINER` and MUST explicitly verify the caller's admin status or specific delegated permission server-side, mirroring the existing `add_allowed_teacher()` / `is_teacher()` pattern. Row Level Security remains the authoritative security boundary throughout this feature: no phase weakens an existing RLS policy; every new capability is enforced by new, additive RLS policies or `SECURITY DEFINER` RPCs.

**Explicitly deferred (not part of this specification):** admin-driven timetable file upload with automatic bulk teacher re-assignment for a promoted batch's new semester. This was discussed and intentionally deferred by the product owner ("teacher ka time table admin side se update karna — skip karte hain, aage chal ke karenge"). It is noted here only so the context is not lost for a future spec; no requirement in this document depends on it, and Phase 3's stale-assignment handling instead relies on a teacher self-service re-selection flow.

## Glossary

- **System**: The MIS web application as a whole (React/Vite frontend plus Supabase backend).
- **Admin**: A signed-in identity whose email is present in the `admins` table; holds administrative capabilities independent of any Teacher or Student role the same identity may also hold.
- **Teacher**: A signed-in identity with a row in `public.teachers`, onboarded via the existing wizard and gated by `allowed_teacher_emails`.
- **Student**: A signed-in identity accessing shareable quiz links, authorized against `public.student_roster` / `public.students`.
- **Admins_Table**: The `public.admins` table, email-keyed, mirroring the existing `allowed_teacher_emails` pattern, listing every identity with administrative capability.
- **Allowed_Teacher_Emails**: The existing `public.allowed_teacher_emails` table gating who may complete teacher onboarding.
- **Get_My_Role**: The existing `get_my_role()` `SECURITY DEFINER` RPC used for authoritative, server-side role resolution for client-side routing; extended by this feature to also return `'admin'`.
- **Admin_Panel**: The new Admin-only section of the application navigation and its pages.
- **Delegated_Permission**: A specific, individually toggleable extra capability an Admin grants to one named Teacher (for example roster-import authority) without making that Teacher an Admin.
- **Teacher_Extra_Powers**: The record/table that stores which Delegated_Permission flags are active for which Teacher, including provenance (`granted_by`, `created_at`).
- **Quiz_Attempt_Session**: A row in `public.quiz_attempt_sessions` representing one student's in-progress, server-timed attempt at one quiz.
- **Batch**: A row in `public.batches` representing one admitted intake, identified by an id such as `2026-30`, with a `current_sem` (1-8) and a `status` of `classes`, `exams`, or `graduated`.
- **Session_Creation_Wizard**: The new Admin-only flow for provisioning a Batch's sections and importing their rosters for a semester.
- **Section**: A row in the existing shared `public.sections` table representing one physical group of students (for example Section A); shared across all Teachers, never owned by one Teacher.
- **Syllabus_Subjects**: The existing master-syllabus table (`public.syllabus_subjects`), keyed by semester (`sem`), listing every subject offered in that semester.
- **Student_Roster**: The combination of `public.students` and `public.student_roster` rows identifying which students belong to a Section and which email/enrollment pairs are authorized.
- **Roster_Import**: The bulk CSV or single-row process that creates Student_Roster and `students` rows for a Section, reusing the parsing/validation logic in `rosterImportAccess.ts` / `parsers.ts`.
- **Teacher_Assignment**: A row in `public.teacher_assignments` (teacher, subject, batch, section, is_lab) produced by onboarding or by "My Teaching Subjects", representing one Teacher's claim to teach one subject to one section of one batch.
- **My_Teaching_Subjects**: The existing subject/section picker on `ProfilePage.tsx` that lets an onboarded Teacher create Teacher_Assignment rows for live batches.
- **Stale_Assignment**: A Teacher_Assignment whose `subject_id` belongs to a semester the Assignment's Batch has since been promoted past.
- **Academic_History_View**: The new read-only page where a Teacher views their own past-semester attendance/marks/quiz data for promoted or graduated Batches.
- **Timetable_Entry**: A row in `public.timetable_entries` representing one scheduled session for a Teacher's Section/subject on a given day and period.
- **Period**: One fixed, college-wide time slot in the daily schedule (Period I through Period VII), each with a fixed start and end time, defined once and shared across the whole department.
- **Period_Catalog**: The fixed, ordered list of Periods (including the lunch break and the distinct Saturday activity block) that Teachers select from instead of typing free-text time slots.
- **Timetable_Status**: The `draft` or `confirmed` state of a Teacher's timetable for a given Section, controlling whether Attendance may read scheduled periods from it.
- **My_Schedule_View**: The new unified weekly grid showing every Section/Batch/subject combination across all of a Teacher's Teacher_Assignments in one view.
- **Selected_Section_Context**: The existing global section/subject selector (`SelectedSectionContext`) used by Attendance, Marks, and other single-section-scoped pages; unaffected by the introduction of My_Schedule_View.
- **Attendance_Module**: The existing component (`AttendancePage.tsx` / `AttendanceView.tsx`) for marking and viewing per-period attendance, whose time-slot options are changed by this feature to derive from a confirmed Timetable_Entry set.
- **RLS**: Row Level Security policies enforced in PostgreSQL restricting row access by role and ownership.
- **Security_Definer_RPC**: A PostgreSQL function that runs with the privileges of its owner rather than its caller, used here so Admin/delegated actions can read or write rows the caller's own RLS would otherwise block, while the function body itself enforces the authorization check.

## Requirements

## Phase 1 — Admin Role & Core Admin Panel

### Requirement 1: Admin Role and Bootstrap

**User Story:** As the product owner, I want a distinct Admin role that can be granted and managed without ongoing developer involvement, so that administrative work does not depend on manual database access after the first Admin exists.

#### Acceptance Criteria

1. THE System SHALL recognize `admin` as a role distinct from `teacher` and `student`, such that granting Admin capability to an identity SHALL NOT grant that identity Teacher or Student capability, and granting Teacher or Student capability SHALL NOT grant Admin capability.
2. THE System SHALL store Admin eligibility in an email-keyed `Admins_Table` following the same shape as `Allowed_Teacher_Emails` (email, `added_by`, `created_at`).
3. THE System SHALL require that the first Admin row be inserted via a one-time manual SQL statement, and THE System SHALL document this bootstrap step rather than provide an in-application path to create the first Admin.
4. WHEN at least one Admin row exists, THE Admin_Panel SHALL allow a signed-in Admin to add another identity's email as an Admin without further manual SQL.
5. WHEN a signed-in Admin removes an Admin row for another identity, THE System SHALL revoke that identity's Admin capability immediately.
6. IF an Admin attempts to remove their own Admin row while it is the only remaining row in the `Admins_Table`, THEN THE System SHALL reject the removal server-side and SHALL display a message explaining that at least one Admin must remain.
7. IF a request attempts to delete the last remaining `Admins_Table` row through any path other than the documented bootstrap SQL, THEN THE System SHALL reject the request via a database-level check (trigger or `Security_Definer_RPC`), not solely via client-side validation.
8. THE Get_My_Role RPC SHALL return `'admin'` when the caller's email is present in the `Admins_Table`, in addition to its existing `'teacher' | 'pending-teacher' | 'none'` outcomes.
9. WHEN a signed-in identity's resolved role includes `'admin'`, THE System SHALL display an "Admin" section in the application navigation.
10. IF a signed-in identity's resolved role does not include `'admin'`, THEN THE System SHALL NOT display the Admin navigation section and SHALL NOT render any Admin-only route.

### Requirement 2: Teacher Approval Management

**User Story:** As an Admin, I want to manage the teacher-allowlist and view onboarding status from the UI, so that I no longer need SQL Editor access to approve new teachers.

#### Acceptance Criteria

1. WHEN an Admin opens the teacher-approval page, THE Admin_Panel SHALL display every entry currently in `Allowed_Teacher_Emails`.
2. WHEN an Admin submits a new email to allow, THE Admin_Panel SHALL add it to `Allowed_Teacher_Emails` via the existing `add_allowed_teacher()` RPC.
3. WHEN an Admin removes an email from the allowlist, THE Admin_Panel SHALL delete the corresponding `Allowed_Teacher_Emails` row via a new `Security_Definer_RPC` equivalent to `add_allowed_teacher()` that requires Admin (or delegated allowlist-approval) authorization.
4. IF a caller without Admin status or the allowlist-approval Delegated_Permission invokes the allowlist-add or allowlist-remove RPC, THEN THE System SHALL deny the request.
5. WHEN an Admin opens the teacher-approval page, THE Admin_Panel SHALL display every row in `public.teachers` with its onboarded status, email, and name, distinguishing onboarded Teachers from emails that are merely allowlisted but not yet onboarded.
6. THE teacher-approval page SHALL be read-only with respect to `public.teachers`; it SHALL NOT provide a control to directly edit a Teacher's profile row.

### Requirement 3: Delegated Extra Permissions

**User Story:** As an Admin, I want to grant specific extra capabilities to individual teachers without making them admins, so that trusted teachers can help with narrow operational tasks while every other teacher keeps the default, unprivileged access.

#### Acceptance Criteria

1. THE System SHALL model each extra capability as an independently toggleable flag scoped to one Teacher, stored so that granting a flag to one Teacher SHALL NOT affect any other Teacher.
2. THE System SHALL support, at minimum, the following independently toggleable Delegated_Permission flags per Teacher: cross-section/cross-teacher visibility, roster-import authority, and teacher-allowlist-approval authority.
3. WHERE no Delegated_Permission has been granted to a Teacher, THE System SHALL treat that Teacher as having none of the extra capabilities, by default.
4. WHEN an Admin grants a Delegated_Permission to a Teacher, THE System SHALL record `granted_by` (the granting Admin's identity) and `created_at` (the grant timestamp) on the resulting `Teacher_Extra_Powers` row.
5. WHEN an Admin revokes a previously granted Delegated_Permission from a Teacher, THE System SHALL remove or deactivate that Teacher's flag immediately.
6. IF a Teacher attempts to grant or revoke any Delegated_Permission for themselves or for another Teacher, THEN THE System SHALL deny the request; only an Admin may grant or revoke a Delegated_Permission.
7. WHEN a Teacher holding the roster-import-authority Delegated_Permission performs a Roster_Import, THE System SHALL authorize that action via the delegated flag without requiring the Teacher to hold Admin status.
8. WHEN a Teacher holding the teacher-allowlist-approval Delegated_Permission adds or removes an `Allowed_Teacher_Emails` entry, THE System SHALL authorize that action via the delegated flag without requiring the Teacher to hold Admin status.

### Requirement 4: Quiz and Session Operational Cleanup

**User Story:** As an Admin, I want targeted cleanup actions for stuck quiz sessions and mis-bound roster enrollments, so that I can resolve these support cases without running SQL and without risking an accidental mass-wipe.

#### Acceptance Criteria

1. WHEN an Admin selects a specific quiz and student, THE Admin_Panel SHALL provide an action that deletes only that student's `Quiz_Attempt_Session` row(s) for that quiz.
2. THE Admin_Panel SHALL NOT provide a control that deletes every row in `public.quiz_attempt_sessions` in a single action.
3. WHEN an Admin selects a specific quiz and student and confirms, THE Admin_Panel SHALL invoke the existing `reset_quiz_attempt` RPC to clear that student's attempt on that quiz.
4. WHEN an Admin selects a roster enrollment whose bound email is incorrect and confirms, THE Admin_Panel SHALL unbind that enrollment's email via a `Security_Definer_RPC`, leaving the enrollment number and section membership otherwise unchanged.
5. IF a caller without Admin status invokes the session-cleanup, attempt-reset, or enrollment-unbind RPC, THEN THE System SHALL deny the request.

### Requirement 5: Admin Panel Boundaries (Out of Scope)

**User Story:** As the product owner, I want firm boundaries on what the Admin Panel can touch, so that Admin capability can never be used to silently alter or impersonate a Teacher's or Student's operational data.

#### Acceptance Criteria

1. THE Admin_Panel SHALL NOT provide a generic "edit as this user" capability for any Teacher or Student.
2. THE Admin_Panel SHALL NOT provide direct in-place editing of a Teacher's or Student's attendance records, marks records, or quiz content; any correction path MUST be a scoped, purpose-built action such as those defined in Requirement 4.
3. THE Admin_Panel SHALL NOT expose a control that runs an arbitrary or raw SQL statement.
4. THE Admin_Panel SHALL NOT expose a control that executes a database migration.
5. THE Admin_Panel SHALL NOT expose a bulk-delete control other than the scoped, explicitly-confirmed deletion actions defined elsewhere in this document (see Requirement 12).

## Phase 2 — Admin Bulk Session & Roster Management

### Requirement 6: New Session Creation Wizard

**User Story:** As an Admin, I want to create a new academic session with its batch, sections, and subjects in one guided flow, so that a new intake can be provisioned without manual database inserts.

#### Acceptance Criteria

1. WHEN an Admin starts the Session_Creation_Wizard, THE Admin_Panel SHALL prompt for a batch code, an Odd/Even semester type, and a semester number.
2. WHEN an Admin selects a semester number, THE Session_Creation_Wizard SHALL auto-populate the candidate subject list from `Syllabus_Subjects` filtered by that semester, without requiring the Admin to re-enter subject data.
3. WHEN an Admin defines the number of sections for the Batch, THE Session_Creation_Wizard SHALL create the corresponding rows in the existing shared `public.sections` table.
4. THE Session_Creation_Wizard SHALL create sections as shared rows consistent with the existing shared-sections model, and SHALL NOT introduce per-Teacher ownership of a Section.
5. WHEN an Admin submits the Session_Creation_Wizard with a batch code that already exists, THE Admin_Panel SHALL reject the duplicate batch code and display a message identifying the conflict.

### Requirement 7: Bulk Roster Import Per Section

**User Story:** As an Admin, I want to bulk-import a section's roster with required student emails, so that 200+ students gain immediate, correctly-bound access without a later verification step.

#### Acceptance Criteria

1. WHEN an Admin imports a roster CSV for a Section, THE Roster_Import SHALL require each row to contain an enrollment number, a name, and an email.
2. IF an uploaded roster row is missing an email, THEN THE Roster_Import SHALL reject that row and SHALL display a validation message identifying the row and the missing field.
3. WHEN a roster row's email is accepted, THE Roster_Import SHALL bind that email to the student's access immediately, such that the student's first quiz-link click requires no further first-time enrollment verification step.
4. THE Roster_Import SHALL reuse the existing CSV-parsing and validation logic already implemented for Teacher-driven roster import (`rosterImportAccess.ts`, `parsers.ts`), invoked from an Admin-driven entry point.
5. WHEN an Admin adds a single student manually with enrollment number, name, and email, THE Admin_Panel SHALL create that student's Student_Roster entry as an alternative to CSV import.
6. IF an uploaded roster row's enrollment number does not conform to the existing enrollment-number format, THEN THE Roster_Import SHALL reject that row and SHALL display a validation message identifying the row and the format violation.

### Requirement 8: Teacher Pickup of Admin-Provisioned Roster

**User Story:** As a Teacher, I want a newly admin-created section's roster to already be there when I claim it in My Teaching Subjects, so that I never have to re-enter a student list myself.

#### Acceptance Criteria

1. WHEN a Teacher selects, in My_Teaching_Subjects, a batch/section/subject combination that an Admin has already provisioned via the Session_Creation_Wizard and Roster_Import, THE System SHALL display that Section's already-imported Student_Roster to the Teacher immediately, without requiring any student-list data entry by the Teacher.

### Requirement 9: Duplicate-Assignment Safeguard

**User Story:** As an Admin or Teacher, I want the system to prevent two different teachers from claiming the same subject and section, so that ownership of a class stays unambiguous.

#### Acceptance Criteria

1. IF a Teacher attempts to create a Teacher_Assignment for a (subject, section, batch) combination already claimed by a different Teacher, THEN THE System SHALL block the save and SHALL display a message stating that the combination is already assigned.
2. THE duplicate-assignment block defined in this Requirement SHALL apply to assignment creation through My_Teaching_Subjects and through any Admin-driven assignment path alike.
3. THE message shown when blocking a duplicate assignment SHALL NOT be required to reveal the identity of the other Teacher who holds the assignment.
4. WHEN two different Teachers each create a Teacher_Assignment for the same Section and Batch but for two different subjects, THE System SHALL allow both assignments to be saved.
5. THE System SHALL enforce the duplicate-assignment safeguard at the database level (a uniqueness or exclusion constraint, or an equivalent server-side check), not solely via client-side validation.

### Requirement 10: Student Removal — Safe Roster Removal

**User Story:** As an Admin, I want to remove a student from a section's active roster while preserving their historical records, so that day-to-day roster cleanup never silently destroys attendance, marks, or quiz history.

#### Acceptance Criteria

1. WHEN an Admin performs "remove from roster" on a student, THE System SHALL remove that student's future visibility and access for the Section without deleting the student's historical attendance, marks, or quiz-attempt records.
2. THE "remove from roster" action SHALL be the default removal action offered for a roster entry.

### Requirement 11: Student Removal — Permanent Deletion

**User Story:** As an Admin, I want a clearly separated, explicitly confirmed permanent-delete action, so that destructive removal can never happen by accident.

#### Acceptance Criteria

1. THE "permanently delete" action SHALL be presented separately from "remove from roster" and SHALL require an explicit additional confirmation step before executing.
2. WHEN an Admin confirms "permanently delete" for a student, THE System SHALL display a warning that the action is destructive and may break historical foreign-key references to that student's records before the deletion executes.
3. IF an Admin dismisses or cancels the additional confirmation step, THEN THE System SHALL NOT delete the student record.

## Phase 3 — Batch Promotion & Academic History

### Requirement 12: Individual Batch Promotion

**User Story:** As an Admin, I want to promote one batch at a time to its next semester, so that batches that reach their promotion point at different real-world times can each be advanced independently.

#### Acceptance Criteria

1. WHEN an Admin promotes a Batch whose `current_sem` is less than 8, THE System SHALL increment that Batch's `current_sem` by exactly 1.
2. IF an Admin promotes a Batch whose `current_sem` is 8, THEN THE System SHALL set that Batch's `status` to `'graduated'` instead of incrementing `current_sem` further.
3. THE batch-promotion action SHALL apply to exactly one Batch selected by the Admin and SHALL NOT alter the `current_sem` or `status` of any other Batch.
4. WHEN a Batch is promoted, THE System SHALL leave that Batch's `sections`, `students`, and `student_roster` rows unchanged.
5. IF a caller without Admin status invokes the batch-promotion RPC, THEN THE System SHALL deny the request.

### Requirement 13: Stale-Assignment Handling After Promotion

**User Story:** As a Teacher, I want to be notified when my assignment for a promoted batch is no longer current, so that I know to re-select my subjects for the new semester.

#### Acceptance Criteria

1. WHEN a Batch is promoted, THE System SHALL treat every Teacher_Assignment tied to that Batch whose `subject_id` belongs to the Batch's prior semester's Syllabus_Subjects set as a Stale_Assignment.
2. THE System SHALL exclude a Stale_Assignment from dashboard, Attendance, and Timetable "active assignment" calculations.
3. THE promotion of one Batch SHALL NOT mark as stale any Teacher_Assignment belonging to a different Batch.
4. WHEN a Teacher whose Teacher_Assignment has become a Stale_Assignment next accesses the application, THE System SHALL display a notification identifying the affected Batch and directing the Teacher to My_Teaching_Subjects to re-select subjects for the new semester.
5. THE System SHALL provide the stale-assignment re-selection exclusively as a Teacher self-service flow through My_Teaching_Subjects; automatic re-assignment from an admin-uploaded timetable is out of scope for this requirement (see Introduction).

### Requirement 14: Read-Only Academic History View

**User Story:** As a Teacher, I want to browse my own past semesters' attendance, marks, and quiz records after a batch has moved on, so that I retain reference access without being able to alter historical data.

#### Acceptance Criteria

1. WHEN a Teacher opens the Academic_History_View, THE System SHALL display that Teacher's own historical attendance, marks, and quiz records for Batches that have been promoted past a given semester or that have `status = 'graduated'`, organized by Batch, then semester, then subject.
2. THE Academic_History_View SHALL NOT provide any control to mark attendance, edit marks, or edit quiz content.
3. THE Academic_History_View SHALL query existing owner-scoped historical data and SHALL NOT require any new table or column to store historical records.
4. THE Academic_History_View SHALL restrict a Teacher's results to that Teacher's own historical records, consistent with the existing owner-scoped RLS model.

## Phase 4 — Timetable Overhaul

### Requirement 15: Fixed, College-Wide Period System

**User Story:** As a Teacher, I want to pick from the college's actual fixed periods instead of typing a free-text time, so that my timetable matches the real daily schedule.

#### Acceptance Criteria

1. THE System SHALL define a Period_Catalog of fixed, department-wide Periods (Period I through Period VII), each with a fixed start time and end time, shared across all Teachers and Batches.
2. THE Period_Catalog SHALL include a designated lunch break between periods, matching the reference schedule's midday break placement.
3. THE Period_Catalog SHALL represent Saturday as a distinct block (for example, a single "NCC/NSS/CLUB ACTIVITIES/SPORTS/NPTEL/T&P" entry) rather than the Monday-to-Friday Period I-VII structure.
4. WHEN a Teacher creates or edits a Timetable_Entry, THE System SHALL require the Teacher to select the Period from the Period_Catalog via a dropdown rather than entering free-text time.
5. THE System SHALL replace the existing free-text `time_slot` text input in the timetable editor with the Period_Catalog-driven selector for all newly created or edited entries.

### Requirement 16: Lab Entries Spanning Multiple Periods

**User Story:** As a Teacher, I want to create one lab entry that spans multiple consecutive periods, so that a lab session is represented as a single entry instead of several disconnected ones.

#### Acceptance Criteria

1. WHEN a Teacher creates a lab Timetable_Entry, THE System SHALL allow that entry to span two or more consecutive Periods as a single entry.
2. WHEN the My_Schedule_View or Timetable grid renders a lab Timetable_Entry spanning multiple Periods, THE System SHALL render it as one merged cell across the spanned Periods.
3. IF a Teacher attempts to create a lab Timetable_Entry spanning non-consecutive Periods, THEN THE System SHALL reject the entry and SHALL display a message explaining that spanned Periods must be consecutive.

### Requirement 17: Additional Entry Metadata

**User Story:** As a Teacher, I want to record a room, a tutorial marker, or a non-subject activity on a timetable entry, so that the grid captures the same detail as the college's real timetable.

#### Acceptance Criteria

1. WHERE a Teacher provides a room or location value for a Timetable_Entry, THE System SHALL store and display it alongside that entry.
2. WHERE a Teacher marks a Timetable_Entry as a tutorial, THE System SHALL store and display a tutorial marker (matching the reference format's "-T" suffix) alongside that entry.
3. THE System SHALL allow a Teacher to select a special non-subject activity (Library, Mentor, Club Activities, Sports, or NCC/NSS) in place of a subject when creating a Timetable_Entry.
4. WHEN a Timetable_Entry uses a special non-subject activity, THE System SHALL NOT require that entry to reference a `syllabus_subjects` row or one of the Teacher's own `subjects` rows.

### Requirement 18: Confirm Timetable Lock Mechanism

**User Story:** As a Teacher, I want to lock my timetable once it is final, so that Attendance can safely rely on it and accidental edits don't silently break the schedule it depends on.

#### Acceptance Criteria

1. THE System SHALL track a Timetable_Status of `draft` or `confirmed`, scoped per Teacher and Section (or per Teacher, Section, and Batch, matching however `timetable_entries` is keyed at implementation time).
2. THE Timetable_Status for a newly created Section's timetable SHALL default to `draft`.
3. WHILE a Teacher's timetable for a Section is `draft`, THE System SHALL allow the Teacher to freely add, edit, or delete that Section's Timetable_Entry rows.
4. WHEN a Teacher performs "Confirm Timetable" on a `draft` timetable, THE System SHALL transition that Section's Timetable_Status to `confirmed`.
5. IF a Teacher attempts to add, edit, or delete a Timetable_Entry for a Section whose Timetable_Status is `confirmed`, THEN THE System SHALL reject the change unless the Teacher first performs an explicit "unlock/edit" action.
6. WHEN a Teacher performs "unlock/edit" on a `confirmed` timetable, THE System SHALL transition that Section's Timetable_Status to `draft`.
7. WHILE a Section's Timetable_Status is `draft` (including after an unlock), THE Attendance_Module SHALL NOT treat that Section's Timetable_Entry rows as the confirmed schedule for period-derivation purposes (see Requirement 21) until the timetable is re-confirmed.

### Requirement 19: Unified "My Schedule" View

**User Story:** As a Teacher who teaches multiple batches and sections, I want one combined weekly view of everything I teach, so that I don't have to switch a section dropdown to see my full week.

#### Acceptance Criteria

1. WHEN a Teacher opens My_Schedule_View, THE System SHALL display a single weekly grid containing every Section, Batch, and semester the Teacher teaches, derived from all of that Teacher's Teacher_Assignment rows.
2. THE My_Schedule_View cell label SHALL follow the exact format `"SEM {n}({section}) {subject name}"` (for example, `"SEM 5(A) Distributed Systems"`).
3. WHERE a subject name is too long to display fully within a My_Schedule_View cell, THE System SHALL truncate or wrap the label using a defined, consistent rule rather than overflowing or clipping unpredictably.
4. THE introduction of My_Schedule_View SHALL NOT remove or alter Selected_Section_Context's existing per-section usage on Attendance, Marks, or any other page that remains scoped to one Section at a time.

### Requirement 20: Cross-Batch Conflict Detection

**User Story:** As a Teacher who teaches several batches, I want the system to catch scheduling conflicts across all of my classes, so that I can never end up double-booked in the same period.

#### Acceptance Criteria

1. WHEN a Teacher attempts to save or confirm a Timetable_Entry, THE System SHALL check for a conflict against every other Timetable_Entry belonging to that same Teacher across all of that Teacher's Batches, Sections, and semesters.
2. IF the Teacher already has another Timetable_Entry on the same day and the same Period (or an overlapping Period, accounting for multi-Period lab entries per Requirement 16), THEN THE System SHALL block the save or confirm action.
3. WHEN blocking a save or confirm action due to a conflict, THE System SHALL display the conflicting entry's day, Period, Batch, section, and subject so the Teacher can identify the cause.
4. THE conflict check defined in this Requirement SHALL evaluate the Teacher's entire schedule across all Teacher_Assignment rows, and SHALL NOT be scoped to a single Batch or Section.

### Requirement 21: Attendance Integration with Confirmed Timetable

**User Story:** As a Teacher, I want Attendance to show only the periods that are actually scheduled for a section and subject, so that I stop seeing an irrelevant generic time list.

#### Acceptance Criteria

1. WHEN a Teacher's timetable for a Section has Timetable_Status `confirmed`, THE Attendance_Module SHALL populate the time/period selector for that Section, subject, and day combination using only the Period(s) actually scheduled in that Section's confirmed Timetable_Entry rows for that exact Section, subject, and day.
2. THE Attendance_Module SHALL NOT populate the time/period selector for a `confirmed` Section's schedule from the generic hardcoded `DEFAULT_TIME_SLOTS` list.
3. IF no Timetable_Entry exists in `confirmed` status for a Section (the Teacher has not set one up, or it remains `draft`), THEN THE Attendance_Module SHALL apply a documented, deliberate fallback (falling back to the generic time-slot list, or prompting the Teacher to confirm a timetable first) rather than an inconsistent or silent behavior.
4. THE fallback behavior chosen to satisfy Acceptance Criterion 3 of this Requirement SHALL be applied consistently for every Section lacking a confirmed timetable, not decided ad hoc per Section.
