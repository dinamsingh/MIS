# Requirements Document

## Introduction

Teacher Academic MIS is a web-based personal academic management system designed for a single college teacher (pilot version). The system enables the teacher to manage students, period-wise attendance, syllabus progress, internal marks, quizzes, assignments, study material, and analytics from one dashboard. The single teacher account is pre-provisioned by an administrator; there is no teacher self-signup flow. Students never create accounts; they access shareable quiz, assignment, and study material links and authenticate with Google on demand.

Quiz access is restricted to pre-registered students: the Teacher maintains a student roster of enrollment numbers and emails, and the System verifies a student's identity against that roster before granting quiz access. Students do not submit assignment files through the application. Instead, the Teacher shares an assignment file for students to view or download, and the Teacher records physical submissions per student and per unit in dedicated assignment and lab-manual trackers.

The application is built with React, Vite, and Tailwind CSS on the frontend, and Supabase (PostgreSQL, Auth, Storage) on the backend, with Cloudinary as a secondary store for public/heavy files. The build is a static Vite bundle targeted for Cloudflare Pages hosting. All product-facing UI text is in professional English.

This document defines Version 1 requirements. Two advanced capabilities (AI Quiz Generator and Risk Predictor) are scoped as locked, feature-flagged placeholders only; their logic is out of scope for this version.

## Glossary

- **System**: The Teacher Academic MIS web application as a whole (frontend plus backend services).
- **Teacher**: The single pre-provisioned administrator who owns and operates the application with full access to all data.
- **Student**: A learner who accesses shareable links and authenticates with Google, without a dedicated signup flow.
- **Auth_Service**: The Supabase authentication subsystem handling teacher email/password, teacher Google login, and student Google login.
- **Student_Roster**: The teacher-maintained list of registered students, each entry containing an Enrollment_Number and an email address, used to authorize quiz access.
- **Enrollment_Number**: A unique student identifier matching the pattern of four digits, two uppercase letters, then six digits (for example, 0131CS241000).
- **Dashboard**: The landing view presenting summary cards, today's classes, attendance trend, and the needs-attention list.
- **Attendance_Module**: The component for marking and viewing per-period present/absent records across subjects and sections.
- **Period**: A single scheduled teaching slot within a day, identified by date, section, subject, and time slot; a day may contain multiple periods including multiple periods of the same subject and lab sessions.
- **Section**: A distinct group of students that may follow a different subject schedule from other sections.
- **Syllabus_Tracker**: The component tracking units and their topics per subject, with completion checkboxes, teacher planning, and progress status.
- **Unit**: A teacher-defined division of a subject's syllabus that contains one or more topics.
- **Topic**: A teacher-defined item within a unit that can be marked complete.
- **Marks_Calculator**: The component computing internal marks from a teacher-defined set of weighted mark components per student.
- **Mark_Component**: A teacher-defined internal-marks component (for example, mid-term, quiz, assignment, attendance, or custom) with its own maximum value and weightage.
- **Quiz_Module**: The component for creating MCQ quizzes linked to a unit, generating shareable links, restricting access to rostered students, enforcing a time limit, collecting attempts, and auto-grading.
- **Assignment_Module**: The component for publishing assignment files for student view/download and for tracking physical submissions per student and per unit.
- **Assignment_Tracker**: The per-student, per-unit grid used by the Teacher to mark which units of an assignment a student has physically submitted.
- **Lab_Manual_Tracker**: A separate per-student, per-unit grid used by the Teacher to mark which lab-manual units a student has physically submitted, managed independently from the Assignment_Tracker.
- **Material_Module**: The component for uploading study material and generating public shareable links.
- **Leaderboard_Module**: The optional, teacher-controlled component ranking students by a teacher-weighted combined performance score.
- **Analytics_Module**: The component rendering charts for class average, unit-wise quiz scores, and grade distribution, and applying the configurable performance threshold.
- **Performance_Threshold**: A teacher-configurable percentage, defaulting to 60 percent, used to identify at-risk performance.
- **Heatmap_Module**: The component rendering a calendar-style attendance grid and a defaulter list.
- **Timetable_Module**: The component displaying the weekly class schedule grid.
- **Feature_Flag**: A configuration value (e.g., FEATURE_AI) controlling whether a capability is active or locked.
- **Storage_Router**: The helper that decides whether an uploaded file is stored in Supabase or Cloudinary based on file category.
- **Supabase_Private_Bucket**: A private Supabase Storage bucket for sensitive files, served via time-limited signed URLs.
- **Cloudinary_Store**: The Cloudinary service for public/heavy files served via CDN direct links.
- **Signed_URL**: A time-limited URL granting temporary access to a private Supabase file.
- **RLS**: Row Level Security policies enforced in PostgreSQL restricting row access by user role and ownership.
- **Audit_Log**: A database table recording who changed marks or attendance records and when.
- **Defaulter**: A student whose attendance percentage is below 75 percent.
- **At_Risk_Count**: A Dashboard placeholder metric reserved for the locked Risk Predictor capability.
- **Internal_Marks**: The computed total derived from the teacher-defined weighted mark components for a student.
- **Anon_Key**: The Supabase anonymous public API key safe for frontend use.
- **Service_Role_Key**: The Supabase privileged key that MUST never be exposed to the frontend.

