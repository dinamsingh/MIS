/**
 * Routed application shell (task 26.1).
 *
 * Wires every presentation view into react-router-dom with:
 * - AuthProvider wrapping the entire tree for session state.
 * - BrowserRouter providing client-side routing.
 * - Teacher routes (guarded by RequireTeacher + AppLayout) for all admin views.
 * - Public routes for sign-in and student quiz access via token.
 * - AI routes rendering LockedFeatureView under the teacher guard.
 * - Default redirect: authenticated teacher → /dashboard, unauthenticated → /sign-in.
 * - Sidebar onNavigate wired to react-router-dom's navigate().
 *
 * All page components are lazy-loaded via React.lazy() so Vite produces
 * per-page chunks for optimal initial load performance.
 *
 * Requirements: 1.5, 20.7
 */

import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@presentation/auth';
import { RequireTeacher, RequireAdmin } from '@presentation/auth';
import { useUserRole } from '@presentation/auth/useUserRole';
import AppLayout from '@presentation/components/AppLayout';
import AdminLayout from '@presentation/components/AdminLayout';
import { TeacherSignInView, LockedFeatureView } from '@presentation/views';
import PageLoader from '@presentation/components/PageLoader';
import { SelectedSectionProvider } from '@presentation/context/SelectedSectionContext';
import { useOnboardingStatus } from '../features/onboarding/hooks/useOnboardingStatus';
import { isFeatureEnabled } from '@domain/featureFlags';
import { messages } from '@domain/shared/messages';

/**
 * `location.state` shape used to carry the "not on the approved teacher
 * list" message from `RootRedirect`/`OnboardingRoute` to `SignInRoute` when
 * an authenticated non-teacher identity (`role === 'none'`) is signed out
 * and redirected — so a student who lands on a teacher-only surface via a
 * quiz link sees the exact same message a teacher would see after typing an
 * unapproved email directly on the sign-in page (bugfix:
 * student-signin-role-routing-fix).
 */
interface SignInRedirectState {
  readonly notApprovedTeacher?: boolean;
}

const NOT_APPROVED_TEACHER_STATE: SignInRedirectState = { notApprovedTeacher: true };

// --- Lazy-loaded page chunks (one per route) ---
const DashboardPage = lazy(() => import('@presentation/pages/DashboardPage'));
const TimetablePage = lazy(() => import('@presentation/pages/TimetablePage'));
const AttendancePage = lazy(() => import('@presentation/pages/AttendancePage'));

const SyllabusTrackerPage = lazy(() => import('@presentation/pages/SyllabusTrackerPage'));
const MarksCalculatorPage = lazy(() => import('@presentation/pages/MarksCalculatorPage'));
const QuizCreationPage = lazy(() => import('@presentation/pages/QuizCreationPage'));
const AssignmentPage = lazy(() => import('@presentation/pages/AssignmentPage'));
const AssignmentSharePage = lazy(() => import('@presentation/pages/AssignmentSharePage'));
const MaterialPage = lazy(() => import('@presentation/pages/MaterialPage'));
const RosterPage = lazy(() => import('@presentation/pages/RosterPage'));
const AnalyticsPage = lazy(() => import('@presentation/pages/AnalyticsPage'));
const LeaderboardPage = lazy(() => import('@presentation/pages/LeaderboardPage'));
const StudentQuizAccessPage = lazy(() => import('@presentation/pages/StudentQuizAccessPage'));
const QuizAttemptPage = lazy(() => import('@presentation/pages/QuizAttemptPage'));
const OnboardingPage = lazy(() => import('../features/onboarding/OnboardingPage'));
const ProfilePage = lazy(() => import('../features/profile/ProfilePage'));
const AiQuizGeneratorPage = lazy(() => import('@presentation/pages/AiQuizGeneratorPage'));
const ReportsPage = lazy(() => import('@presentation/pages/ReportsPage'));
const AdminTeacherApprovalPage = lazy(() => import('@presentation/pages/AdminTeacherApprovalPage'));
const AdminExtraPowersPage = lazy(() => import('@presentation/pages/AdminExtraPowersPage'));
const AdminManageAdminsPage = lazy(() => import('@presentation/pages/AdminManageAdminsPage'));
const AdminSessionCreationPage = lazy(() => import('@presentation/pages/AdminSessionCreationPage'));
const AdminRosterImportPage = lazy(() => import('@presentation/pages/AdminRosterImportPage'));
const AdminDashboardPage = lazy(() => import('@presentation/pages/AdminDashboardPage'));
const AdminBatchPromotionPage = lazy(() => import('@presentation/pages/AdminBatchPromotionPage'));
const AdminSyllabusUploadPage = lazy(() => import('@presentation/pages/AdminSyllabusUploadPage'));
const TeachingHistoryPage = lazy(() => import('@presentation/pages/TeachingHistoryPage'));
const MySchedulePage = lazy(() => import('@presentation/pages/MySchedulePage'));

