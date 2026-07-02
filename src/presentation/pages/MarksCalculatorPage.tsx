import { useEffect, useMemo, useState } from 'react';
import MarksCalculatorView, { type MarksStudent } from '@presentation/views/MarksCalculatorView';
import { createMarksAccess } from '@data/access/marksAccess';
import { createLocalDemoMarksAccess, isLocalDemoMode } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';

const supabaseAccess = createMarksAccess(supabase);

export default function MarksCalculatorPage() {
  const { selectedSection } = useSelectedSection();
  const [subjectId, setSubjectId] = useState<string>('');
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<MarksStudent[]>([]);
  const access = useMemo(
    () => (isLocalDemoMode() ? createLocalDemoMarksAccess() : supabaseAccess),
    [],
  );

  const sectionId = selectedSection?.id ?? null;
  const semester = selectedSection?.semester ?? null;

  useEffect(() => {
    if (!semester) {
      setSubjects([]);
      setSubjectId('');
      return;
    }
    void (async () => {
      try {
        const { data } = await supabase
          .from('subjects')
          .select('id, name')
          .eq('semester', semester)
          .order('name');
        if (data) {
          setSubjects(data as { id: string; name: string }[]);
          if (data.length > 0) {
            setSubjectId(data[0].id as string);
          } else {
            setSubjectId('');
          }
        }
      } catch {
        // empty state
      }
    })();
  }, [semester]);

  useEffect(() => {
    if (!subjectId || !sectionId) {
      setStudents([]);
      return;
    }
    void (async () => {
      try {
        // Students in the globally-selected section.
        const { data } = await supabase
          .from('students')
          .select('id, name, enrollment_number')
          .eq('section_id', sectionId)
          .order('name');

        if (data) {
          setStudents(
            data.map((row: { id: string; name: string; enrollment_number?: string | null }) => ({
              id: row.id,
              name: row.name,
              enrollmentNumber: row.enrollment_number || undefined,
            })),
          );
        }
      } catch {
        // empty state
      }
    })();
  }, [subjectId, sectionId]);

  if (!subjectId) {
    return (
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-text">Marks Calculator</h2>
        <p className="mt-1 text-sm text-soft">No subjects available for the selected semester.</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {subjects.length > 1 && (
        <div className="card p-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-text max-w-xs">
            Subject
            <select
              className="w-full rounded-button border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <MarksCalculatorView
        key={`${subjectId}-${sectionId ?? 'none'}`}
        subjectId={subjectId}
        students={students}
        access={access}
      />
    </div>
  );
}
