import { useEffect, useMemo, useState } from 'react';
import MarksCalculatorView, { type MarksStudent } from '@presentation/views/MarksCalculatorView';
import { createMarksAccess } from '@data/access/marksAccess';
import { createLocalDemoMarksAccess, isLocalDemoMode } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { loadRosterStudentsForSection } from '@presentation/loaders/rosterStudents';

const supabaseAccess = createMarksAccess(supabase);

export default function MarksCalculatorPage() {
  // Section + subject come from the global top-bar selectors.
  const { selectedSection, selectedSubjectId } = useSelectedSection();
  const [students, setStudents] = useState<MarksStudent[]>([]);
  const access = useMemo(
    () => (isLocalDemoMode() ? createLocalDemoMarksAccess() : supabaseAccess),
    [],
  );

  const sectionId = selectedSection?.id ?? null;
  const subjectId = selectedSubjectId ?? '';

  useEffect(() => {
    if (!subjectId || !sectionId) {
      setStudents([]);
      return;
    }
    void (async () => {
      try {
        const roster = selectedSection ? await loadRosterStudentsForSection(selectedSection) : [];
        setStudents(
          roster.map((student) => ({
            id: student.id,
            name: student.name,
            enrollmentNumber: student.enrollmentNumber,
          })),
        );
      } catch {
        // empty state
      }
    })();
  }, [subjectId, sectionId, selectedSection]);

  if (!subjectId) {
    return (
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-text">Marks Calculator</h2>
        <p className="mt-1 text-sm text-soft">
          Select a subject from the top bar to calculate marks.
        </p>
      </section>
    );
  }

  return (
    <MarksCalculatorView
      key={`${subjectId}-${sectionId ?? 'none'}`}
      subjectId={subjectId}
      students={students}
      access={access}
    />
  );
}
