# Graph Report - MIS 1  (2026-09-06)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 3391 nodes · 6976 edges · 256 communities (142 shown, 75 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 461 edges (avg confidence: 0.85)
- Token cost: 9,154 input · 3,007 output

## Graph Freshness
- Built from commit: `c5cc4512`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Auth and Prompt Utilities
- Worker Function Utilities
- WebAuthn and Passkey Management
- Authentication and Token Refresh
- Socket Connection Management
- Attendance View Logic
- Connection and Heartbeat Management
- Admin Access Control Components
- JWT and Base64 Utilities
- Realtime Connection State
- AI Quiz Generation Service
- Channel Communication Logic
- Admin and App Layouts
- Fetch API Facade
- Teacher Schedule Management
- Teaching History Administration
- Storage Bucket Operations
- Supabase Session Access
- String and Data Helpers
- Quiz Attempt Data Access
- File Storage and Indexing
- Binary Protocol Encoding
- Network Request Decoding
- Admin and Quiz Pages
- Authentication Context Provider
- Local Demo Mode Data
- Cloudinary Storage Configuration
- Onboarding Wizard Components
- Attendance Data Access
- Marks and Roster Access
- Onboarding State Management
- Attendance Heatmap Service
- Quiz Creation Interface
- Authentication Service Logic
- File Upload and Marks Service
- Admin Console Testing
- Syllabus and Unit Access
- Academic Structure Components
- Database Schema Definitions
- Input Validation Schemas
- Dashboard Charts and Widgets
- Teacher Management Views
- App TypeScript Configuration
- Roster Import Access
- Form UI Components
- Roster and Enrollment Service
- Data Display UI Components
- Assignment and Lab Access
- Database Migration Schema
- Project Package Configuration
- Quiz Repository Interface
- Leaderboard Configuration Access
- App Routing Tests
- Analytics and Threshold Access
- UI Loading Skeletons
- Feedback and Foundation UI
- Quiz Attempt Views
- Overlay and Dialog Components
- Assignment Sharing Management
- Assignment Grid View
- Quiz Data Parsers
- Development Dependencies
- Attendance and Heatmap Access
- Node TypeScript Configuration
- Supabase Client Configuration
- Quiz Grading Service
- Dashboard Data Provider
- Quick Attendance Logic
- Subject and Batch Options
- OAuth and Session Handling
- Admin Teacher Management
- Teacher Profile and Sidebar
- Academic Session Onboarding
- Navigation and Loading UI
- Data Table Components
- UI Motion and Animations
- Database Migration Testing
- Demo Data Generators
- Auth and Theme Components
- Analytics Dashboard View
- Channel Subscription Management
- Teacher Assignment Database
- Dashboard Page Logic
- Course Material Management
- Admin Role Database
- Attendance Reporting View
- Assignment Page Access
- Attendance Heatmap View
- Marks Calculator Interface
- Frontend Dependencies
- Teacher Eligibility Database
- AI Quiz Generator UI
- Onboarding Integration Tests
- Demo Assignment Storage
- Demo Data Persistence
- Admin Dashboard and Roster
- Attendance Page Logic
- Async Helper Functions
- Async Step Functions
- Demo Store Defaults
- Quiz Attempt Management
- Chart UI Components
- Data Caching Hooks
- Student Roster Loading
- Theme Preference Management
- Leaderboard View
- Syllabus Progress Tracker
- Timetable Editor Actions
- Academic Audit PDF
- Teacher Permissions Management
- Quiz and Enrollment Updates
- Section Selection Context
- Syllabus Upload Admin
- Student Quiz Access
- Teaching History View
- NPM Build Scripts
- Marks Management Access
- Attendance Date Selection
- Syllabus Unit Options
- Timetable Conflict Management
- Assignment and Syllabus Schema
- Audit Log Triggers
- Quiz Submission Functions
- Onboarding Schema
- Quiz Privacy and Roster
- Middleware Loader Facade
- Middleware Loader Facade
- Vite Configuration
- Timetable Demo Access
- Attendance Demo Storage
- Syllabus Progress Schema
- Quiz Self-Registration
- Quiz Roster Options
- Quiz Submission Errors
- Teacher Quiz Controls
- Quiz Access Hardening
- Roster Management Page
- Theme Migration Script
- Theme Migration Script
- Theme Migration Script
- Luma Access Script
- Quiz Demo Utilities
- Quiz Access Errors
- User Role RPC
- Timetable Status Schema
- Admin Navigation Config
- Attendance Tab UI
- App Navigation Config
- Theme Migration Script
- Code Fix Utility
- PDF Text Extraction
- Date Utility Functions
- Teacher Identity Schema
- Quiz Window Access
- Token-Based Quiz Access
- Reset Quiz Attempt
- Quiz Session Reset
- Onboarding Status Gate
- Shared Section Notice
- Vite Environment Types
- TypeScript Configuration
- UI Update Script
- Periods Catalog Schema
- Wrangler Middleware Facade
- Wrangler Middleware Facade
- Function Route Definitions
- Audit Log Table
- Assignment Submissions Table
- Assignments Table
- Attendance Table
- Files Table
- Lab Submissions Table
- Leaderboard Config Table
- Mark Components Table
- Mark Values Table
- Questions Table
- Quiz Attempts Table
- Quizzes Table
- Sections Table
- Settings Table
- Student Roster Table
- Students Table
- Subjects Table
- Timetable Management
- Topic Definitions
- Unit Definitions
- File Storage
- Section Management
- Student Roster
- Student Records
- Assignment Submissions
- Assignment Management
- Attendance Tracking
- File Management
- Lab Manual Submissions
- Leaderboard Configuration
- Grading Components
- Grade Values
- Question Bank
- Quiz Management
- System Settings
- Subject Definitions
- Timetable Entries
- Topic Management
- Unit Management
- Quiz Records
- Syllabus Subjects
- Quiz Data
- Attendance Records
- Submission Records
- Assignment Data
- Lab Submissions
- Assessment Questions
- Quiz Definitions
- Quiz Entities
- Teacher Records
- Schedule Entries