## Requirements

### Requirement 1: Teacher Authentication

**User Story:** As a Teacher, I want to sign in with my pre-provisioned email/password or Google account, so that I can securely access my administrative dashboard.

#### Acceptance Criteria

1. THE System SHALL provide a single pre-provisioned Teacher account and SHALL NOT provide a teacher self-registration flow.
2. WHEN the Teacher submits valid email and password credentials, THE Auth_Service SHALL establish an authenticated teacher session.
3. WHEN the Teacher chooses Google login and completes the Google consent flow, THE Auth_Service SHALL establish an authenticated teacher session.
4. IF the Teacher submits invalid credentials, THEN THE Auth_Service SHALL reject the sign-in attempt and display an error message in English.
5. WHILE a teacher session is active, THE System SHALL grant the Teacher full read and write access to all application data.
6. WHEN the Teacher signs out, THE Auth_Service SHALL terminate the teacher session and redirect to the sign-in view.
7. THE System SHALL designate the Teacher as the sole administrator account.

### Requirement 2: Student Roster and Authentication via Shareable Link

**User Story:** As a Teacher, I want quiz access limited to students on my roster, so that only registered students can attempt quizzes after signing in with Google.

#### Acceptance Criteria

1. THE System SHALL allow the Teacher to maintain a Student_Roster in which each entry stores a Student's Enrollment_Number and email address.
2. WHEN the Teacher adds or edits a Student_Roster entry, THE System SHALL validate the Enrollment_Number against the pattern of four digits, two uppercase letters, then six digits, and SHALL reject a non-conforming value with a validation message in English.
3. WHEN a Student opens a shareable quiz link, THE System SHALL present a Google sign-in option.
4. WHEN a Student completes Google sign-in, THE Auth_Service SHALL capture the Student name and email automatically from the Google profile.
5. WHEN a Student completes Google sign-in for a quiz, THE System SHALL grant access only if the Student email matches a Student_Roster entry and the Student-provided Enrollment_Number matches the email's roster entry.
6. IF a Student's email is not present in the Student_Roster, THEN THE System SHALL deny access and display a not-registered message in English.
7. WHEN a Student signs in for the first time, THE System SHALL prompt the Student to enter an Enrollment_Number once and SHALL store the Enrollment_Number with the Student record.
8. WHEN a returning Student signs in whose Enrollment_Number is already stored, THE System SHALL skip the Enrollment_Number prompt.
9. THE System SHALL NOT provide a student signup or password-creation flow.
10. WHILE a student session is active, THE System SHALL restrict the Student to viewing and modifying only the Student's own data.

### Requirement 3: Row Level Security and Data Access Control

**User Story:** As a Teacher, I want strict database access controls, so that students can never read or alter other students' or administrative data.

#### Acceptance Criteria

1. THE System SHALL enforce RLS on every database table.
2. WHILE a student session is active, THE System SHALL return only rows owned by the requesting Student.
3. WHILE a teacher session is active, THE System SHALL return all rows across all tables.
4. IF an unauthenticated request accesses a protected table, THEN THE System SHALL deny the request.
5. WHERE a table stores administrative-only data, THE System SHALL deny all student read and write access to that table.

### Requirement 4: Dashboard Overview

**User Story:** As a Teacher, I want a dashboard with key summaries, so that I can assess class status at a glance.

#### Acceptance Criteria

