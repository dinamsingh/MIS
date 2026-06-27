/**
 * Connected page wrapper for MarksCalculatorView.
 * Wires Supabase-backed marksAccess and loads subject/student context.
 */

import { useEffect, useState } from 'react';
import MarksCalculatorView, { type MarksStudent } from '@presentation/views/MarksCalculatorView';
import { createMarksAccess } from '@data/access/marksAccess';
import { supabase } from '@data/supabase';

const access = createMarksAccess(supabase);

export default function MarksCalculatorPage() {
  const [subjectId, setSubjectId] = useState<string>('');
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<MarksStudent[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.from('subjects').select('id, name').order('name');
        if (data && data.length > 0) {
          setSubjects(data as { id: string; name: string }[]);
          setSubjectId(data[0].id as string);
        }
      } catch {
        // empty state
      }
    })();
  }, []);

  useEffect(() => {
    if (!subjectId) return;
    void (async () => {
      try {
        const { data } = await supabase
          .from('student_roster')
          .select('id, name, enrollment_number')
          .order('name');
        if (data) {
          setStudents(
            data.map((row: { id: string; name: string; enrollment_number?: string }) => ({
              id: row.id,
              name: row.name,
              enrollmentNumber: row.enrollment_number,
            })),
          );
        }
      } catch {
        // empty state
      }
    })();
  }, [subjectId]);

  if (!subjectId) {
    return (
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-text">Marks Calculator</h2>
        <p className="mt-1 text-sm text-soft">Loading subjects…</p>
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
        key={subjectId}
        subjectId={subjectId}
        students={students}
        access={access}
      />
    </div>
  );
}