## God Nodes (most connected - your core abstractions)
1. `react` - 82 edges
2. `isAuthError()` - 76 edges
3. `isAuthError()` - 76 edges
4. `constructor()` - 59 edges
5. `constructor()` - 59 edges
6. `cx()` - 52 edges
7. `_returnResult()` - 48 edges
8. `_returnResult()` - 48 edges
9. `vitest` - 41 edges
10. `push()` - 40 edges

## Surprising Connections (you probably didn't know these)
- `decode()` --indirect_call--> `topic()`  [INFERRED]
  .wrangler/tmp/dev-d1kfTq/functionsWorker-0.4121441139779921.js → src/domain/services/syllabusService.test.ts
- `channel()` --indirect_call--> `topic()`  [INFERRED]
  .wrangler/tmp/pages-PMPjkT/functionsWorker-0.4121441139779921.mjs → src/domain/services/syllabusService.test.ts
- `constructor()` --indirect_call--> `topic()`  [INFERRED]
  .wrangler/tmp/pages-PMPjkT/functionsWorker-0.4121441139779921.mjs → src/domain/services/syllabusService.test.ts
- `decode()` --indirect_call--> `topic()`  [INFERRED]
  .wrangler/tmp/pages-PMPjkT/functionsWorker-0.4121441139779921.mjs → src/domain/services/syllabusService.test.ts
- `setHeader()` --indirect_call--> `result()`  [INFERRED]
  .wrangler/tmp/dev-d1kfTq/functionsWorker-0.4121441139779921.js → src/domain/services/quizService.test.ts

## Import Cycles
- None detected.

## Communities (256 total, 75 thin omitted)

### Community 0 - "Auth and Prompt Utilities"
Cohesion: 0.02
Nodes (103): RFC-6749, IMPORTANT:, binaryEncode(), _binaryEncodeUserBroadcastPush(), buildQuizPrompt(), buildSyllabusExtractionPrompt(), bytesToBase64URL(), byteToBase64URL() (+95 more)

### Community 1 - "Worker Function Utilities"
Cohesion: 0.02
Nodes (98): asRecord(), buildQuizPrompt(), buildSyllabusExtractionPrompt(), clampQuestionCount(), cloneRequestState(), codepointToUTF8(), containedBy(), contains() (+90 more)

### Community 2 - "WebAuthn and Passkey Management"
Cohesion: 0.04
Nodes (122): abortSignal(), _acquireLock(), _adminDeletePasskey(), _adminListPasskeys(), _approveAuthorization(), assertPasskeyExperimentalEnabled(), _authenticate(), _autoRefreshTokenTick() (+114 more)

### Community 3 - "Authentication and Token Refresh"
Cohesion: 0.05
Nodes (115): abortSignal(), _acquireLock(), _adminDeletePasskey(), _adminListPasskeys(), _approveAuthorization(), assertPasskeyExperimentalEnabled(), _authenticate(), browserSupportsWebAuthn() (+107 more)

### Community 4 - "Socket Connection Management"
Cohesion: 0.04
Nodes (61): ajax(), applySettingDefaults(), batchSend(), canPush(), channel(), clone(), cloneState(), close() (+53 more)

### Community 5 - "Attendance View Logic"
Cohesion: 0.05
Nodes (43): addDays(), AttendanceOption, AttendancePeriodMeta, AttendancePersistence, AttendanceRangeReportResult, AttendanceRangeReportRow, AttendanceSectionOption, AttendanceTableRow (+35 more)

### Community 6 - "Connection and Heartbeat Management"
Cohesion: 0.07
Nodes (58): _cancelPendingDisconnect(), clearHeartbeats(), connect(), connectionState(), connectWithFallback(), deleteBucket(), disconnect(), filterBindings() (+50 more)

### Community 7 - "Admin Access Control Components"
Cohesion: 0.05
Nodes (23): react, react-router-dom, RequireAdminProps, BatchRow, PromoteResult, analyticsAccess, createLocalHeatmap(), HeatmapPage() (+15 more)

### Community 8 - "JWT and Base64 Utilities"
Cohesion: 0.06
Nodes (51): asRecord2(), base64UrlToUint8Array(), byteFromBase64URL(), cancelRefEvent(), cancelTimeout(), canPush(), cleanName(), connectWithFallback() (+43 more)

### Community 9 - "Realtime Connection State"
Cohesion: 0.08
Nodes (48): _cancelPendingDisconnect(), clearHeartbeats(), connect(), connectionState(), disconnect(), flushSendBuffer(), _handleNodeJsRaceCondition(), hasLogger() (+40 more)

### Community 10 - "AI Quiz Generation Service"
Cohesion: 0.09
Nodes (39): allowedOrigin(), Env, json(), onRequestOptions(), onRequestPost(), allowedOrigin(), Env, json() (+31 more)

### Community 11 - "Channel Communication Logic"
Cohesion: 0.06
Nodes (41): topic(), ajax(), applySettingDefaults(), batchSend(), channel(), clone(), cloneState(), close() (+33 more)

### Community 12 - "Admin and App Layouts"
Cohesion: 0.07
Nodes (38): framer-motion, AdminLayout(), AdminLayoutProps, formatHeaderDate(), formatHeaderTime(), nameFromEmail(), AppLayout(), AppLayoutProps (+30 more)

### Community 13 - "Fetch API Facade"
Cohesion: 0.06
Nodes (44): catch(), createFetchApi(), createNamespace(), createNamespaceIfNotExists(), createSiweMessage(), dispose(), endPoint(), executeRequest() (+36 more)