1. WHEN the Teacher opens the Dashboard, THE Dashboard SHALL display summary cards for total students, average attendance percentage, average internal marks, and syllabus progress percentage.
2. WHEN the Teacher opens the Dashboard, THE Dashboard SHALL display an At_Risk_Count card as a placeholder pending the locked Risk Predictor capability.
3. WHEN the Teacher opens the Dashboard, THE Dashboard SHALL display the list of classes scheduled for the current date.
4. WHEN the Teacher opens the Dashboard, THE Dashboard SHALL display an attendance trend chart defaulting to the last 30 days, with a Teacher control to change the date range.
5. WHEN the Teacher opens the Dashboard, THE Dashboard SHALL display a "Needs attention" list of students whose performance is below the Performance_Threshold, ranked by lowest combined performance.
6. IF no data exists for a summary metric, THEN THE Dashboard SHALL display a zero value or empty-state message in English rather than an error.

### Requirement 5: Period-Wise Attendance Marking

**User Story:** As a Teacher, I want to mark attendance per period with a live count, so that I can record presence accurately across multiple subjects, sections, and lab sessions in a single day.

#### Acceptance Criteria

1. WHEN the Teacher selects a Section, a subject, a date, and a Period time slot, THE Attendance_Module SHALL display the roster of enrolled students for that Section with present and absent controls.
2. THE Attendance_Module SHALL support multiple subjects and multiple Sections, and SHALL allow multiple Periods on the same date including multiple Periods of the same subject and lab sessions.
3. WHEN the Teacher marks a student present or absent, THE Attendance_Module SHALL update the live present count and absent count immediately.
4. WHEN the Teacher saves attendance for a selected Period, THE Attendance_Module SHALL persist one attendance record per student for that Section, subject, date, and time slot.
5. WHEN the Teacher reopens attendance for a Period that was already saved, THE Attendance_Module SHALL load the previously saved present/absent values.
6. IF the Teacher attempts to save a second attendance record for the same student and Period, THEN THE Attendance_Module SHALL update the existing record rather than create a duplicate.
7. WHEN an attendance record is created or modified, THE System SHALL write an Audit_Log entry recording the Teacher identity, the affected record, and the timestamp.

### Requirement 6: Syllabus Tracker

**User Story:** As a Teacher, I want to track units and topics per subject and plan them, so that I can monitor whether teaching is on schedule against the university syllabus.

#### Acceptance Criteria

1. THE Syllabus_Tracker SHALL organize each subject as a set of Units, and each Unit as a set of Topics, each Topic with a completion checkbox.
2. WHEN the Teacher adds, edits, or removes a Unit or a Topic, THE Syllabus_Tracker SHALL persist the change.
3. WHEN the Teacher sets a planned schedule for a Unit or Topic, THE Syllabus_Tracker SHALL persist the planning data.
4. WHEN the Teacher toggles a Topic completion checkbox, THE Syllabus_Tracker SHALL persist the new completion state.
5. WHEN Topic completion state changes, THE Syllabus_Tracker SHALL recalculate and display the progress percentage per subject and per Unit as completed Topics divided by total Topics.
6. THE Syllabus_Tracker SHALL display an on-schedule or behind-schedule status per subject and per Unit by comparing actual progress against the teacher-defined planned progress for the current date.
7. IF a subject or Unit has zero Topics defined, THEN THE Syllabus_Tracker SHALL display a zero percent progress and an empty-state message in English.

### Requirement 7: Internal Marks Calculator

**User Story:** As a Teacher, I want to define my own weighted mark components and auto-calculate internal marks, so that the calculation matches my grading scheme without manual arithmetic errors.

#### Acceptance Criteria

1. THE Marks_Calculator SHALL allow the Teacher to define a set of Mark_Components, each with a name, a maximum value, and a weightage.
2. WHEN the Teacher adds, edits, or removes a Mark_Component, THE Marks_Calculator SHALL persist the configuration.
3. THE Marks_Calculator SHALL accept a value for each defined Mark_Component per student.
4. WHEN the Teacher enters or edits any Mark_Component value for a student, THE Marks_Calculator SHALL auto-calculate and display the Internal_Marks total for that student from the teacher-defined components and weightages.
5. IF the Teacher enters a Mark_Component value below zero or above that component's configured maximum value, THEN THE Marks_Calculator SHALL reject the value and display a validation message in English.
6. WHEN the Teacher saves Mark_Component values, THE Marks_Calculator SHALL persist the component values and the computed Internal_Marks for each student.
7. WHEN any Mark_Component configuration or value is created or modified, THE System SHALL write an Audit_Log entry recording the Teacher identity, the affected student record, and the timestamp.

### Requirement 8: Quiz Creation and Attempt

**User Story:** As a Teacher, I want to create unit-linked MCQ quizzes with time limits and restricted access, so that only registered students can attempt them and attempts are auto-graded.

