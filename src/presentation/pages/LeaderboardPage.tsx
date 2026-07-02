import { useMemo } from 'react';
import LeaderboardView, { type LeaderboardPersistence } from '@presentation/views/LeaderboardView';
import { createLeaderboardAccess } from '@data/access/leaderboardAccess';
import {
  buildDemoStudentMetrics,
  isLocalDemoMode,
  loadDemoLeaderboardConfig,
  saveDemoLeaderboardConfig,
  type DemoStudent,
} from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { formatSectionLabel } from '@presentation/format/sectionLabel';
import type { StudentMetrics } from '@domain/services/leaderboardService';

const leaderboardAccess = createLeaderboardAccess(supabase);

export default function LeaderboardPage() {
  const { selectedSection } = useSelectedSection();
  const sectionId = selectedSection?.id ?? null;

  const persistence = useMemo<LeaderboardPersistence>(
    () => ({
      loadConfig: () =>
        isLocalDemoMode() ? Promise.resolve(loadDemoLeaderboardConfig()) : leaderboardAccess.loadConfig(),
      saveConfig: (config) => {
        if (isLocalDemoMode()) {
          saveDemoLeaderboardConfig(config);
          return Promise.resolve();
        }
        return leaderboardAccess.saveConfig(config);
      },

      async loadStudentMetrics(): Promise<StudentMetrics[]> {
        if (!sectionId) return [];

        if (isLocalDemoMode()) {
          const { data: students } = await supabase
            .from('students')
            .select('id, name, enrollment_number')
            .eq('section_id', sectionId)
            .order('name');
          const roster = ((students ?? []) as Array<{
            id: string;
            name: string;
            enrollment_number?: string | null;
          }>).map<DemoStudent>((student) => ({
            id: student.id,
            name: student.name,
            enrollmentNumber: student.enrollment_number ?? undefined,
            sectionName: selectedSection ? formatSectionLabel(selectedSection) : undefined,
          }));
          return buildDemoStudentMetrics(roster, selectedSection ? formatSectionLabel(selectedSection) : undefined);
        }

        // Load students in the globally-selected section.
        const { data: students } = await supabase
          .from('students')
          .select('id, name')
          .eq('section_id', sectionId);

        if (!students || students.length === 0) return [];

        const metrics: StudentMetrics[] = [];
        for (const student of students) {
          const s = student as { id: string; name: string };
          // Internal marks: latest snapshot from mark_values
          const { data: markRows } = await supabase
            .from('mark_values')
            .select('internal_marks_snapshot')
            .eq('student_id', s.id)
            .limit(1);
          const internalMarks = markRows?.[0]?.internal_marks_snapshot ?? 0;

          // Quiz scores: average
          const { data: quizRows } = await supabase
            .from('quiz_attempts')
            .select('score')
            .eq('student_id', s.id);
          const quizScores = quizRows && quizRows.length > 0
            ? quizRows.reduce((sum: number, r: { score: number }) => sum + (r.score ?? 0), 0) / quizRows.length
            : 0;

          // Attendance: percentage
          const { data: attRows } = await supabase
            .from('attendance')
            .select('present')
            .eq('student_id', s.id);
          const attendance = attRows && attRows.length > 0
            ? (attRows.filter((r: { present: boolean }) => r.present).length / attRows.length) * 100
            : 0;

          metrics.push({
            studentId: s.id,
            name: s.name,
            internalMarks: internalMarks as number,
            quizScore: quizScores,
            attendancePercent: attendance,
          });
        }
        return metrics;
      },
    }),
    [sectionId, selectedSection],
  );

  return <LeaderboardView key={sectionId ?? 'none'} persistence={persistence} />;
}