### Community 14 - "Teacher Schedule Management"
Cohesion: 0.07
Nodes (28): fetchMySchedule(), formatScheduleCellLabel(), MAX_SUBJECT_NAME_LENGTH, MyScheduleCell, requireTeacherId(), resolveSectionId(), SectionRow, SyllabusSubjectRow (+20 more)

### Community 15 - "Teaching History Administration"
Cohesion: 0.08
Nodes (31): allowedOrigin(), Env, json(), onRequestOptions(), onRequestPost(), fast-check, aggregateCounts(), BatchRow (+23 more)

### Community 16 - "Storage Bucket Operations"
Cohesion: 0.08
Nodes (41): applyTransformOptsToQuery(), copy(), createBucket(), createIndex(), createSignedUploadUrl(), createSignedUrl(), createSignedUrls(), deleteBucket() (+33 more)

### Community 17 - "Supabase Session Access"
Cohesion: 0.08
Nodes (24): @supabase/supabase-js, AdminSessionAccess, CreateSessionInput, CreateSessionResult, AssignmentInput, InsertedId, SlotRow, SlotSubmissionRow (+16 more)

### Community 18 - "String and Data Helpers"
Cohesion: 0.07
Nodes (39): arrayToRegexp(), asRecord(), asRecord2(), base64UrlToUint8Array(), byteFromBase64URL(), cancelRefEvent(), cancelTimeout(), cleanName() (+31 more)

### Community 19 - "Quiz Attempt Data Access"
Cohesion: 0.07
Nodes (36): asRecord(), AttemptSummary, deriveQuizStatus(), firstJoin(), InsertedId, numericValue(), QuestionInput, QuizAttemptCountRow (+28 more)

### Community 20 - "File Storage and Indexing"
Cohesion: 0.09
Nodes (38): applyTransformOptsToQuery(), copy(), createBucket(), createIndex(), createSignedUploadUrl(), createSignedUrl(), createSignedUrls(), deleteIndex() (+30 more)

### Community 21 - "Binary Protocol Encoding"
Cohesion: 0.07
Nodes (37): result(), appendParams(), arrayToRegexp(), _binaryDecode(), binaryEncode(), _binaryEncodeUserBroadcastPush(), decode(), decodeBroadcast() (+29 more)

### Community 22 - "Network Request Decoding"
Cohesion: 0.07
Nodes (35): appendParams(), _binaryDecode(), catch(), createFetchApi(), decode(), decodeBroadcast(), decodePush(), decodeReply() (+27 more)

### Community 23 - "Admin and Quiz Pages"
Cohesion: 0.06
Nodes (30): AdminBatchPromotionPage, AdminDashboardPage, AdminExtraPowersPage, AdminManageAdminsPage, AdminRosterImportPage, AdminSessionCreationPage, AdminSyllabusUploadPage, AdminTeacherApprovalPage (+22 more)

### Community 24 - "Authentication Context Provider"
Cohesion: 0.09
Nodes (19): ANONYMOUS, AuthContext, AuthContextValue, AuthProvider(), AuthProviderProps, useAuth(), RequireTeacher(), RequireTeacherProps (+11 more)

### Community 25 - "Local Demo Mode Data"
Cohesion: 0.06
Nodes (26): aggregateDemoOverall(), DEMO_DAYS, DEMO_OFF, DEMO_ON, DEMO_SLOTS, DemoAssignmentItem, DemoAssignmentStore, DemoAttendanceStore (+18 more)

### Community 26 - "Cloudinary Storage Configuration"
Cohesion: 0.13
Nodes (25): CLOUDINARY_CLOUD_NAME_ENV, CLOUDINARY_UPLOAD_PRESET_ENV, CloudinaryConfig, CloudinaryConfigError, DEFAULT_SIGNED_URL_TTL_SECONDS, readCloudinaryConfig(), readNonEmpty(), SUPABASE_PRIVATE_BUCKET (+17 more)

### Community 27 - "Onboarding Wizard Components"
Cohesion: 0.14
Nodes (23): BASE_STEPS, PASSWORD_STEP, Stepper(), StepperProps, WizardStep, EMPTY_PROFILE, PasswordStep(), PasswordStepProps (+15 more)

### Community 28 - "Attendance Data Access"
Cohesion: 0.09
Nodes (20): AttendanceAccess, AttendanceMarkedDatesScope, AttendanceMarkedSlotsScope, AttendanceOverallMark, AttendanceOverallRow, AttendanceOverallScope, AttendancePeriodMeta, AttendanceRangeReport (+12 more)

### Community 29 - "Marks and Roster Access"
Cohesion: 0.12
Nodes (24): InsertedId, MarkComponentInput, SaveMarkValuesResult, fromAttendanceMark(), fromAttendanceStatusMark(), fromRosterEntry(), MarkComponentRow, MarkValueRow (+16 more)

### Community 30 - "Onboarding State Management"
Cohesion: 0.12
Nodes (27): assignmentsToSelection(), DEMO_STORAGE_KEY, demoSubjectId(), deriveSections(), EMPTY_RECORD, fetchAllBatches(), fetchCurrentSelection(), fetchOnboardedSections() (+19 more)

### Community 31 - "Attendance Heatmap Service"
Cohesion: 0.11
Nodes (14): AttendanceHeatRow, HeatmapAccess, AttendanceRow, aggregateRangeTallies(), AttendanceCounts, AttendanceMark, AttendanceService, AttendanceStatus (+6 more)

### Community 32 - "Quiz Creation Interface"
Cohesion: 0.09
Nodes (21): ConfirmDialogState, DEFAULT_QUESTION_MARKS, DEFAULT_TIME_LIMIT_MINUTES, emptyQuestion(), formatDateTime(), formatWindow(), nextQuestionKey(), QuestionDraft (+13 more)