#### Acceptance Criteria

1. WHEN the Teacher creates a quiz, THE Quiz_Module SHALL persist the quiz with multiple-choice questions only, each question with its options, one correct option, and a marks value defaulting to 1.
2. WHEN the Teacher creates a quiz, THE Quiz_Module SHALL link the quiz to a specific syllabus Unit and SHALL generate a unique shareable link.
3. THE Quiz_Module SHALL assign each quiz a time limit defaulting to 15 minutes and configurable per quiz.
4. THE Quiz_Module SHALL apply no negative marking when grading.
5. WHEN a Student opens a quiz link and signs in with Google, THE Quiz_Module SHALL grant access only if the Student email matches a Student_Roster entry and the Student-provided Enrollment_Number matches that entry.
6. IF a Student whose email is not in the Student_Roster opens a quiz link, THEN THE Quiz_Module SHALL deny the attempt and display a not-registered message in English.
7. WHILE a Student is attempting a quiz, THE Quiz_Module SHALL display the remaining time and SHALL auto-submit the attempt when the time limit expires.
8. WHEN a Student submits a quiz attempt, THE Quiz_Module SHALL auto-grade the attempt against the stored correct options and persist the score.
9. WHEN a Student's quiz attempt is submitted, THE Quiz_Module SHALL display the Student's score to the Student.
10. IF a Student who has already submitted an attempt for a quiz opens the same quiz link, THEN THE Quiz_Module SHALL deny a second attempt and display the existing result or an already-attempted message in English.
11. THE Quiz_Module SHALL enforce exactly one stored attempt per Student per quiz.
12. WHEN the Teacher views a quiz, THE Quiz_Module SHALL display the list of student attempts with scores.

### Requirement 9: Assignment Distribution and Physical Submission Tracking

**User Story:** As a Teacher, I want to share assignment files for students to view or download and track their physical submissions per unit, so that I can manage offline submissions without students uploading files online.

#### Acceptance Criteria

1. WHEN the Teacher creates an assignment with a title, subject, Unit, and due date and uploads the assignment file, THE Assignment_Module SHALL persist the assignment and generate a unique shareable link.
2. WHEN a Student or any user opens an assignment shareable link, THE Assignment_Module SHALL allow the user to view or download the assignment file.
3. THE Assignment_Module SHALL NOT provide a student file upload or online submission flow.
4. THE Assignment_Module SHALL present an Assignment_Tracker that lists every student against each Unit of the assignment with a submitted/not-submitted control per Unit.
5. WHEN the Teacher marks a student's Unit as submitted or not submitted in the Assignment_Tracker, THE Assignment_Module SHALL persist the per-student, per-Unit submission status.
6. THE Assignment_Module SHALL present a Lab_Manual_Tracker, managed independently from the Assignment_Tracker, that lists every student against each lab-manual Unit with a submitted/not-submitted control per Unit.
7. WHEN the Teacher marks a student's lab-manual Unit as submitted or not submitted in the Lab_Manual_Tracker, THE Assignment_Module SHALL persist the per-student, per-Unit lab-manual submission status.

### Requirement 10: Study Material Sharing

**User Story:** As a Teacher, I want to upload study material and get a public shareable link, so that students can view material without signing in.

#### Acceptance Criteria

1. WHEN the Teacher uploads study material of an allowed type within the maximum size, THE Material_Module SHALL store the file in the Cloudinary_Store and generate a direct CDN shareable link.
2. WHEN any user opens a study material shareable link, THE Material_Module SHALL serve the file without requiring authentication.
3. IF the Teacher uploads a file of a disallowed type or exceeding the maximum size, THEN THE Material_Module SHALL reject the upload and display a validation message in English.
4. THE Material_Module SHALL display the list of uploaded study material with each item's shareable link.

### Requirement 11: Optional Leaderboard

**User Story:** As a Teacher, I want an optional leaderboard with weights I control, so that I can choose whether to rank students and how each factor contributes.

#### Acceptance Criteria

1. THE Leaderboard_Module SHALL allow the Teacher to enable or disable the leaderboard.
2. WHILE the leaderboard is disabled, THE System SHALL NOT display the Leaderboard_Module.
3. THE Leaderboard_Module SHALL allow the Teacher to set the weightage of the contributing factors internal marks, quiz scores, and attendance percentage.
4. WHILE the leaderboard is enabled, THE Leaderboard_Module SHALL compute a combined performance score per student using the teacher-defined weightages and SHALL display students ranked in descending order of that score.
5. WHEN underlying marks, quiz, attendance data, or weightages change, THE Leaderboard_Module SHALL reflect the updated ranking on next load.
6. IF two students have an equal combined performance score, THEN THE Leaderboard_Module SHALL apply a deterministic tie-break by student name in ascending order.

