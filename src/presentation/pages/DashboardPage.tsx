/**
 * Connected page wrapper for DashboardView.
 * Wires a DashboardDataProvider that aggregates data from multiple access layers.
 */

import DashboardView, { type DashboardDataProvider, type DashboardSummary, type AttendanceTrendPoint } from '@presentation/views/DashboardView';
import { createTimetableAccess } from '@data/access/timetableAccess';
import { createLeaderboardAccess } from '@data/access/leaderboardAccess';
import { supabase } from '@data/supabase';
import type { TimetableEntry } from '@domain/services/timetableService';
import type { LeaderboardWeights, StudentMetrics } from '@domain/services/leaderboardService';

const timetableAccess = createTimetableAccess(supabase);
const leaderboardAccess = createLeaderboardAccess(supabase);

const dataProvider: DashboardDataProvider = {
  async loadSummary(): Promise<DashboardSummary> {
    const [studentsRes, attendanceRes, marksRes, topicsRes] = await Promise.all([
      supabase.from('student_roster').select('id', { count: 'exact', head: true }),
      supabase.from('attendance').select('present'),
      supabase.from('mark_values').select('student_id, internal_marks_snapshot'),
      supabase.from('topics').select('id, complete'),
    ]);

    const totalStudents = studentsRes.count ?? 0;

    // Average attendance
    const attData = attendanceRes.data ?? [];
    const avgAttendancePercent = attData.length > 0
      ? (attData.filter((r: { present: boolean }) => r.present).length / attData.length) * 100
      : 0;

    // Average internal marks (per student, deduplicated)
    const marksData = marksRes.data ?? [];
    const byStudent = new Map<string, number>();
    for (const row of marksData) {
      const r = row as { student_id: string; internal_marks_snapshot: number | null };
      if (r.internal_marks_snapshot !== null) {
        byStudent.set(r.student_id, r.internal_marks_snapshot);
      }
    }
    const avgInternalMarks = byStudent.size > 0
      ? Array.from(byStudent.values()).reduce((a, b) => a + b, 0) / byStudent.size
      : 0;

    // Syllabus progress
    const topicsData = topicsRes.data ?? [];
    const syllabusProgressPercent = topicsData.length > 0
      ? (topicsData.filter((t: { complete: boolean }) => t.complete).length / topicsData.length) * 100
      : 0;

    return { totalStudents, avgAttendancePercent, avgInternalMarks, syllabusProgressPercent };
  },

  async loadTimetableEntries(): Promise<TimetableEntry[]> {
    // Load all entries for the first section (teacher's primary view)
    const { data: sections } = await supabase.from('sections').select('id').limit(1);
    if (!sections || sections.length === 0) return [];
    return timetableAccess.listEntries((sections[0] as { id: string }).id);
  },

  async loadAttendanceTrend(fromDate: string, toDate: string): Promise<AttendanceTrendPoint[]> {
    const { data } = await supabase
      .from('attendance')
      .select('date, present')
      .gte('date', fromDate)
      .lte('date', toDate);
    if (!data || data.length === 0) return [];

    // Group by date and compute daily percentage
    const byDate = new Map<string, { present: number; total: number }>();
    for (const row of data) {
      const r = row as { date: string; present: boolean };
      const entry = byDate.get(r.date) ?? { present: 0, total: 0 };
      entry.total += 1;
      if (r.present) entry.present += 1;
      byDate.set(r.date, entry);
    }
    return Array.from(byDate.entries())
      .map(([date, { present, total }]) => ({ date, percent: (present / total) * 100 }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  async loadStudentMetrics(): Promise<StudentMetrics[]> {
    const { data: students } = await supabase.from('student_roster').select('id, name');
    if (!students || students.length === 0) return [];

    const metrics: StudentMetrics[] = [];
    for (const student of students) {
      const s = student as { id: string; name: string };
      const { data: markRows } = await supabase
        .from('mark_values')
        .select('internal_marks_snapshot')
        .eq('student_id', s.id)
        .limit(1);
      const internalMarks = (markRows?.[0]?.internal_marks_snapshot as number) ?? 0;

      const { data: quizRows } = await supabase
        .from('quiz_attempts')
        .select('score')
        .eq('student_id', s.id);
      const quizScores = quizRows && quizRows.length > 0
        ? quizRows.reduce((sum: number, r: { score: number }) => sum + (r.score ?? 0), 0) / quizRows.length
        : 0;

      const { data: attRows } = await supabase
        .from('attendance')
        .select('present')
        .eq('student_id', s.id);
      const attendance = attRows && attRows.length > 0
        ? (attRows.filter((r: { present: boolean }) => r.present).length / attRows.length) * 100
        : 0;

      metrics.push({ studentId: s.id, name: s.name, internalMarks, quizScore: quizScores, attendancePercent: attendance });
    }
    return metrics;
  },

  async loadWeights(): Promise<LeaderboardWeights> {
    const config = await leaderboardAccess.loadConfig();
    return config.weights;
  },
};

export default function DashboardPage() {
  return <DashboardView dataProvider={dataProvider} />;
}