### Community 33 - "Authentication Service Logic"
Cohesion: 0.13
Nodes (12): actorFromSession(), ActorResolutionConfig, AuthService, GoogleSignInOptions, isTeacherUser(), LoginIntent, studentName(), TEACHER_EMAIL_ENV (+4 more)

### Community 34 - "File Upload and Marks Service"
Cohesion: 0.14
Nodes (20): recordFile(), uploadToCloudinary(), FeatureFlag, featureFlags, isFeatureEnabled(), parseBooleanFlag(), computeInternalMarks(), MarkComponent (+12 more)

### Community 35 - "Admin Console Testing"
Cohesion: 0.09
Nodes (19): ADMIN_ACTOR, TABLE_DATA, AdminExtraPowersPage(), ExtraPowerRow, PendingKey, PowerKey, POWERS, TeacherRow (+11 more)

### Community 36 - "Syllabus and Unit Access"
Cohesion: 0.11
Nodes (14): UnitRow, InsertedId, SyllabusAccess, TopicInput, UnitInput, unitProgress(), SyllabusTrackerAccess, TopicRow (+6 more)

### Community 37 - "Academic Structure Components"
Cohesion: 0.13
Nodes (23): BatchRow, SubjectRow, ElectiveGroupRow(), ElectiveGroupRowProps, SectionChips(), SectionChipsProps, groupElectives(), ROMAN (+15 more)

### Community 38 - "Database Schema Definitions"
Cohesion: 0.15
Nodes (21): public.assignment_submissions, public.assignments, public.attendance, public.audit_log, public.files, public.lab_manual_submissions, public.leaderboard_config, public.mark_components (+13 more)

### Community 39 - "Input Validation Schemas"
Cohesion: 0.13
Nodes (18): boolean(), enumValue(), Infer, InferObject, number(), NumberSchemaOptions, object(), ObjectShape (+10 more)

### Community 40 - "Dashboard Charts and Widgets"
Cohesion: 0.09
Nodes (21): AttendanceSVGChart, ChartType, ActivityItem, CalendarWidget, DashboardEmptyState, DashboardStatCard, DashboardStatCardProps, EmptyStateProps (+13 more)

### Community 41 - "Teacher Management Views"
Cohesion: 0.11
Nodes (15): LockedFeatureViewProps, DAY_INDEX_MAP, DAYS, MyScheduleViewProps, Teacher, TeacherManagementViewProps, DAY_INDEX_MAP, DAYS (+7 more)

### Community 42 - "App TypeScript Configuration"
Cohesion: 0.08
Nodes (24): compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules, jsx, lib, module, moduleDetection (+16 more)

### Community 43 - "Roster Import Access"
Cohesion: 0.12
Nodes (19): addSingleStudent(), AdminRosterImportResult, parseAdminRosterCsv(), acceptedRowsArb, enrollmentFieldArb, identifierArb, invalidEnrollmentArb, optionalFieldArb (+11 more)

### Community 44 - "Form UI Components"
Cohesion: 0.13
Nodes (23): Checkbox, ChoiceProps, DatePicker, FieldChrome(), FieldChromeProps, FileUpload(), FileUploadProps, Input (+15 more)

### Community 45 - "Roster and Enrollment Service"
Cohesion: 0.17
Nodes (15): RosterAccess, AttemptResult, createRosterService(), ENROLLMENT_NUMBER_INVALID_CODE, findRosterEntry(), isValidEnrollmentNumber(), QuizAccess, QuizAccessContext (+7 more)

### Community 46 - "Data Display UI Components"
Cohesion: 0.11
Nodes (22): Avatar(), AvatarProps, Badge(), BadgeProps, EmptyStateProps, errorStateCopy, ErrorStateKind, ErrorStateProps (+14 more)

### Community 47 - "Assignment and Lab Access"
Cohesion: 0.14
Nodes (4): AssignmentAccess, AssignmentService, createInMemoryAssignmentService(), SubmissionStatus

### Community 48 - "Database Migration Schema"
Cohesion: 0.21
Nodes (21): public.assignment_submissions, public.assignments, public.attendance, public.audit_log, public.files, public.lab_manual_submissions, public.leaderboard_config, public.mark_components (+13 more)

### Community 49 - "Project Package Configuration"
Cohesion: 0.10
Nodes (19): name, private, type, version, agentation, autoprefixer, jsdom, postcss (+11 more)

### Community 51 - "Leaderboard Configuration Access"
Cohesion: 0.17
Nodes (12): ConfigIdRow, createLeaderboardAccess(), loadConfig(), readConfigRow(), DEFAULT_CONFIG, LeaderboardAccess, LeaderboardConfig, LeaderboardConfigRow (+4 more)

### Community 52 - "App Routing Tests"
Cohesion: 0.10
Nodes (10): App(), currentActor, currentRoles, nonTeacherActorArb, onboardingStatus, PreservationActorKind, PreservationTuple, preservationTupleArb (+2 more)

### Community 53 - "Analytics and Threshold Access"
Cohesion: 0.18
Nodes (13): AnalyticsAccess, createAnalyticsAccess(), readSettingsRow(), InternalMarksRow, SettingsRow, classAverage(), DEFAULT_PERFORMANCE_THRESHOLD, Grade (+5 more)

### Community 54 - "UI Loading Skeletons"
Cohesion: 0.18
Nodes (5): CardGridSkeletonProps, FormSkeletonProps, SkeletonPulse(), SkeletonPulseProps, TableSkeletonProps

### Community 55 - "Feedback and Foundation UI"
Cohesion: 0.14
Nodes (15): Alert(), Toast(), buttonSizeClass, ButtonVariant, buttonVariantClass, CardContent(), CardFooter(), CardProps (+7 more)

### Community 56 - "Quiz Attempt Views"
Cohesion: 0.12
Nodes (14): OtpInput(), OtpInputProps, GetQuizReviewFn, QuizAttemptView(), QuizAttemptViewProps, SubmitAttemptFn, useLocalStorage(), ViewPhase (+6 more)