### Requirement 12: Smart Analytics

**User Story:** As a Teacher, I want analytics charts with a configurable performance threshold, so that I can understand class performance patterns and identify at-risk students.

#### Acceptance Criteria

1. THE Analytics_Module SHALL provide a Performance_Threshold that defaults to 60 percent and that the Teacher can change.
2. WHEN the Teacher opens the Analytics_Module, THE Analytics_Module SHALL display a class average chart.
3. WHEN the Teacher opens the Analytics_Module, THE Analytics_Module SHALL display a unit-wise quiz score chart and SHALL visually highlight the Unit with the lowest average score.
4. WHEN the Teacher opens the Analytics_Module, THE Analytics_Module SHALL display a grade distribution chart.
5. WHEN the Teacher changes the Performance_Threshold, THE Analytics_Module SHALL apply the updated threshold when identifying at-risk performance.
6. IF insufficient data exists to render a chart, THEN THE Analytics_Module SHALL display an empty-state message in English instead of an error.

### Requirement 13: Attendance Heatmap and Defaulter List

**User Story:** As a Teacher, I want a calendar heatmap and an automatic defaulter list, so that I can quickly see attendance patterns and at-risk students.

#### Acceptance Criteria

1. WHEN the Teacher opens the Heatmap_Module, THE Heatmap_Module SHALL display a calendar-style grid where each day cell is colored according to that day's attendance level aggregated across the day's Periods.
2. THE Heatmap_Module SHALL compute each student's attendance percentage as attended Periods divided by total held Periods.
3. THE Heatmap_Module SHALL list every Defaulter whose attendance percentage is below 75 percent.
4. WHEN attendance records change, THE Heatmap_Module SHALL recompute the defaulter list on next load.

### Requirement 14: Timetable

**User Story:** As a Teacher, I want a weekly schedule grid, so that I can view my class timetable.

#### Acceptance Criteria

1. THE Timetable_Module SHALL display a weekly grid of class sessions organized by day of week and time slot.
2. WHEN the Teacher adds or edits a class session entry, THE Timetable_Module SHALL persist the entry with its Section and subject and display the session in the corresponding day and time slot.
3. THE Dashboard SHALL derive the current date's classes from the Timetable_Module data.

### Requirement 15: Locked AI Features (Feature Flag)

**User Story:** As a Teacher, I want AI Quiz Generator and Risk Predictor visible but locked, so that I know they are coming without them being active yet.

#### Acceptance Criteria

1. THE System SHALL display AI Quiz Generator and Risk Predictor as menu items in the navigation.
2. WHILE the FEATURE_AI Feature_Flag is false, THE System SHALL render a locked state with an "Locked — unlock later" message in English for both AI capabilities.
3. WHILE the FEATURE_AI Feature_Flag is false, THE System SHALL NOT execute any AI Quiz Generator or Risk Predictor logic.
4. WHERE the FEATURE_AI Feature_Flag is set to true, THE System SHALL expose the AI capability entry points without requiring code structure changes.

### Requirement 16: Hybrid File Storage Routing

**User Story:** As a Teacher, I want files routed to the correct store based on sensitivity, so that sensitive data stays private and heavy public files load fast.

#### Acceptance Criteria

1. THE System SHALL maintain a files table that includes a storage_type column constrained to the values 'supabase' or 'cloudinary'.
2. WHEN a file categorized as sensitive (internal marks exports, exam PDFs, answer keys, student documents) is uploaded, THE Storage_Router SHALL store the file in the Supabase_Private_Bucket and record storage_type as 'supabase'.
3. WHEN a file categorized as public or heavy (study material, notes, images, experiment PDFs, assignment files) is uploaded, THE Storage_Router SHALL store the file in the Cloudinary_Store and record storage_type as 'cloudinary'.
4. WHEN access to a Supabase_Private_Bucket file is requested by an authorized user, THE System SHALL serve the file via a time-limited Signed_URL.
5. WHILE a student session requests a Supabase_Private_Bucket file the Student does not own, THE System SHALL deny access through RLS.
6. IF an upload's file type is not in the allowed list or exceeds the configured maximum size, THEN THE Storage_Router SHALL reject the upload and display a validation message in English.