/**
 * Onboarding gate for the teacher app shell. While the onboarded status loads
 * it renders a loader (no redirect flicker); an un-onboarded teacher is sent to
 * the wizard; an onboarded teacher continues to the requested view.
 */
function OnboardingGate({ children }: { children: ReactNode }) {
  const { loading, onboarded } = useOnboardingStatus();

  if (loading) {
    return <PageLoader />;
  }
  if (!onboarded) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

/**
 * Teacher layout shell — wraps children in RequireTeacher + AppLayout with
 * sidebar navigation wired to react-router navigate().
 */
function TeacherShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate('/sign-in', { replace: true });
  };

  return (
    <RequireTeacher>
      <OnboardingGate>
        <SelectedSectionProvider>
          <AppLayout activePath={location.pathname} onNavigate={(path) => navigate(path)} onLogout={handleLogout}>
            <Outlet />
          </AppLayout>
        </SelectedSectionProvider>
      </OnboardingGate>
    </RequireTeacher>
  );
}

/**
 * Admin Console layout shell — wraps children in RequireAdmin + AdminLayout
 * with sidebar navigation wired to react-router navigate(). Parallel to
 * `TeacherShell`, not nested inside it: an admin who is not a teacher must
 * reach `/admin/*` without ever passing through RequireTeacher/OnboardingGate.
 * Uses the dedicated AdminLayout which has no section/subject dropdowns and
 * shows only admin-relevant navigation items.
 */
function AdminShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate('/sign-in', { replace: true });
  };

  return (
    <RequireAdmin>
      <AdminLayout activePath={location.pathname} onNavigate={(path) => navigate(path)} onLogout={handleLogout}>
        <Outlet />
      </AdminLayout>
    </RequireAdmin>
  );
}

/**
 * Full-screen onboarding route. Only a 'pending-teacher' (no teachers row
 * yet) or a 'teacher' who has a row but hasn't finished the wizard sees it;
 * an already-onboarded teacher is sent to /dashboard, and a non-teacher
 * ('none') is sent to /sign-in — RequireTeacher normally intercepts this
 * case first, but this route is defense-in-depth against direct navigation.
 */
function OnboardingRoute() {
  const { actor, signOut } = useAuth();
  const { isAdmin, isTeacher, isPendingTeacher, loading: roleLoading } = useUserRole();
  const { loading: onboardingLoading, onboarded } = useOnboardingStatus();

  if (roleLoading || ((isTeacher || isPendingTeacher) && onboardingLoading)) {
    return <PageLoader />;
  }
  if (!isTeacher && !isPendingTeacher) {
    // An admin-only identity (no teacher/pending-teacher tag) has no
    // onboarding wizard to complete — send them to the Admin Console
    // dashboard instead of treating them as an unapproved, sign-out-worthy
    // identity (bugfix: admin-only-sign-in-redirect).
    if (isAdmin) {
      return <Navigate to="/admin" replace />;
    }
    // A non-teacher, non-admin identity (e.g. a student who followed a quiz
    // link into Google/OTP sign-in and ended up here) must never see the
    // onboarding wizard. Sign them out — same as RootRedirect/SignInRoute —
    // and carry the same "not on the approved teacher list" message a
    // teacher would see after typing an unapproved email directly on the
    // sign-in page.
    if (actor.kind !== 'anonymous') {
      void signOut();
    }
    return <Navigate to="/sign-in" state={NOT_APPROVED_TEACHER_STATE} replace />;
  }
  if (onboarded) {
    return <Navigate to="/dashboard" replace />;
  }
  return <OnboardingPage />;
}

/**
 * Root redirect: a teacher or pending-teacher → /dashboard, an admin-only
 * identity (no teacher/pending-teacher tag) → /admin, everyone else
 * (anonymous, or an authenticated non-teacher/non-admin such as a student)
 * → /sign-in. Non-teacher, non-admin authenticated users are signed out
 * first so they land on /sign-in with a clean session rather than looping
 * back through RootRedirect on every subsequent navigation.
 */
function RootRedirect() {
  const { actor, isLoading, signOut } = useAuth();
  const { isAdmin, isTeacher, isPendingTeacher, loading: roleLoading } = useUserRole();

  if (isLoading || roleLoading) {
    return null;
  }

  if (isTeacher || isPendingTeacher) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isAdmin) {
    // An admin-only identity (present in public.admins but not
    // public.teachers/allowed_teacher_emails) has no teacher surface to
    // land on — send them straight into the Admin Console dashboard
    // (bugfix: admin-only-sign-in-redirect).
    return <Navigate to="/admin" replace />;
  }

  if (actor.kind !== 'anonymous') {
    // Authenticated but not a teacher/pending-teacher/admin (a student, or
    // any other unrecognized identity) — never send them into the teacher
    // app. Carry the same "not on the approved teacher list" message a
    // teacher would see after typing an unapproved email directly on the
    // sign-in page, so a student who ends up here (e.g. via a quiz link)
    // sees an identical, non-blank explanation.
    void signOut();
    return <Navigate to="/sign-in" state={NOT_APPROVED_TEACHER_STATE} replace />;
  }
  return <Navigate to="/sign-in" replace />;
}

