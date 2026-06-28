import { useEffect, useState } from 'react';
import MarksCalculatorView, { type MarksStudent } from '@presentation/views/MarksCalculatorView';
import { createMarksAccess } from '@data/access/marksAccess';
import { supabase } from '@data/supabase';
import { useSelectedSemester, useSelectedSection, mapSemesterToDb } from '@presentation/hooks';

const access = createMarksAccess(supabase);

export default function MarksCalculatorPage() {
  const [subjectId, setSubjectId] = useState<string>('');
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<MarksStudent[]>([]);
  const semester = useSelectedSemester();
  const section = useSelectedSection();

  useEffect(() => {
    void (async () => {
      try {
        const dbSemester = mapSemesterToDb(semester);
        const { data } = await supabase
          .from('subjects')
          .select('id, name')
          .eq('semester', dbSemester)
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
    if (!subjectId) {
      setStudents([]);
      return;
    }
    void (async () => {
      try {
        const dbSemester = mapSemesterToDb(semester);
        const semNum = dbSemester[0];
        const targetSectionName = `CS-${semNum}${section}`;

        // Get sections for this semester
        const { data: sections } = await supabase.from('sections').select('id, name');
        const semSectionIds = (sections || [])
          .filter((sec) => sec.name === targetSectionName)
          .map((sec) => sec.id);

        // Get students in these sections
        const { data } = await supabase
          .from('students')
          .select('id, name, enrollment_number')
          .in('section_id', semSectionIds)
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
  }, [subjectId, semester, section]);

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
        key={`${subjectId}-${semester}-${section}`}
        subjectId={subjectId}
        students={students}
        access={access}
      />
    </div>
  );
}
