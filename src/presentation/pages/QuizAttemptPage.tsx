/**
 * Connected page wrapper for the standalone QuizAttemptView route (public).
 * In practice, the attempt flow is embedded within StudentQuizAccessPage via
 * onGranted. This standalone page handles the case where users navigate
 * directly to /quiz/:token/attempt.
 *
 * Since the quiz payload is not available without going through the access
 * gate, this page redirects back to the access page.
 */

import { Navigate, useParams } from 'react-router-dom';

export default function QuizAttemptPage() {
  const { token } = useParams<{ token: string }>();
  // Redirect back to the access gate which handles the full flow
  return <Navigate to={`/quiz/${token ?? ''}`} replace />;
}
