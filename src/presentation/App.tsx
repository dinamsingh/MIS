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

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@presentation/auth';
import { RequireTeacher } from '@presentation/auth';
import AppLayout from '@presentation/components/AppLayout';
import { TeacherSignInView, LockedFeatureView } from '@presentation/views';
import PageLoader from '@presentation/components/PageLoader';
import { SelectedSectionProvider } from '@presentation/context/SelectedSectionContext';

// --- Lazy-loaded page chunks (one per route) ---
const DashboardPage = lazy(() => import('@presentation/pages/DashboardPage'));
const TimetablePage = lazy(() => import('@presentation/pages/TimetablePage'));
const AttendancePage = lazy(() => import('@presentation/pages/AttendancePage'));
const SyllabusTrackerPage = lazy(() => import('@presentation/pages/SyllabusTrackerPage'));
const MarksCalculatorPage = lazy(() => import('@presentation/pages/MarksCalculatorPage'));
const QuizCreationPage = lazy(() => import('@presentation/pages/QuizCreationPage'));
const AssignmentPage = lazy(() => import('@presentation/pages/AssignmentPage'));
const MaterialPage = lazy(() => import('@presentation/pages/MaterialPage'));
const RosterPage = lazy(() => import('@presentation/pages/RosterPage'));
const AnalyticsPage = lazy(() => import('@presentation/pages/AnalyticsPage'));
const LeaderboardPage = lazy(() => import('@presentation/pages/LeaderboardPage'));
const HeatmapPage = lazy(() => import('@presentation/pages/HeatmapPage'));
const StudentQuizAccessPage = lazy(() => import('@presentation/pages/StudentQuizAccessPage'));
const QuizAttemptPage = lazy(() => import('@presentation/pages/QuizAttemptPage'));

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
      <SelectedSectionProvider>
        <AppLayout activePath={location.pathname} onNavigate={(path) => navigate(path)} onLogout={handleLogout}>
          <Outlet />
        </AppLayout>
      </SelectedSectionProvider>
    </RequireTeacher>
  );
}

/** Root redirect: teacher → /dashboard, unauthenticated → /sign-in. */
function RootRedirect() {
  const { isTeacher, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return <Navigate to={isTeacher ? '/dashboard' : '/sign-in'} replace />;
}

/** Sign-in route — redirects to dashboard if already authenticated, or navigates after successful login. */
function SignInRoute() {
  const navigate = useNavigate();
  const { isTeacher, isLoading } = useAuth();

  // Already authenticated teacher → go to dashboard
  if (!isLoading && isTeacher) {
    return <Navigate to="/dashboard" replace />;
  }

  return <TeacherSignInView onSignedIn={() => navigate('/dashboard', { replace: true })} />;
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

            {/* Teacher-guarded routes wrapped in layout shell */}
            <Route element={<TeacherShell />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/timetable" element={<TimetablePage />} />
              <Route path="/roster" element={<RosterPage />} />
              <Route path="/attendance" element={<AttendancePage />} />
              <Route path="/syllabus" element={<SyllabusTrackerPage />} />
              <Route path="/marks" element={<MarksCalculatorPage />} />
              <Route path="/quizzes" element={<QuizCreationPage />} />
              <Route path="/assignments" element={<AssignmentPage />} />
              <Route path="/material" element={<MaterialPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/heatmap" element={<HeatmapPage />} />
              <Route path="/ai/quiz-generator" element={<LockedFeatureView title="AI Quiz Generator" description="Generate MCQ quizzes using AI." />} />
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
