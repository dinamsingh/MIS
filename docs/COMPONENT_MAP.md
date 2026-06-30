# Component Map

Audit date: 2026-06-30

Scope: exported/shared UI components under `src/presentation`, plus screen-level views that function as reusable pure UI modules. Private helper components inside view files are noted separately where relevant.

## Layout

| Component | File | Purpose |
| --- | --- | --- |
| `AppLayout` | `src/presentation/components/AppLayout.tsx` | Main teacher shell with desktop sidebar, mobile drawer, topbar, global section selector, and content area. |
| `TeacherShell` | `src/presentation/App.tsx` | Route-level composition of teacher guard, selected-section provider, layout, and outlet. Private to router file. |
| `RootRedirect` | `src/presentation/App.tsx` | Root/catch-all redirect based on auth state. Private to router file. |
| `SignInRoute` | `src/presentation/App.tsx` | Sign-in route wrapper that redirects already-authenticated teachers. Private to router file. |

Screen-level layout views:

- `DashboardView`
- `AnalyticsView`
- `AttendanceView`
- `AssignmentView`
- `HeatmapView`
- `LeaderboardView`
- `MarksCalculatorView`
- `MaterialView`
- `QuizCreationView`
- `QuizAttemptView`
- `RosterView`
- `StudentQuizAccessView`
- `SyllabusTrackerView`
- `TeacherSignInView`
- `TimetableView`
- `LockedFeatureView`

## Navigation

| Component/module | File | Purpose |
| --- | --- | --- |
| `Sidebar` | `src/presentation/components/Sidebar.tsx` | Primary grouped navigation with active state, badges, locked AI state, teacher footer, and logout button. |
| `navGroups` | `src/presentation/navigation.ts` | Navigation data model consumed by `Sidebar`. |
| Global section selector | `src/presentation/components/AppLayout.tsx` | Database-driven section switcher in the topbar. It consumes `useSelectedSection`. |
| Month navigation controls | `src/presentation/views/HeatmapView.tsx` | View-local previous/next month UI. |

## Forms

Shared form component inventory is currently thin. Most forms are implemented directly inside screen views.

| Component/view | File | Purpose |
| --- | --- | --- |
| `TeacherSignInView` | `src/presentation/views/TeacherSignInView.tsx` | Teacher email/password sign-in UI. |
| `RosterView` | `src/presentation/views/RosterView.tsx` | CSV upload/paste, section selection, preview, and rejected row list UI. |
| `AttendanceView` | `src/presentation/views/AttendanceView.tsx` | Attendance date/period controls and attendance marking UI. |
| `SyllabusTrackerView` | `src/presentation/views/SyllabusTrackerView.tsx` | Unit/topic creation and completion controls. |
| `MarksCalculatorView` | `src/presentation/views/MarksCalculatorView.tsx` | Mark component and mark value editing UI. |
| `QuizCreationView` | `src/presentation/views/QuizCreationView.tsx` | Quiz creation form and question entry UI. |
| `AssignmentView` | `src/presentation/views/AssignmentView.tsx` | Assignment/lab manual submission tracker controls. |
| `MaterialView` | `src/presentation/views/MaterialView.tsx` | Study material upload/list UI. |
| `LeaderboardView` | `src/presentation/views/LeaderboardView.tsx` | Leaderboard weight settings. |
| `StudentQuizAccessView` | `src/presentation/views/StudentQuizAccessView.tsx` | Student enrollment and access flow. |
| `QuizAttemptView` | `src/presentation/views/QuizAttemptView.tsx` | Student answer selection and submission UI. |

View-local form helpers:

- `TopicRow` in `SyllabusTrackerView.tsx`
- `UnitCard` in `SyllabusTrackerView.tsx`
- `RejectedRowList` in `RosterView.tsx`

## Tables

| Component/view | File | Purpose |
| --- | --- | --- |
| `TableSkeleton` | `src/presentation/components/skeletons/TableSkeleton.tsx` | Reusable table loading placeholder. |
| `AttendanceView` | `src/presentation/views/AttendanceView.tsx` | Student attendance table/grid behavior. |
| `MarksCalculatorView` | `src/presentation/views/MarksCalculatorView.tsx` | Marks table-style input grid. |
| `LeaderboardView` | `src/presentation/views/LeaderboardView.tsx` | Ranked student metric table. |
| `RosterView` | `src/presentation/views/RosterView.tsx` | Roster import preview and rejected rows. |
| `AssignmentView` | `src/presentation/views/AssignmentView.tsx` | Assignment/lab manual tracker grids. |

Private table/grid helpers:

- `AssignmentTrackerGrid` in `AssignmentView.tsx`
- `LabManualTrackerGrid` in `AssignmentView.tsx`

## Cards

