/**
 * Connected page wrapper for AnalyticsView.
 * Wires the Supabase-backed analyticsAccess as the AnalyticsDataProvider.
 */

import AnalyticsView, { type AnalyticsDataProvider } from '@presentation/views/AnalyticsView';
import { createAnalyticsAccess } from '@data/access/analyticsAccess';
import { supabase } from '@data/supabase';
import type { UnitAverage } from '@domain/services/analyticsService';

const analyticsAccess = createAnalyticsAccess(supabase);

const dataProvider: AnalyticsDataProvider = {
  loadThreshold: () => analyticsAccess.loadThreshold(),
  saveThreshold: (threshold: number) => analyticsAccess.saveThreshold(threshold),
  loadInternalMarks: () => analyticsAccess.loadInternalMarks(),

  async loadUnitAverages(): Promise<UnitAverage[]> {
    // Load quiz attempts grouped by unit for unit-wise averages
    const { data } = await supabase
      .from('quiz_attempts')
      .select('quiz_id, score, quizzes!inner(unit_id)')
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
    const { data } = await supabase
      .from('quiz_attempts')
      .select('score')
      .not('score', 'is', null);
    if (!data) return [];
    return data.map((row: { score: number }) => row.score);
  },
};

export default function AnalyticsPage() {
  return <AnalyticsView dataProvider={dataProvider} />;
}