### Community 57 - "Overlay and Dialog Components"
Cohesion: 0.19
Nodes (17): ConfirmDialogProps, Dialog(), DialogProps, Drawer(), DrawerProps, DropdownMenu(), DropdownMenuItem, DropdownMenuProps (+9 more)

### Community 58 - "Assignment Sharing Management"
Cohesion: 0.20
Nodes (17): ASSIGNMENT_FILE_POLICY, AssignmentSharePage(), handleUpload(), AssignmentShareRow, buildShareMessage(), deleteShareRecord(), fileSizeLabel(), formatDateLabel() (+9 more)

### Community 59 - "Assignment Grid View"
Cohesion: 0.16
Nodes (11): AssignmentGridAccess, AssignmentGridView(), AssignmentGridViewProps, buildCsv(), downloadCsv(), getInitials(), GridSlot, GridStudent (+3 more)

### Community 60 - "Quiz Data Parsers"
Cohesion: 0.22
Nodes (15): asRecord(), parseAttemptResult(), parseAttemptSession(), parseQuizAccess(), parseQuizDeniedReason(), parseQuizPayload(), parseStartAttemptOutcome(), parseSubmitDeniedReason() (+7 more)

### Community 61 - "Development Dependencies"
Cohesion: 0.12
Nodes (17): devDependencies, agentation, autoprefixer, fast-check, jsdom, postcss, tailwindcss, @testing-library/jest-dom (+9 more)

### Community 62 - "Attendance and Heatmap Access"
Cohesion: 0.16
Nodes (16): aggregateOverallRows(), aggregateStatusRangeRows(), createAttendanceAccess(), loadMarkedDates(), loadMarkedSlots(), loadPeriod(), loadPeriodMeta(), loadRangeReport() (+8 more)

### Community 63 - "Node TypeScript Configuration"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+8 more)

### Community 64 - "Supabase Client Configuration"
Cohesion: 0.31
Nodes (11): createSupabaseClient(), createSupabaseClientFromEnv(), describeConfigError(), EnvRecord, readNonEmpty(), readSupabaseConfig(), SUPABASE_ANON_KEY_ENV, SUPABASE_URL_ENV (+3 more)

### Community 65 - "Quiz Grading Service"
Cohesion: 0.23
Nodes (11): attemptKey(), createInMemoryQuizAttemptStore(), gradeAttempt(), gradeAttemptResult(), Question, Quiz, QuizAttemptStore, safeMarks() (+3 more)

### Community 66 - "Dashboard Data Provider"
Cohesion: 0.21
Nodes (10): AttendanceTrendPoint, chartFallback(), DashboardCharts, DashboardDataProvider, DashboardSummary, DashboardView(), DashboardViewProps, daysAgo() (+2 more)

### Community 67 - "Quick Attendance Logic"
Cohesion: 0.24
Nodes (13): applyAbsentList(), applyPresentList(), applyRollList(), lastThree(), parsePresentTokens(), PresentListApplyMode, PresentListApplyOptions, PresentListMatch (+5 more)

### Community 68 - "Subject and Batch Options"
Cohesion: 0.21
Nodes (14): MOCK_BATCHES, AssignmentInput, loadAssignedSyllabusSubjects(), loadSubjectNameMapForSection(), loadSubjectOptionsForSection(), loadSubjectOptionsForSemester(), mergeSubjects(), sectionLetter() (+6 more)

### Community 69 - "OAuth and Session Handling"
Cohesion: 0.23
Nodes (15): _autoRefreshTokenTick(), _debug(), dispose(), _emitInitialSession(), generateCallbackId(), _handleProviderSignIn(), _handleVisibilityChange(), _logPrefix() (+7 more)

### Community 70 - "Admin Teacher Management"
Cohesion: 0.14
Nodes (7): AdminTeacherAccess, AdminTeacherRow, AllowedTeacherEmailDbRow, AllowedTeacherEmailRow, AllowlistRpcResult, CreateTeacherAccountResult, TeacherDbRow

### Community 71 - "Teacher Profile and Sidebar"
Cohesion: 0.25
Nodes (12): buildAssignments(), fetchTeacherProfile(), saveOnboarding(), OnboardingPage(), useProfileData(), EMPTY_PROFILE, ProfilePage(), summarize() (+4 more)

### Community 72 - "Academic Session Onboarding"
Cohesion: 0.21
Nodes (12): dedupeSubjects(), deriveBatchesForSession(), fetchLiveBatches(), fetchSubjectsForSems(), toSubject(), useOnboardingData(), access, AdminSessionCreationPage() (+4 more)

### Community 73 - "Navigation and Loading UI"
Cohesion: 0.14
Nodes (10): ProgressIndicator(), Breadcrumb(), BreadcrumbItem, BreadcrumbProps, CommandMenu(), CommandMenuItem, CommandMenuProps, TabItem (+2 more)

### Community 74 - "Data Table Components"
Cohesion: 0.16
Nodes (13): ErrorState(), LoadingSpinner(), buildPageList(), DataTableColumn, FilterBar(), FilterBarProps, Pagination(), PaginationProps (+5 more)

### Community 75 - "UI Motion and Animations"
Cohesion: 0.14
Nodes (9): dialogMotion, menuMotion, MOTION_DISABLED_STORAGE_KEY, MOTION_PREFERENCE_EVENT, motionDurations, motionEase, motionEaseOut, overlayBackdropMotion (+1 more)

### Community 76 - "Database Migration Testing"
Cohesion: 0.19
Nodes (9): vitest, expectedRows, here, migrationSql, seedBlock, formatSectionLabel(), SectionLike, sectionShortLabel() (+1 more)

