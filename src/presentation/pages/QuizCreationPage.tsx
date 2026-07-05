
/**
 * Connected page wrapper for QuizCreationView.
 * Wires Supabase-backed quizAccess and loads available units. Also loads the
 * students (with their section labels) so the attempts list can show who
 * attempted the quiz and from which section — a quiz is shared across every
 * section that studies its subject (Shared-materials model).
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QuizCreationView, {
  type QuizUnitOption,
  type QuizAttemptStudent,
} from '@presentation/views/QuizCreationView';
import { createQuizAccess } from '@data/access/quizAccess';
import { createLocalDemoQuizAccess, isLocalDemoMode } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { loadRosterStudentsForSections } from '@presentation/loaders/rosterStudents';
import { loadUnitsForSubject } from '@presentation/loaders/unitOptions';

const supabaseQuizAccess = createQuizAccess(supabase);

export default function QuizCreationPage() {
  const navigate = useNavigate();
  const { sections, selectedSubjectId } = useSelectedSection();
  const [units, setUnits] = useState<QuizUnitOption[]>([]);
  const [students, setStudents] = useState<QuizAttemptStudent[]>([]);
  const quizAccess = useMemo(
    () =>
      isLocalDemoMode()
        ? createLocalDemoQuizAccess(() =>
            students.map((student) => ({
              id: student.id,
              name: student.name,
              sectionName: student.sectionLabel,
            })),
          )
        : supabaseQuizAccess,
    [students],
  );

  useEffect(() => {
    void (async () => {
      try {
        // Units come from the globally-selected subject's master syllabus.
        const [subjectUnits, roster] = await Promise.all([
          loadUnitsForSubject(selectedSubjectId),
          loadRosterStudentsForSections(sections),
        ]);
        setUnits(subjectUnits.map((u) => ({ id: u.id, name: u.name })));

        setStudents(
          roster.map((student) => ({
            id: student.id,
            name: student.name,
            sectionLabel: student.sectionLabel,
          })),
        );
      } catch {
        // View handles empty state gracefully.
      }
    })();
  }, [sections, selectedSubjectId]);

  return (
    <QuizCreationView
      quizAccess={quizAccess}
      units={units}
      students={students}
      onAiGenerate={() => navigate('/ai/quiz-generator')}
    />
  );
}