| Component/view | File | Purpose |
| --- | --- | --- |
| `.card` class | `src/index.css` | Shared card surface utility. |
| `CardGridSkeleton` | `src/presentation/components/skeletons/CardGridSkeleton.tsx` | Loading placeholder for card grids. |
| `DashboardView` private `StatCard` | `src/presentation/views/DashboardView.tsx` | Dashboard metric card. Private to view. |
| `StudentQuizAccessView` private `AccessCard` | `src/presentation/views/StudentQuizAccessView.tsx` | Student quiz access card. Private to view. |
| `SyllabusTrackerView` private `UnitCard` | `src/presentation/views/SyllabusTrackerView.tsx` | Syllabus unit/topic card. Private to view. |
| `MaterialView` | `src/presentation/views/MaterialView.tsx` | Material items are presented as cards. |
| `AssignmentView` | `src/presentation/views/AssignmentView.tsx` | Assignment/lab manual content uses card-like sections. |
| `LockedFeatureView` | `src/presentation/views/LockedFeatureView.tsx` | Locked AI feature placeholder card/surface. |

## Charts

| Component/view | File | Purpose |
| --- | --- | --- |
| `ChartSkeleton` | `src/presentation/components/skeletons/ChartSkeleton.tsx` | Reusable analytics chart loading placeholder. |
| `DashboardView` private `AttendanceBarChart` | `src/presentation/views/DashboardView.tsx` | Inline SVG attendance trend chart. Private to view. |
| `AnalyticsView` private `UnitQuizScoreChart` | `src/presentation/views/AnalyticsView.tsx` | Inline SVG unit quiz score chart. Private to view. |
| `AnalyticsView` private `GradeDistributionChart` | `src/presentation/views/AnalyticsView.tsx` | Inline SVG donut chart. Private to view. |
| `HeatmapView` | `src/presentation/views/HeatmapView.tsx` | Calendar-style attendance heatmap. |

No external chart component library is currently installed.

## Dialogs

No shared dialog/modal component was found.

Current dialog-like or confirmation behavior appears to be implemented locally inside views where needed. There is no shared Dialog, AlertDialog, Sheet, Popover, DropdownMenu, or Toast component.

## Utilities

UI-adjacent reusable utilities:

| Utility | File | Purpose |
| --- | --- | --- |
| `SharedAcrossSectionsNotice` | `src/presentation/components/SharedAcrossSectionsNotice.tsx` | Reusable info banner for subject-scoped items shared across sections. |
| `formatSectionLabel` | `src/presentation/format/sectionLabel.ts` | Formats section labels with department, batch, semester, and section name. |
| `useDataCache` | `src/presentation/hooks/useDataCache.ts` | Stale-while-revalidate data cache hook. |
| `clearCache` | `src/presentation/hooks/useDataCache.ts` | Clears all or one data cache entry. |
| `AuthProvider` | `src/presentation/auth/AuthContext.tsx` | Auth state provider. |
| `useAuth` | `src/presentation/auth/AuthContext.tsx` | Auth context hook. |
| `RequireTeacher` | `src/presentation/auth/RequireTeacher.tsx` | Teacher-only route guard. |
| `SelectedSectionProvider` | `src/presentation/context/SelectedSectionContext.tsx` | Global selected section provider. |
| `useSelectedSection` | `src/presentation/context/SelectedSectionContext.tsx` | Global selected section hook. |

View-local utility badges:

- `RiskBadge` in `DashboardView.tsx`
- `ClassStatusBadge` in `DashboardView.tsx`

## Skeletons

| Component | File | Purpose |
| --- | --- | --- |
| `SkeletonPulse` | `src/presentation/components/skeletons/SkeletonPulse.tsx` | Generic animated skeleton block. |
| `DashboardSkeleton` | `src/presentation/components/skeletons/DashboardSkeleton.tsx` | Dashboard loading state. |
| `TableSkeleton` | `src/presentation/components/skeletons/TableSkeleton.tsx` | Generic table loading state. |
| `CardGridSkeleton` | `src/presentation/components/skeletons/CardGridSkeleton.tsx` | Card grid loading state. |
| `ChartSkeleton` | `src/presentation/components/skeletons/ChartSkeleton.tsx` | Analytics chart loading state. |
| `CalendarSkeleton` | `src/presentation/components/skeletons/CalendarSkeleton.tsx` | Calendar/heatmap loading state. |
| `FormSkeleton` | `src/presentation/components/skeletons/FormSkeleton.tsx` | Form-heavy page loading state. |
| skeleton barrel | `src/presentation/components/skeletons/index.ts` | Exports all skeleton components. |

## Loading

| Component | File | Purpose |
| --- | --- | --- |
| `PageLoader` | `src/presentation/components/PageLoader.tsx` | Full-page spinner used as lazy route `Suspense` fallback. |
| `DashboardSkeleton` | `src/presentation/components/skeletons/DashboardSkeleton.tsx` | Loading state for dashboard. |
| `TableSkeleton` | `src/presentation/components/skeletons/TableSkeleton.tsx` | Loading state for table-heavy pages. |
| `CardGridSkeleton` | `src/presentation/components/skeletons/CardGridSkeleton.tsx` | Loading state for material/assignment-style cards. |
| `ChartSkeleton` | `src/presentation/components/skeletons/ChartSkeleton.tsx` | Loading state for chart pages. |
| `CalendarSkeleton` | `src/presentation/components/skeletons/CalendarSkeleton.tsx` | Loading state for heatmap/calendar UI. |
| `FormSkeleton` | `src/presentation/components/skeletons/FormSkeleton.tsx` | Loading state for form-heavy pages. |