### Community 77 - "Demo Data Generators"
Cohesion: 0.24
Nodes (13): buildDemoAttendanceTrend(), buildDemoStudentMetrics(), clamp(), defaultMarksStore(), demoAttemptsForQuiz(), demoAttemptSubmittedAt(), demoInt(), demoInternalMarksForStudent() (+5 more)

### Community 78 - "Auth and Theme Components"
Cohesion: 0.17
Nodes (6): Button, Card(), ThemeToggle(), Step, TeacherSignInView(), TeacherSignInViewProps

### Community 79 - "Analytics Dashboard View"
Cohesion: 0.22
Nodes (5): AnalyticsDataProvider, AnalyticsStudent, AnalyticsView(), AnalyticsViewProps, GradeDistributionChart()

### Community 80 - "Channel Subscription Management"
Cohesion: 0.17
Nodes (13): isFilterValueEqual(), normalizeChannelError(), _notThisChannelEvent(), removeAllChannels(), removeChannel(), subscribe(), teardown(), unsubscribe() (+5 more)

### Community 81 - "Teacher Assignment Database"
Cohesion: 0.29
Nodes (11): public.teacher_assignments, public.list_teacher_sections_for_subject(), public.quiz_target_sections, public.request_quiz_access(), public.set_quiz_target_sections(), public.start_quiz_attempt(), public.questions, public.quizzes (+3 more)

### Community 82 - "Dashboard Page Logic"
Cohesion: 0.27
Nodes (10): formatBatchLabel(), StaleAssignmentBanner(), average(), DashboardData, DashboardPage(), daysAgoIso(), EMPTY_DATA, fetchDashboardData() (+2 more)

### Community 83 - "Course Material Management"
Cohesion: 0.24
Nodes (9): DEFAULT_POLICY, formatDate(), formatFileSize(), getTypeBadge(), MaterialItem, MaterialPersistence, MaterialView(), load() (+1 more)

### Community 84 - "Admin Role Database"
Cohesion: 0.24
Nodes (8): public.protect_last_admin, public.admins, public.get_my_role(), public.is_admin(), public.protect_last_admin(), public.allowed_teacher_emails, public.teachers, trg_protect_last_admin

### Community 85 - "Attendance Reporting View"
Cohesion: 0.31
Nodes (10): attendancePercent(), exportCsv(), loadDemoRoster(), offsetIso(), ReportModeView(), load(), ReportRow, scopedSubjects() (+2 more)

### Community 86 - "Assignment Page Access"
Cohesion: 0.22
Nodes (7): assignmentAccess, AssignmentPage(), createDemoAccess(), createSupabaseAccess(), DemoLabStore, DemoSlotStore, DemoSubStore

### Community 87 - "Attendance Heatmap View"
Cohesion: 0.25
Nodes (9): calendarGrid(), heatColorStyle(), HeatmapPersistence, HeatmapSectionOption, HeatmapView(), HeatmapViewProps, isoDate(), MONTH_NAMES (+1 more)

### Community 88 - "Marks Calculator Interface"
Cohesion: 0.27
Nodes (10): ComponentDraft, draftFromComponent(), formatMarks(), MarksCalculatorView(), MarksCalculatorViewProps, MarksStudent, nextDraftKey(), parseNumber() (+2 more)

### Community 89 - "Frontend Dependencies"
Cohesion: 0.20
Nodes (10): dependencies, framer-motion, lucide-react, pdfjs-dist, react, react-dom, react-router-dom, @reticlehq/browser (+2 more)

### Community 90 - "Teacher Eligibility Database"
Cohesion: 0.27
Nodes (8): public.enforce_teacher_eligibility, public.allowed_teacher_emails, public.enforce_teacher_eligibility(), public.request_quiz_access(), public.questions, public.students, public.teachers, trg_enforce_teacher_eligibility

### Community 91 - "AI Quiz Generator UI"
Cohesion: 0.22
Nodes (6): lucide-react, AiQuizGeneratorPage(), handleSave(), Phase, quizAccess, toIso()

### Community 92 - "Onboarding Integration Tests"
Cohesion: 0.20
Nodes (6): @testing-library/react, currentProfile, saveOnboarding, setTeacherPassword, ANONYMOUS, stubAuthService

### Community 93 - "Demo Assignment Storage"
Cohesion: 0.29
Nodes (10): assignmentSubmissionKey(), createDemoAssignment(), getDemoAssignmentSubmission(), getDemoLabManualSubmission(), labSubmissionKey(), listDemoAssignments(), readAssignmentStore(), setDemoAssignmentSubmission() (+2 more)

### Community 94 - "Demo Data Persistence"
Cohesion: 0.22
Nodes (10): createDemoId(), createDemoMaterial(), recordDemoRosterImport(), replaceDemoRoster(), saveDemoAnalyticsThreshold(), saveDemoLeaderboardConfig(), writeDemoValue(), writeMarksStore() (+2 more)

### Community 95 - "Admin Dashboard and Roster"
Cohesion: 0.20
Nodes (7): AdminDashboardPage(), DashboardStats, fetchAdminStats(), rosterImportAccess, SectionOption, sectionsAccess, StudentRow

### Community 96 - "Attendance Page Logic"
Cohesion: 0.27
Nodes (9): AttendancePage(), dateToDayOfWeek(), DAY_INDEX_MAP, DEFAULT_TIME_SLOTS, ExtendedAttendanceTab, loadRoster(), periodToSlotString(), supabaseAttendance (+1 more)

### Community 97 - "Async Helper Functions"
Cohesion: 0.44
Nodes (9): __awaiter(), __awaiter2(), adopt(), fulfilled(), rejected(), step(), fulfilled(), rejected() (+1 more)

### Community 98 - "Async Step Functions"
Cohesion: 0.44
Nodes (9): __awaiter(), __awaiter2(), adopt(), fulfilled(), rejected(), step(), fulfilled(), rejected() (+1 more)

