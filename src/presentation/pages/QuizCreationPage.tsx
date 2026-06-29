
/**
 * Connected page wrapper for QuizCreationView.
 * Wires Supabase-backed quizAccess and loads available units. Also loads the
 * students (with their section labels) so the attempts list can show who
 * attempted the quiz and from which section — a quiz is shared across every
 * section that studies its subject (Shared-materials model).
 */

import { useEffect, useState } from 'react';
import QuizCreationView, {
  type QuizUnitOption,
  type QuizAttemptStudent,
} from '@presentation/views/QuizCreationView';
import { createQuizAccess } from '@data/access/quizAccess';
import { supabase } from '@data/supabase';
import { formatSectionLabel } from '@presentation/format/sectionLabel';

const quizAccess = createQuizAccess(supabase);

export default function QuizCreationPage() {
  const [units, setUnits] = useState<QuizUnitOption[]>([]);
  const [students, setStudents] = useState<QuizAttemptStudent[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [unitRes, sectionRes, studentRes] = await Promise.all([
          supabase.from('units').select('id, name').order('name'),
          supabase.from('sections').select('id, name, batch, semester, department'),
          supabase.from('students').select('id, name, section_id').order('name'),
        ]);
        if (unitRes.data) {
          setUnits(unitRes.data as QuizUnitOption[]);
        }

        const sectionLabelById = new Map<string, string>();
        for (const row of (sectionRes.data ?? []) as Array<{
          id: string;
          name: string;
          batch: string | null;
          semester: string | null;
          department: string | null;
        }>) {
          sectionLabelById.set(row.id, formatSectionLabel(row));
        }

        if (studentRes.data) {
          setStudents(
            (studentRes.data as Array<{
              id: string;
              name: string;
              section_id?: string | null;
            }>).map((row) => ({
              id: row.id,
              name: row.name,
              ...(row.section_id
                ? { sectionLabel: sectionLabelById.get(row.section_id) }
                : {}),
            })),
          );
        }
      } catch {
        // View handles empty state gracefully.
      }
    })();
  }, []);

  return <QuizCreationView quizAccess={quizAccess} units={units} students={students} />;
}
