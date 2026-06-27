/**
 * Connected page wrapper for QuizCreationView.
 * Wires Supabase-backed quizAccess and loads available units.
 */

import { useEffect, useState } from 'react';
import QuizCreationView, { type QuizUnitOption } from '@presentation/views/QuizCreationView';
import { createQuizAccess } from '@data/access/quizAccess';
import { supabase } from '@data/supabase';

const quizAccess = createQuizAccess(supabase);

export default function QuizCreationPage() {
  const [units, setUnits] = useState<QuizUnitOption[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.from('units').select('id, name').order('name');
        if (data) {
          setUnits(data as QuizUnitOption[]);
        }
      } catch {
        // View handles empty state gracefully.
      }
    })();
  }, []);

  return <QuizCreationView quizAccess={quizAccess} units={units} />;
}