### Community 99 - "Demo Store Defaults"
Cohesion: 0.22
Nodes (9): defaultDemoWeights(), defaultQuizStore(), listDemoMaterials(), listDemoRoster(), loadDemoAnalyticsThreshold(), loadDemoLeaderboardConfig(), readDemoValue(), readQuizStore() (+1 more)

### Community 100 - "Quiz Attempt Management"
Cohesion: 0.33
Nodes (8): public.quiz_attempt_sessions, public.request_quiz_access(), public.start_quiz_attempt(), public.submit_attempt(), public.quiz_attempts, public.quizzes, public.students, public.teachers

### Community 101 - "Chart UI Components"
Cohesion: 0.22
Nodes (7): ChartCardProps, GenericChartContainer(), GenericChartContainerProps, EmptyState(), SkeletonLoader(), CardHeader(), CardTitle()

### Community 102 - "Data Caching Hooks"
Cohesion: 0.33
Nodes (7): CacheEntry, cacheStore, clearCache(), inflightFetches, UseCacheOptions, UseCacheResult, useDataCache()

### Community 103 - "Student Roster Loading"
Cohesion: 0.36
Nodes (8): bySectionThenStudent(), LoadedRosterStudent, loadRosterStudentsForSection(), loadRosterStudentsForSections(), loadSupabaseStudents(), mapImportedRoster(), SectionLike, StudentRow

### Community 104 - "Theme Preference Management"
Cohesion: 0.25
Nodes (5): readThemePreference(), systemTheme(), THEME_CHANGE_EVENT, THEME_STORAGE_KEY, ThemePreference

### Community 105 - "Leaderboard View"
Cohesion: 0.33
Nodes (5): getBadge(), LeaderboardConfig, LeaderboardPersistence, LeaderboardView(), LeaderboardViewProps

### Community 106 - "Syllabus Progress Tracker"
Cohesion: 0.36
Nodes (7): allTopicsOf(), matchesQuery(), progressTone(), SyllabusSubject, SyllabusTrackerView(), SyllabusTrackerViewProps, UnitCard()

### Community 107 - "Timetable Editor Actions"
Cohesion: 0.28
Nodes (4): TimetableView(), closeEditor(), handleDelete(), handleSave()

### Community 108 - "Academic Audit PDF"
Cohesion: 0.29
Nodes (3): finding_table(), para(), Generate the Teacher Academic MIS deep-dive audit report as a PDF.

### Community 109 - "Teacher Permissions Management"
Cohesion: 0.39
Nodes (6): public.admins, public.grant_teacher_extra_power(), public.has_extra_power(), public.revoke_teacher_extra_power(), public.teacher_extra_powers, public.teachers

### Community 110 - "Quiz and Enrollment Updates"
Cohesion: 0.29
Nodes (7): public.unbind_student_enrollment(), public.update_quiz_question_texts(), public.update_quiz_with_questions(), public.quiz_attempts, public.quizzes, public.students, text

### Community 111 - "Section Selection Context"
Cohesion: 0.36
Nodes (5): readSubjectMap(), SelectedSectionContext, SelectedSectionProvider(), SelectedSectionValue, writeSubjectChoice()

### Community 112 - "Syllabus Upload Admin"
Cohesion: 0.29
Nodes (4): AdminSyllabusUploadPage(), Phase, requestExtraction(), SEMESTERS

### Community 113 - "Student Quiz Access"
Cohesion: 0.36
Nodes (7): StudentQuizAccessView(), handleEmailSubmit(), handleEnrollmentSubmit(), handleOtpSubmit(), submitEmail(), submitEnrollment(), submitOtp()

### Community 114 - "Teaching History View"
Cohesion: 0.32
Nodes (7): BatchGroup, groupRecords(), ordinalSem(), SemesterGroup, SubjectGroup, TeachingHistoryView(), TeachingHistoryViewProps

### Community 115 - "NPM Build Scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, lint, preview, test, test:watch

### Community 117 - "Attendance Date Selection"
Cohesion: 0.33
Nodes (6): loadDemoRoster(), MONTH_NAMES, SelectDateView(), SelectDateViewProps, supabaseAttendance, WEEKDAYS

### Community 118 - "Syllabus Unit Options"
Cohesion: 0.38
Nodes (5): loadUnitsForSubject(), loadUnitsForSubjects(), toOption(), UnitOption, UnitRow

### Community 119 - "Timetable Conflict Management"
Cohesion: 0.33
Nodes (3): public.periods, public.find_teacher_schedule_conflicts(), public.timetable_entries

### Community 120 - "Assignment and Syllabus Schema"
Cohesion: 0.33
Nodes (5): public.syllabus_units, public.assignment_shares, public.files, public.sections, public.syllabus_subjects

### Community 121 - "Audit Log Triggers"
Cohesion: 0.47
Nodes (4): public.write_audit_log, trg_audit_attendance, trg_audit_mark_components, trg_audit_mark_values

### Community 122 - "Quiz Submission Functions"
Cohesion: 0.40
Nodes (5): public.quiz_total_marks(), public.request_quiz_access(), public.submit_attempt(), public.questions, public.students

### Community 123 - "Onboarding Schema"
Cohesion: 0.53
Nodes (5): public.batches, public.syllabus_subjects, public.teacher_assignments, public.teachers, public

### Community 124 - "Quiz Privacy and Roster"
Cohesion: 0.33
Nodes (3): public.list_quiz_roster_options(), public.questions, public.students

### Community 128 - "Timetable Demo Access"
Cohesion: 0.40
Nodes (5): buildTimetableEntries(), createLocalDemoTimetableAccess(), listEntries(), fallbackSubjects(), resolveSubjects()

### Community 129 - "Attendance Demo Storage"
Cohesion: 0.40
Nodes (5): createLocalDemoAttendanceAccess(), loadPeriod(), emptyDemoAttendanceStore(), periodStorageKey(), readDemoAttendanceStore()