### Requirement 17: Input Validation and Sanitization

**User Story:** As a Teacher, I want all inputs validated and sanitized, so that the application resists injection and cross-site scripting attacks.

#### Acceptance Criteria

1. WHEN any user submits text input, THE System SHALL sanitize the input to neutralize script and markup before storage or rendering.
2. WHEN any user submits structured input, THE System SHALL validate the input against the expected type, format, and range before processing.
3. IF submitted input fails validation, THEN THE System SHALL reject the submission and display a validation message in English.
4. THE System SHALL use parameterized database access for all queries containing user-supplied values.

### Requirement 18: Secret and Session Management

**User Story:** As a Teacher, I want secrets protected and sessions secured, so that the system cannot be compromised through exposed keys.

#### Acceptance Criteria

1. THE System SHALL expose only the Supabase Anon_Key in the frontend bundle.
2. THE System SHALL NOT include the Supabase Service_Role_Key in any frontend code or static bundle.
3. THE System SHALL load all secrets from environment variables rather than hard-coded values.
4. WHILE a user session is active, THE Auth_Service SHALL maintain the session using secure Supabase session handling.
5. WHEN a session expires or is invalidated, THE System SHALL require re-authentication before granting protected access.

### Requirement 19: Audit Logging

**User Story:** As a Teacher, I want an audit trail of marks and attendance changes, so that I can review who changed what and when.

#### Acceptance Criteria

1. THE System SHALL maintain an Audit_Log table recording the acting user identity, the affected record reference, the change type, and the timestamp.
2. WHEN a marks record is created, updated, or deleted, THE System SHALL write a corresponding Audit_Log entry.
3. WHEN an attendance record is created, updated, or deleted, THE System SHALL write a corresponding Audit_Log entry.
4. WHILE a student session is active, THE System SHALL deny all read access to the Audit_Log table.

### Requirement 20: Design System and Responsiveness

**User Story:** As a Teacher, I want a clean, consistent, responsive interface, so that the application is pleasant and usable on any device.

#### Acceptance Criteria

1. THE System SHALL render all UI text in professional English.
2. THE System SHALL apply the Inter font, background color #f4f5f9, surface color #ffffff, and border color #ecedf4.
3. THE System SHALL apply accent color #5b54e6, accent hover color #4a42d4, and accent-tint color #eef0fe to interactive accent elements.
4. THE System SHALL apply text color #1d2030, soft text color #5a6072, and muted text color #969cad to text elements by emphasis level.
5. THE System SHALL apply status colors green #12b886, amber #f59e0b, red #f0506e, and blue #4c8dff to status indicators.
6. THE System SHALL render cards with 16px corner radius and soft shadows, and buttons with 11px corner radius.
7. THE System SHALL present a left sidebar grouped into sections for navigation.
8. WHILE the viewport width changes across mobile, tablet, and desktop breakpoints, THE System SHALL adapt the layout to remain usable without horizontal overflow.

### Requirement 21: Seed Data

**User Story:** As a Teacher, I want realistic sample data preloaded, so that every screen demonstrates the application meaningfully during the pilot.

#### Acceptance Criteria

1. THE System SHALL provide seed data for the subject Internet and Web Technology, 5th Semester.
2. THE System SHALL provide seed data for twelve sample students named Aarav Mehta, Aditi Kumar, Ishan Verma, Kabir Joshi, Neha Singh, Rahul Mehta, Priya Kapoor, Simran Gill, Rohit Verma, Mohit Tyagi, Arjun Khanna, and Sana Nair.
3. THE seed data SHALL assign each sample student a Student_Roster entry with an Enrollment_Number matching the pattern of four digits, two uppercase letters, then six digits (for example, 0131CS241000).
4. THE seed data SHALL include varied attendance and marks values across the sample students so that dashboard, leaderboard, analytics, and heatmap screens display non-uniform results.

### Requirement 22: Deployment Configuration

**User Story:** As a Teacher, I want clear deployment configuration for Cloudflare Pages, so that I can publish the application with the correct settings.

#### Acceptance Criteria

1. THE System SHALL build as a static Vite bundle suitable for Cloudflare Pages hosting.
2. THE System SHALL document the build command and the output directory required by Cloudflare Pages.
3. THE System SHALL document the Supabase and Cloudinary environment variables required for deployment and the procedure to configure them in Cloudflare Pages.
4. THE System SHALL read deployment configuration values from environment variables at build time rather than hard-coded values.
