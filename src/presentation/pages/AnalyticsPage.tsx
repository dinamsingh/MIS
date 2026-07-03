import { useMemo } from 'react';
import AnalyticsView, { type AnalyticsDataProvider } from '@presentation/views/AnalyticsView';
import { createAnalyticsAccess } from '@data/access/analyticsAccess';
import {
  buildDemoStudentMetrics,
  demoNumber,
  isLocalDemoMode,
  loadDemoAnalyticsThreshold,
  saveDemoAnalyticsThreshold,
} from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { loadRosterStudentsForSection } from '@presentation/loaders/rosterStudents';
import type { UnitAverage } from '@domain/services/analyticsService';

const analyticsAccess = createAnalyticsAccess(supabase);

export default function AnalyticsPage() {
  const { selectedSection } = useSelectedSection();
  const sectionId = selectedSection?.id ?? null;
  const semester = selectedSection?.semester ?? null;

  const dataProvider = useMemo<AnalyticsDataProvider>(
    () => ({
      loadThreshold: () =>
        isLocalDemoMode() ? Promise.resolve(loadDemoAnalyticsThreshold()) : analyticsAccess.loadThreshold(),
      saveThreshold: (threshold: number) => {
        if (isLocalDemoMode()) {
          saveDemoAnalyticsThreshold(threshold);
          return Promise.resolve();
        }
        return analyticsAccess.saveThreshold(threshold);
      },

      async loadInternalMarks(): Promise<number[]> {
        if (!sectionId) return [];

        if (isLocalDemoMode()) {
          const roster = selectedSection ? await loadRosterStudentsForSection(selectedSection) : [];
          return buildDemoStudentMetrics(roster).map((student) => student.internalMarks);
        }

        // Students in the selected section.
        const { data: students } = await supabase
          .from('students')
          .select('id')
          .eq('section_id', sectionId);
        const studentIds = (students || []).map((s) => s.id);
        if (studentIds.length === 0) return [];

        // Fetch mark values for these students
        const { data: markRows } = await supabase
          .from('mark_values')
          .select('student_id, internal_marks_snapshot')
          .in('student_id', studentIds);

        const byStudent = new Map<string, number>();
        for (const row of markRows || []) {
          if (row.internal_marks_snapshot !== null) {
            byStudent.set(row.student_id, row.internal_marks_snapshot);
          }
        }
        return Array.from(byStudent.values());
      },

      async loadUnitAverages(): Promise<UnitAverage[]> {
        if (!semester) return [];

        // Get subjects for active semester
        const { data: subjects } = await supabase
          .from('subjects')
          .select('id')
          .eq('semester', semester);
        const subjectIds = (subjects || []).map((s) => s.id);
        if (subjectIds.length === 0) return [];

        // Get units for these subjects
        const { data: units } = await supabase
          .from('units')
          .select('id')
          .in('subject_id', subjectIds);
        const unitIds = (units || []).map((u) => u.id);

        if (isLocalDemoMode()) {
          const activeUnitIds =
            unitIds.length > 0
              ? unitIds
              : ['demo-unit-1', 'demo-unit-2', 'demo-unit-3', 'demo-unit-4'];
          return activeUnitIds.map((unitId) => ({
            unitId,
            average: Math.round(demoNumber(`${sectionId ?? semester}:${unitId}:unit-average`, 58, 94)),
          }));
        }

        // Load quiz attempts for quizzes in these units
        const { data } = await supabase
          .from('quiz_attempts')
          .select('quiz_id, score, quizzes!inner(unit_id)')
          .in('quizzes.unit_id', unitIds)
          .not('score', 'is', null);

        if (!data || data.length === 0) return [];

        const unitTotals = new Map<string, { sum: number; count: number }>();
        for (const row of data) {
          const r = row as unknown as { score: number; quizzes: { unit_id: string } };
          const unitId = r.quizzes.unit_id;
          const score = r.score;
          const entry = unitTotals.get(unitId) ?? { sum: 0, count: 0 };
          entry.sum += score;
          entry.count += 1;
          unitTotals.set(unitId, entry);
        }
        return Array.from(unitTotals.entries()).map(([unitId, { sum, count }]) => ({
          unitId,
          average: sum / count,
        }));
      },

      async loadQuizScores(): Promise<number[]> {
        if (!sectionId) return [];

        if (isLocalDemoMode()) {
          const roster = selectedSection ? await loadRosterStudentsForSection(selectedSection) : [];
          return buildDemoStudentMetrics(roster).map((student) => student.quizScore);
        }

        // Students in the selected section.
        const { data: students } = await supabase
          .from('students')
          .select('id')
          .eq('section_id', sectionId);
        const studentIds = (students || []).map((s) => s.id);
        if (studentIds.length === 0) return [];

        const { data } = await supabase
          .from('quiz_attempts')
          .select('score')
          .in('student_id', studentIds)
          .not('score', 'is', null);

        if (!data) return [];
        return data.map((row: { score: number }) => row.score);
      },
    }),
    [sectionId, semester, selectedSection],
  );

  return <AnalyticsView key={sectionId ?? 'none'} dataProvider={dataProvider} />;
}
