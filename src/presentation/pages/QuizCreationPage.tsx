/**
 * Connected page wrapper for QuizCreationView.
 *
 * Scoped to the globally-selected subject: loads that subject's units (for the
 * authoring form + to scope the saved-quizzes list) and wires the Supabase-backed
 * quizAccess. In demo mode it also feeds the roster students into the demo access
 * so submissions can be labelled with names/sections.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QuizCreationView, { type QuizUnitOption } from '@presentation/views/QuizCreationView';
import { createQuizAccess } from '@data/access/quizAccess';
import { createLocalDemoQuizAccess, isLocalDemoMode } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { loadRosterStudentsForSections } from '@presentation/loaders/rosterStudents';
import { loadUnitsForSubject } from '@presentation/loaders/unitOptions';

const supabaseQuizAccess = createQuizAccess(supabase);

interface DemoStudentLite {
  readonly id: string;
  readonly name: string;
  readonly sectionName?: string;
  readonly sectionId?: string;
  readonly enrollmentNumber?: string;
}

export default function QuizCreationPage() {
  const navigate = useNavigate();
  const { sections, selectedSectionId, selectedSection, selectedSubjectId, selectedSubject } =
    useSelectedSection();
  const [units, setUnits] = useState<QuizUnitOption[]>([]);
  const [students, setStudents] = useState<DemoStudentLite[]>([]);

  const quizAccess = useMemo(
    () =>
      isLocalDemoMode()
        ? createLocalDemoQuizAccess(() =>
            students.map((student) => ({
              id: student.id,
              name: student.name,
              sectionName: student.sectionName,
              sectionId: student.sectionId,
              enrollmentNumber: student.enrollmentNumber,
            })),
          )
        : supabaseQuizAccess,
    [students],
  );

  useEffect(() => {
    void (async () => {
      try {
        const [subjectUnits, roster] = await Promise.all([
          loadUnitsForSubject(selectedSubjectId),
          loadRosterStudentsForSections(sections),
        ]);
        setUnits(subjectUnits.map((u) => ({ id: u.id, name: u.name })));
        setStudents(
          roster.map((student) => ({
            id: student.id,
            name: student.name,
            sectionName: student.sectionName ?? student.sectionLabel,
            sectionId: student.sectionId,
            enrollmentNumber: student.enrollmentNumber,
          })),
        );
      } catch {
        setUnits([]);
        setStudents([]);
      }
    })();
  }, [sections, selectedSubjectId]);

  return (
    <QuizCreationView
      quizAccess={quizAccess}
      units={units}
      subjectId={selectedSubjectId}
      subjectName={selectedSubject?.name ?? null}
      sectionId={selectedSectionId}
      sectionName={selectedSection?.name ?? null}
      onAiGenerate={() => navigate('/ai/quiz-generator')}
    />
  );
}
