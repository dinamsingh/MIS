/**
 * Connected page wrapper for LeaderboardView.
 * Wires Supabase-backed leaderboardAccess as the LeaderboardPersistence.
 */

import LeaderboardView, { type LeaderboardPersistence } from '@presentation/views/LeaderboardView';
import { createLeaderboardAccess } from '@data/access/leaderboardAccess';
import { supabase } from '@data/supabase';
import type { StudentMetrics } from '@domain/services/leaderboardService';

const leaderboardAccess = createLeaderboardAccess(supabase);

const persistence: LeaderboardPersistence = {
  loadConfig: () => leaderboardAccess.loadConfig(),
  saveConfig: (config) => leaderboardAccess.saveConfig(config),

  async loadStudentMetrics(): Promise<StudentMetrics[]> {
    // Load students and aggregate their metrics from the database
    const { data: students } = await supabase
      .from('student_roster')
      .select('id, name');
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
  return <LeaderboardView persistence={persistence} />;
}
