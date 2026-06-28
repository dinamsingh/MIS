import AnalyticsView, { type AnalyticsDataProvider } from '@presentation/views/AnalyticsView';
import { createAnalyticsAccess } from '@data/access/analyticsAccess';
import { supabase } from '@data/supabase';
import { useSelectedSemester, useSelectedSection, mapSemesterToDb } from '@presentation/hooks';
import type { UnitAverage } from '@domain/services/analyticsService';

const analyticsAccess = createAnalyticsAccess(supabase);

export default function AnalyticsPage() {
  const semester = useSelectedSemester();
  const section = useSelectedSection();

  const dataProvider: AnalyticsDataProvider = {
    loadThreshold: () => analyticsAccess.loadThreshold(),
    saveThreshold: (threshold: number) => analyticsAccess.saveThreshold(threshold),

    async loadInternalMarks(): Promise<number[]> {
      const dbSemester = mapSemesterToDb(semester);
      const semNum = dbSemester[0];
      const targetSectionName = `CS-${semNum}${section}`;

      // Get sections for this semester
      const { data: sections } = await supabase.from('sections').select('id, name');
      const semSectionIds = (sections || [])
        .filter((sec) => sec.name === targetSectionName)
        .map((sec) => sec.id);

      // Get students in these sections
      const { data: students } = await supabase
        .from('students')
        .select('id')
        .in('section_id', semSectionIds);
      const studentIds = (students || []).map((s) => s.id);

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
      const dbSemester = mapSemesterToDb(semester);

      // Get subjects for active semester
      const { data: subjects } = await supabase
        .from('subjects')
        .select('id')
        .eq('semester', dbSemester);
      const subjectIds = (subjects || []).map((s) => s.id);

      // Get units for these subjects
      const { data: units } = await supabase
        .from('units')
        .select('id')
        .in('subject_id', subjectIds);
      const unitIds = (units || []).map((u) => u.id);

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
      const dbSemester = mapSemesterToDb(semester);
      const semNum = dbSemester[0];
      const targetSectionName = `CS-${semNum}${section}`;

      // Get sections for this semester
      const { data: sections } = await supabase.from('sections').select('id, name');
      const semSectionIds = (sections || [])
        .filter((sec) => sec.name === targetSectionName)
        .map((sec) => sec.id);

      // Get students in these sections
      const { data: students } = await supabase
        .from('students')
        .select('id')
        .in('section_id', semSectionIds);
      const studentIds = (students || []).map((s) => s.id);

      const { data } = await supabase
        .from('quiz_attempts')
        .select('score')
        .in('student_id', studentIds)
        .not('score', 'is', null);

      if (!data) return [];
      return data.map((row: { score: number }) => row.score);
    },
  };

  return <AnalyticsView key={`${semester}-${section}`} dataProvider={dataProvider} />;
}
