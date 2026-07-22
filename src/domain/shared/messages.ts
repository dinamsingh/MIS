/**
 * Centralized English message catalog (Requirement 20.1: all UI text in
 * professional English). Every validation message, error message, and
 * empty-state string the application surfaces is sourced from here so the
 * "in English" requirement is satisfied consistently in one place.
 *
 * Grouped by concern. Some entries are functions where the message embeds a
 * dynamic value (e.g. a configured maximum or size limit).
 */
export const messages = {
  /** User-correctable validation failures, surfaced inline next to fields. */
  validation: {
    enrollmentNumberInvalid:
      'Enter a valid enrollment number: four digits, two uppercase letters, then six digits (for example, 0131CS241000).',
    markValueOutOfRange: (max: number) =>
      `Enter a value between 0 and ${max}.`,
    fileTypeNotAllowed: 'This file type is not allowed. Choose a supported file type.',
    fileTooLarge: (maxMb: number) =>
      `This file exceeds the maximum size of ${maxMb} MB. Choose a smaller file.`,
    required: 'This field is required.',
    invalidFormat: 'The value entered is not in the expected format.',
  },

  /** Authentication and access errors. */
  auth: {
    invalidCredentials: 'The email or password you entered is incorrect.',
    notRegistered:
      'This account is not registered for this quiz. Contact your teacher to be added to the roster.',
    alreadyAttempted: 'You have already submitted an attempt for this quiz.',
    sessionExpired: 'Your session has expired. Please sign in again.',
    notAuthorized: 'You are not authorized to view this content.',
    /**
     * Shown whenever a signed-in identity resolves to a non-teacher role
     * (`get_my_role()` = 'none') and is redirected back to the sign-in page —
     * whether they arrived by entering an unapproved email directly on the
     * sign-in page, or by ending up authenticated via some other route (e.g.
     * a student who accidentally reached a teacher-only page after signing
     * in). Deliberately worded to match the existing database trigger error
     * (`enforce_teacher_eligibility`, migration 0027) shown when onboarding
     * save is rejected, so the same underlying rule reads consistently
     * wherever it surfaces.
     */
    notApprovedTeacher:
      'This email is not on the approved teacher list. Ask an existing teacher or the admin to add it.',
  },

  /** Feature-flag locked states (Requirement 15.2). */
  features: {
    locked: 'Locked — unlock later',
  },

  /** CSV roster import: per-row rejection reasons and surface-level feedback. */
  rosterImport: {
    invalidEnrollment:
      'The enrollment number is not in the expected format (four digits, two uppercase letters, then six alphanumeric characters).',
    missingName: 'The student name is missing.',
    duplicate: 'A duplicate enrollment number appears earlier in this file.',
    malformed: 'This line is not in the expected "enrollment,name" format.',
    noValidRows: 'No valid rows were found to import. Review the rejected rows and try again.',
    sectionRequired: 'Select a section before importing.',
    importSucceeded: (count: number) =>
      `Imported ${count} student${count === 1 ? '' : 's'} successfully. The section roster has been replaced.`,
    importFailed: 'Could not import the roster. No changes were made. Please try again.',
    /**
     * Admin-only bulk import (admin-console-and-scheduling-upgrade,
     * Requirement 6.1/6.2): shown for a row that parsed successfully but is
     * missing the admin-required email. `missingEmail` rows (`ParsedRosterRow`)
     * carry no source line number — only an enrollment number, name, and null
     * email — so the row is identified by its enrollment number instead.
     */
    missingEmail: (enrollmentNumber: string) =>
      `Row ${enrollmentNumber}: this row is missing an email address, which is required for admin roster import.`,
  },

  /** Friendly empty states rendered instead of errors when data is absent. */
  emptyState: {
    noStudents: 'No students yet. Add students to get started.',
    noAttendance: 'No attendance recorded yet.',
    noTopics: 'No topics defined yet. Add topics to track progress.',
    noMarks: 'No marks recorded yet.',
    noQuizAttempts: 'No attempts yet.',
    noMaterial: 'No study material uploaded yet.',
    insufficientChartData: 'Not enough data to display this chart yet.',
    noClassesToday: 'No classes scheduled for today.',
    noDefaulters: 'No defaulters. Every student is above the attendance threshold.',
    allStudentsGood: 'All students are above the performance threshold.',
  },

  /** Admin Console: teacher-allowlist / admin management feedback (admin-console-and-scheduling-upgrade). */
  admin: {
    emailRequired: 'Enter an email address to add.',
    addEmailFailed: 'Could not add this email. Please try again.',
    removeEmailFailed: 'Could not remove this email. Please try again.',
    /**
     * Shown inline when `remove_admin()` returns `{status: 'denied', reason:
     * 'last-admin'}` — the caller attempted to remove the sole remaining row
     * in `public.admins`. Mirrors the wording of the database-level
     * `protect_last_admin()` trigger (migration 0043) so the same underlying
     * rule reads consistently wherever it surfaces.
     */
    lastAdminProtected:
      'At least one admin must always remain. You cannot remove the last remaining admin.',
    /** Shown when `createTeacherAccount()` fails for a reason other than already-exists/denied. */
    createAccountFailed: 'Could not create the teacher account. Please try again.',
    /** Shown when `createTeacherAccount()` returns `already-exists` (409). */
    accountAlreadyExists: 'A user with this email already exists.',
    /** Shown briefly after the "Copy" button on the one-time temporary password succeeds. */
    passwordCopied: 'Password copied to clipboard.',
    /**
     * Shown inline on `AdminSessionCreationPage` (task 12.1) when
     * `create_session()` returns `{status: 'denied', reason: 'duplicate-
     * batch-code'}` — the submitted batch code already exists in
     * `public.batches`. Distinct from `createSessionFailed` so the admin
     * can tell "this exact conflict" apart from any other failure
     * (Requirement 5.5).
     */
    duplicateBatchCode: 'A batch with this code already exists. Choose a different batch code.',
    /** Shown when `create_session()` fails for a reason other than a duplicate batch code. */
    createSessionFailed: 'Could not create this session. Please try again.',
    /** Shown when the batch code does not follow the expected "YYYY-YY" convention. */
    invalidBatchCode: 'Enter a batch code in the "YYYY-YY" format, for example 2026-30.',
    /**
     * Shown in the confirmation dialog when an admin attempts to permanently
     * delete a student. States the destructive/FK-breaking risk so the admin
     * can make an informed decision (Requirement 8.4).
     */
    permanentDeleteWarning:
      'This action is irreversible. Permanently deleting this student will remove their record entirely and may break historical foreign-key references in attendance, marks, and quiz-attempt data. This cannot be undone.',
  },

  /**
   * Stale-assignment teacher notification (admin-console-and-scheduling-upgrade,
   * Requirement 11.4/11.5): shown as a dashboard/profile banner when one or
   * more of the teacher's own batches has been promoted past the semester
   * their current assignment was made for. Directs the teacher to the
   * self-service "My Teaching Subjects" editor — no admin-driven
   * auto-reassignment exists.
   */
  teacherAssignment: {
    staleAssignmentBanner: (batchLabels: readonly string[]) =>
      `The following batch${batchLabels.length === 1 ? '' : 'es'} moved to a new semester: ${batchLabels.join(', ')}. Re-select your subjects for the new semester in My Teaching Subjects.`,
    /**
     * Shown when a `teacher_assignments` insert violates the
     * `teacher_assignments_subject_section_batch_unique` database constraint
     * (admin-console-and-scheduling-upgrade, Requirement 9.1/9.3): another
     * teacher has already claimed this exact subject+section+batch
     * combination. Deliberately does not name the other teacher.
     */
    duplicateClaim:
      'This subject and section combination has already been claimed by another teacher. Contact your admin if you believe this is an error.',
  },

  /**
   * Onboarding forced-password-reset step, shown to a teacher whose account
   * was auto-created by an admin (`teachers.must_reset_password = true`).
   */
  onboardingPassword: {
    passwordTooShort: 'Password must be at least 8 characters long.',
    passwordsDoNotMatch: 'Passwords do not match.',
    passwordUpdateFailed: 'Could not update your password. Please try again.',
  },

  /** Timetable module messages (admin-console-and-scheduling-upgrade, Phase 4). */
  timetable: {
    /**
     * Shown immediately before save when the teacher selects non-consecutive
     * periods for a lab/multi-period span entry (Requirement 14.3).
     */
    periodsNotConsecutive:
      'The selected periods must be consecutive. Choose periods that follow each other without gaps.',
    /**
     * Shown inline when `confirm_timetable` returns `{status:'denied',
     * reason:'conflict', ...}` — the teacher's schedule has a conflicting
     * entry on the same day and overlapping period range across batches/sections.
     * Parameters identify the conflicting slot so the teacher can resolve it
     * (Requirements 16.4, 18.3).
     */
    conflict: (day: string, period: string, batch: string, section: string, subject: string) =>
      `Schedule conflict on ${day} at ${period}: ${subject} in ${section} (${batch}) overlaps with another entry. Resolve the conflict before confirming.`,
  },

  /** Admin dashboard and batch promotion messages. */
  adminDashboard: {
    title: 'Admin Dashboard',
    description: 'Overview of your institution at a glance.',
    totalTeachers: 'Total Teachers',
    totalStudents: 'Total Students',
    totalSections: 'Total Sections',
    totalBatches: 'Total Batches',
    loadFailed: 'Could not load dashboard data. Please try again.',
  },

  /** Batch promotion messages. */
  batchPromotion: {
    title: 'Batch Promotion',
    description: 'Advance batches to their next semester or mark as graduated.',
    promoteSuccess: (batchId: string, newSem: number) =>
      `Batch ${batchId} promoted to semester ${newSem}.`,
    graduateSuccess: (batchId: string) =>
      `Batch ${batchId} is now graduated.`,
    promoteFailed: 'Could not promote this batch. Please try again.',
    confirmPromote: (batchId: string, currentSem: number) =>
      `Promote batch ${batchId} from semester ${currentSem} to semester ${currentSem + 1}?`,
    confirmGraduate: (batchId: string) =>
      `Mark batch ${batchId} as graduated? This cannot be undone.`,
    noBatches: 'No batches found.',
  },

  /** Generic infrastructure/error feedback. */
  error: {
    generic: 'Something went wrong. Please try again.',
    network: 'Unable to reach the server. Check your connection and try again.',
    saveFailed: 'Could not save your changes. Please try again.',
  },
} as const;

/** The shape of the message catalog, for typing helpers that consume it. */
export type MessageCatalog = typeof messages;
