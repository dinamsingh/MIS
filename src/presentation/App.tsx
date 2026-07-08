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
import { RequireTeacher } from '@presentation/auth';
import AppLayout from '@presentation/components/AppLayout';
import { TeacherSignInView, LockedFeatureView } from '@presentation/views';
import PageLoader from '@presentation/components/PageLoader';
import { SelectedSectionProvider } from '@presentation/context/SelectedSectionContext';
import { useOnboardingStatus } from '../features/onboarding/hooks/useOnboardingStatus';
import { isFeatureEnabled } from '@domain/featureFlags';

// --- Lazy-loaded page chunks (one per route) ---
const DashboardPage = lazy(() => import('@presentation/pages/DashboardPage'));
const TimetablePage = lazy(() => import('@presentation/pages/TimetablePage'));
const AttendancePage = lazy(() => import('@presentation/pages/AttendancePage'));
const AttendanceReportPage = lazy(() => import('@presentation/pages/AttendanceReportPage'));
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
 * Full-screen onboarding route. Guarded by RequireTeacher (no sidebar shell).
 * If the teacher is already onboarded they are redirected to the dashboard;
 * while the status loads a loader is shown to avoid redirect flicker.
 */
function OnboardingRoute() {
  const { loading, onboarded } = useOnboardingStatus();

  if (loading) {
    return <PageLoader />;
  }
  if (onboarded) {
    return <Navigate to="/dashboard" replace />;
  }
  return <OnboardingPage />;
}

/** Root redirect: any authenticated user → /dashboard, unauthenticated → /sign-in. */
function RootRedirect() {
  const { actor, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return <Navigate to={actor.kind !== 'anonymous' ? '/dashboard' : '/sign-in'} replace />;
}

/** Sign-in route — redirects to dashboard if already authenticated, or navigates after successful login. */
function SignInRoute() {
  const { isLoading, actor } = useAuth();

  // Any authenticated (non-anonymous) user already has a session → send them
  // into the teacher app. The onboarding gate decides dashboard vs wizard.
  // We deliberately do NOT auto-sign-out lingering sessions here; that caused
  // a 403 logout loop on expired tokens and bounced valid users back to login.
  if (!isLoading && actor.kind !== 'anonymous') {
    return <Navigate to="/dashboard" replace />;
  }

  return <TeacherSignInView onSignedIn={() => {
    // Force auth state to re-read the fresh session before navigating, so
    // RequireTeacher sees the new teacher session (not a stale student one).
    window.location.replace('/dashboard');
  }} />;
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
              <Route path="/attendance/report" element={<AttendanceReportPage />} />
              <Route path="/syllabus" element={<SyllabusTrackerPage />} />
              <Route path="/marks" element={<MarksCalculatorPage />} />
              <Route path="/quizzes" element={<QuizCreationPage />} />
              <Route path="/assignments" element={<AssignmentPage />} />
              <Route path="/assignments/share" element={<AssignmentSharePage />} />
              <Route path="/material" element={<MaterialPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/reports" element={<ReportsPage />} />
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

            {/* Root and catch-all */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