/**
 * Sign-in route — redirects a teacher/pending-teacher to /dashboard and an
 * admin-only identity to /admin; renders the teacher sign-in view
 * otherwise. An authenticated non-teacher/non-admin (e.g. a student who
 * reached /sign-in directly, not via a quiz link) is signed out so the view
 * renders the sign-in form instead of redirect-looping.
 */
function SignInRoute() {
  const { actor, isLoading, signOut } = useAuth();
  const { isAdmin, isTeacher, isPendingTeacher, loading: roleLoading } = useUserRole();
  const location = useLocation();

  if (isLoading || roleLoading) {
    return null;
  }

  const isRecovery = location.hash.includes('type=recovery');

  if ((isTeacher || isPendingTeacher) && !isRecovery) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isAdmin) {
    // An admin-only identity restoring a session directly on /sign-in
    // (e.g. a bookmark) goes straight to the Admin Console dashboard
    // rather than re-showing the sign-in form (bugfix:
    // admin-only-sign-in-redirect).
    return <Navigate to="/admin" replace />;
  }

  if (actor.kind !== 'anonymous' && !isRecovery) {
    void signOut();
  }

  // Set by RootRedirect/OnboardingRoute when a non-teacher identity was just
  // signed out of a teacher-only surface — shows the same "not on the
  // approved teacher list" message a teacher sees after typing an
  // unapproved email directly here, instead of a silent, unexplained
  // landing on the sign-in page.
  const redirectState = location.state as SignInRedirectState | null;
  const initialError = redirectState?.notApprovedTeacher === true
    ? messages.auth.notApprovedTeacher
    : null;

  return <TeacherSignInView
    initialError={initialError}
    onSignedIn={() => {
      // After a successful sign-in, the Supabase client fires an
      // AUTH_STATE_CHANGE event → AuthProvider's subscribe callback
      // updates actor → SignInRoute re-renders → the isTeacher/isAdmin
      // checks pass → Navigate redirects to the correct destination.
      // No manual navigation needed — React's auth state propagation
      // handles the redirect automatically and avoids the full-page-
      // reload session-persistence race condition entirely.
    }}
  />;
}

/** Top-level application component. */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public routes */}
            <Route path="/sign-in" element={<SignInRoute />} />
            <Route path="/quiz/:token" element={<StudentQuizAccessPage />} />
            <Route path="/quiz/:token/attempt" element={<QuizAttemptPage />} />

            {/* Full-screen onboarding (teacher-guarded, no sidebar shell) */}
            <Route path="/onboarding" element={<OnboardingRoute />} />

            {/* Teacher-guarded routes wrapped in layout shell */}
            <Route element={<TeacherShell />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/timetable" element={<TimetablePage />} />
              <Route path="/roster" element={<RosterPage />} />
              <Route path="/attendance" element={<AttendancePage />} />

              <Route path="/syllabus" element={<SyllabusTrackerPage />} />
              <Route path="/marks" element={<MarksCalculatorPage />} />
              <Route path="/quizzes" element={<QuizCreationPage />} />
              <Route path="/assignments" element={<AssignmentPage />} />
              <Route path="/assignments/share" element={<AssignmentSharePage />} />
              <Route path="/material" element={<MaterialPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/teaching-history" element={<TeachingHistoryPage />} />
              <Route path="/my-schedule" element={<MySchedulePage />} />
              <Route
                path="/ai/quiz-generator"
                element={
                  isFeatureEnabled('ai')
                    ? <AiQuizGeneratorPage />
                    : <LockedFeatureView title="AI Quiz Generator" description="Generate MCQ quizzes using AI." />
                }
              />
              <Route path="/ai/risk-predictor" element={<LockedFeatureView title="Risk Predictor" description="Predict at-risk students using AI." />} />
              <Route path="/ai/*" element={<LockedFeatureView title="AI Feature" />} />
            </Route>

            {/* Admin-guarded routes wrapped in their own layout shell (parallel to TeacherShell) */}
            <Route element={<AdminShell />}>
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/admin/teachers" element={<AdminTeacherApprovalPage />} />
              <Route path="/admin/powers" element={<AdminExtraPowersPage />} />
              <Route path="/admin/admins" element={<AdminManageAdminsPage />} />
              <Route path="/admin/sessions" element={<AdminSessionCreationPage />} />
              <Route path="/admin/roster" element={<AdminRosterImportPage />} />
              <Route path="/admin/batches" element={<AdminBatchPromotionPage />} />
              <Route path="/admin/syllabus-upload" element={<AdminSyllabusUploadPage />} />
            </Route>

            {/* Root and catch-all */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