### Community 130 - "Syllabus Progress Schema"
Cohesion: 0.60
Nodes (4): public.syllabus_topics, public.syllabus_units, public.teacher_topic_progress, public.syllabus_subjects

### Community 132 - "Quiz Roster Options"
Cohesion: 0.40
Nodes (3): public.list_quiz_roster_options(), public.questions, public.students

### Community 133 - "Quiz Submission Errors"
Cohesion: 0.40
Nodes (4): public.submit_attempt(), public.quiz_attempts, public.students, public.teachers

### Community 135 - "Quiz Access Hardening"
Cohesion: 0.40
Nodes (4): public.request_quiz_access(), public.questions, public.students, public.teachers

### Community 137 - "Theme Migration Script"
Cohesion: 0.40
Nodes (4): filesToUpdate, fs, path, replacements

### Community 138 - "Theme Migration Script"
Cohesion: 0.40
Nodes (4): filesToUpdate, fs, path, replacements

### Community 139 - "Theme Migration Script"
Cohesion: 0.40
Nodes (4): filesToUpdate, fs, path, replacements

### Community 140 - "Luma Access Script"
Cohesion: 0.50
Nodes (3): content, fs, path

### Community 141 - "Quiz Demo Utilities"
Cohesion: 0.50
Nodes (4): averageScore(), demoQuizSections(), toDemoSavedQuiz(), totalQuizMarks()

### Community 142 - "Quiz Access Errors"
Cohesion: 0.50
Nodes (3): public.request_quiz_access(), public.questions, public.students

### Community 143 - "User Role RPC"
Cohesion: 0.50
Nodes (3): public.get_my_role(), public.allowed_teacher_emails, public.teachers

### Community 144 - "Timetable Status Schema"
Cohesion: 0.50
Nodes (3): public.section_timetable_status, public.sections, public.teachers

### Community 145 - "Admin Navigation Config"
Cohesion: 0.50
Nodes (3): AdminNavGroup, adminNavGroups, AdminNavItem

### Community 147 - "App Navigation Config"
Cohesion: 0.50
Nodes (3): NavGroup, navGroups, NavItem

### Community 148 - "Theme Migration Script"
Cohesion: 0.50
Nodes (3): filesToUpdate, fs, path

### Community 151 - "Date Utility Functions"
Cohesion: 0.67
Nodes (3): defaultUnits(), offsetDateIso(), toISODate()

### Community 161 - "Onboarding Status Gate"
Cohesion: 0.67
Nodes (3): useOnboardingStatus(), OnboardingGate(), OnboardingRoute()

## Knowledge Gaps
- **566 isolated node(s):** `Env`, `Env`, `ParsedGeneration`, `QuizDifficulty`, `ExtractedSubject` (+561 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1143 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **75 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `Database Migration Testing` to `AI Quiz Generation Service`, `Teacher Schedule Management`, `Teaching History Administration`, `Supabase Session Access`, `Authentication Context Provider`, `Cloudinary Storage Configuration`, `Onboarding Wizard Components`, `Marks and Roster Access`, `Onboarding State Management`, `Attendance Heatmap Service`, `File Upload and Marks Service`, `Admin Console Testing`, `Syllabus and Unit Access`, `Input Validation Schemas`, `Roster Import Access`, `Roster and Enrollment Service`, `Assignment and Lab Access`, `Project Package Configuration`, `Leaderboard Configuration Access`, `App Routing Tests`, `Analytics and Threshold Access`, `Quiz Data Parsers`, `Supabase Client Configuration`, `Quiz Grading Service`, `Quick Attendance Logic`, `Onboarding Integration Tests`?**
  _High betweenness centrality (0.293) - this node is a cross-community bridge._
- **Why does `react` connect `Admin Access Control Components` to `Attendance View Logic`, `Admin and App Layouts`, `Admin and Quiz Pages`, `Authentication Context Provider`, `Onboarding Wizard Components`, `Onboarding State Management`, `Quiz Creation Interface`, `Admin Console Testing`, `Academic Structure Components`, `Dashboard Charts and Widgets`, `Teacher Management Views`, `Form UI Components`, `Data Display UI Components`, `Project Package Configuration`, `Feedback and Foundation UI`, `Quiz Attempt Views`, `Overlay and Dialog Components`, `Assignment Sharing Management`, `Assignment Grid View`, `Dashboard Data Provider`, `Teacher Profile and Sidebar`, `Academic Session Onboarding`, `Navigation and Loading UI`, `Data Table Components`, `Auth and Theme Components`, `Analytics Dashboard View`, `Dashboard Page Logic`, `Course Material Management`, `Attendance Reporting View`, `Assignment Page Access`, `Attendance Heatmap View`, `Marks Calculator Interface`, `AI Quiz Generator UI`, `Onboarding Integration Tests`, `Admin Dashboard and Roster`, `Attendance Page Logic`, `Chart UI Components`, `Data Caching Hooks`, `Leaderboard View`, `Syllabus Progress Tracker`, `Section Selection Context`, `Syllabus Upload Admin`, `Teaching History View`, `Attendance Date Selection`?**
  _High betweenness centrality (0.211) - this node is a cross-community bridge._
- **Why does `topic()` connect `Channel Communication Logic` to `Socket Connection Management`, `Syllabus and Unit Access`, `Binary Protocol Encoding`, `Network Request Decoding`?**
  _High betweenness centrality (0.196) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `constructor()` (e.g. with `topic()` and `endPoint()`) actually correct?**
  _`constructor()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `constructor()` (e.g. with `topic()` and `endPoint()`) actually correct?**
  _`constructor()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Env`, `Env`, `ParsedGeneration` to the rest of the system?**
  _566 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auth and Prompt Utilities` be split into smaller, more focused modules?**
  _Cohesion score 0.017393512346854566 - nodes in this community are weakly interconnected._