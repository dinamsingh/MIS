/**
 * Connected page wrapper for StudentQuizAccessView (public route).
 * Wires the quizAccess RPC calls for resolving student access and passes
 * the quiz attempt renderer via onGranted.
 */

import { useParams } from 'react-router-dom';
import StudentQuizAccessView from '@presentation/views/StudentQuizAccessView';
import QuizAttemptView from '@presentation/views/QuizAttemptView';
import { createQuizAccess } from '@data/access/quizAccess';
import { createLocalDemoQuizAccess, isLocalDemoMode } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import type { QuizPayloadNoAnswers } from '@domain/services/rosterService';
import { useMemo } from 'react';

const supabaseQuizAccess = createQuizAccess(supabase);

export default function StudentQuizAccessPage() {
  const { token } = useParams<{ token: string }>();
  const quizAccess = useMemo(
    () => (isLocalDemoMode() ? createLocalDemoQuizAccess() : supabaseQuizAccess),
    [],
  );

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="card w-full max-w-sm p-6 text-center">
          <h1 className="text-lg font-semibold text-text">Invalid link</h1>
          <p className="mt-2 text-sm text-soft">This quiz link is invalid or expired.</p>
        </div>
      </div>
    );
  }

  return (
    <StudentQuizAccessView
      quizId={token}
      resolveAccess={(quizId, providedEnrollment) =>
        quizAccess.resolveAccess(quizId, providedEnrollment)
      }
      onGranted={(quiz: QuizPayloadNoAnswers) => (
        <QuizAttemptView
          quiz={quiz}
          submitAttempt={(quizId, answers) => quizAccess.submitAttempt(quizId, answers)}
        />
      )}
    />
  );
}
