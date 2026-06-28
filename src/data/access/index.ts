/**
 * Public entry point for the Supabase data-access wrappers (task 16.2).
 *
 * Each wrapper binds a pure domain service to Supabase using only the
 * parameterized query builder and the `SECURITY DEFINER` DB functions
 * (Requirement 17.4): the roster, attendance, syllabus, marks, quiz,
 * assignment, leaderboard, analytics, heatmap, and timetable services.
 */

export * from './support';
export * from './rows';
export * from './parsers';

export * from './sectionsAccess';
export * from './rosterAccess';
export * from './rosterImportAccess';
export * from './authService';
export * from './attendanceAccess';
export * from './syllabusAccess';
export * from './marksAccess';
export * from './quizAccess';
export * from './assignmentAccess';
export * from './leaderboardAccess';
export * from './analyticsAccess';
export * from './heatmapAccess';
export * from './timetableAccess';
