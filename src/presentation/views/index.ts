/**
 * Public entry point for presentation-layer views.
 *
 * Task 17.2 contributes the authentication-facing views: the teacher sign-in
 * surface and the student quiz access / enrollment flow reached via a
 * shareable link.
 */

export { default as TeacherSignInView, type TeacherSignInViewProps } from './TeacherSignInView';
export {
  default as StudentQuizAccessView,
  type StudentQuizAccessViewProps,
  type ResolveQuizAccess,
} from './StudentQuizAccessView';
export {
  default as TimetableView,
  type TimetableViewProps,
  type TimetableViewAccess,
  type SectionOption,
  type SubjectOption,
} from './TimetableView';
export {
  default as SyllabusTrackerView,
  type SyllabusTrackerViewProps,
  type SyllabusSubject,
} from './SyllabusTrackerView';
export {
  default as AttendanceView,
  type AttendanceViewProps,
  type AttendanceOption,
  type AttendancePersistence,
  type RosterStudent,
  type LoadRoster,
} from './AttendanceView';
export {
  default as QuizCreationView,
  type QuizCreationViewProps,
  type QuizCreationRepository,
  type QuizUnitOption,
  DEFAULT_TIME_LIMIT_MINUTES,
  DEFAULT_QUESTION_MARKS,
} from './QuizCreationView';
export {
  default as MarksCalculatorView,
  type MarksCalculatorViewProps,
  type MarksStudent,
} from './MarksCalculatorView';
export {
  default as HeatmapView,
  type HeatmapViewProps,
  type HeatmapPersistence,
  type HeatmapSectionOption,
  type HeatmapStudent,
  type LoadStudents as LoadHeatmapStudents,
} from './HeatmapView';
export {
  default as DashboardView,
  type DashboardViewProps,
  type DashboardDataProvider,
  type DashboardSummary,
  type AttendanceTrendPoint,
} from './DashboardView';
export {
  default as QuizAttemptView,
  type QuizAttemptViewProps,
  type SubmitAttemptFn,
} from './QuizAttemptView';
export {
  default as AssignmentView,
  type AssignmentViewProps,
  type AssignmentViewAccess,
  type AssignmentSubjectOption,
  type AssignmentUnitOption,
  type AssignmentStudent,
  type AssignmentListItem,
  type UploadedAssignmentFile,
} from './AssignmentView';
export {
  default as MaterialView,
  type MaterialViewProps,
  type MaterialPersistence,
  type MaterialItem,
} from './MaterialView';
export {
  default as AnalyticsView,
  type AnalyticsViewProps,
  type AnalyticsDataProvider,
  type AnalyticsStudent,
} from './AnalyticsView';
export {
  default as LeaderboardView,
  type LeaderboardViewProps,
  type LeaderboardPersistence,
  type LeaderboardConfig,
} from './LeaderboardView';
export {
  default as LockedFeatureView,
  type LockedFeatureViewProps,
} from './LockedFeatureView';
