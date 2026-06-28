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
