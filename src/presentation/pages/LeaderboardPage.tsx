import LeaderboardView, { type LeaderboardPersistence } from '@presentation/views/LeaderboardView';
import { createLeaderboardAccess } from '@data/access/leaderboardAccess';
import { supabase } from '@data/supabase';
import { useSelectedSemester, useSelectedSection, mapSemesterToDb } from '@presentation/hooks';
import type { StudentMetrics } from '@domain/services/leaderboardService';

const leaderboardAccess = createLeaderboardAccess(supabase);

const persistence: LeaderboardPersistence = {
  loadConfig: () => leaderboardAccess.loadConfig(),
  saveConfig: (config) => leaderboardAccess.saveConfig(config),

  async loadStudentMetrics(): Promise<StudentMetrics[]> {
    const sem = localStorage.getItem('mis_selected_semester') || 'Semester 5';
    const section = localStorage.getItem('mis_selected_section') || 'A';
    const dbSemester = mapSemesterToDb(sem);
    const semNum = dbSemester[0];
    const targetSectionName = `CS-${semNum}${section}`;

    // Get sections for this semester
    const { data: sections } = await supabase.from('sections').select('id, name');
    const semSectionIds = (sections || [])
      .filter((sec) => sec.name === targetSectionName)
      .map((sec) => sec.id);

    // Load students in these sections
    const { data: students } = await supabase
      .from('students')
      .select('id, name')
      .in('section_id', semSectionIds);

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
};

export default function LeaderboardPage() {
  const semester = useSelectedSemester();
  const section = useSelectedSection();

  return <LeaderboardView key={`${semester}-${section}`} persistence={persistence} />;
}
