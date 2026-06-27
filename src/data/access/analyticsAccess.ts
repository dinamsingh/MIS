/**
 * Analytics data-access wrapper (task 16.2).
 *
 * Binds the pure `analyticsService` to the `settings` table for the
 * configurable Performance_Threshold (default 60, Requirement 12.1) and exposes
 * loaders that return the raw series the charts need. The chart math
 * (class average, grade distribution, lowest-scoring unit, at-risk) stays in
 * the re-exported pure functions, which yield defined zero/empty results for
 * empty inputs so the UI renders an empty-state message rather than an error
 * (Requirement 12.6).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import {
  classAverage,
  gradeDistribution,
  lowestScoringUnit,
  isAtRisk,
  DEFAULT_PERFORMANCE_THRESHOLD,
  type UnitAverage,
} from '../../domain/services/analyticsService';
import { expectOk, unwrap, unwrapList } from './support';

export {
  classAverage,
  gradeDistribution,
  lowestScoringUnit,
  isAtRisk,
  DEFAULT_PERFORMANCE_THRESHOLD,
  type UnitAverage,
};

/** Supabase-backed analytics operations. */
export interface AnalyticsAccess {
  /** Load the Performance_Threshold, defaulting to 60 percent (Requirement 12.1). */
  loadThreshold(): Promise<number>;
  /** Persist a new Performance_Threshold (Requirement 12.5). */
  saveThreshold(threshold: number): Promise<void>;
  /**
   * Load each student's latest Internal_Marks snapshot, for the class-average
   * chart. Returns an empty array when no marks exist (Requirements 12.2, 12.6).
   */
  loadInternalMarks(): Promise<number[]>;
}

interface SettingsRow {
  readonly id: string;
  readonly performance_threshold: number | null;
}

interface InternalMarksRow {
  readonly student_id: string;
  readonly internal_marks_snapshot: number | null;
}

/** Create an {@link AnalyticsAccess} bound to the given Supabase client. */
export function createAnalyticsAccess(
  client: SupabaseClient = defaultClient,
): AnalyticsAccess {
  async function readSettingsRow(): Promise<SettingsRow | null> {
    return unwrap(
      await client
        .from('settings')
        .select('id, performance_threshold')
        .limit(1)
        .maybeSingle(),
    ) as SettingsRow | null;
  }

  return {
    async loadThreshold(): Promise<number> {
      const row = await readSettingsRow();
      return row?.performance_threshold ?? DEFAULT_PERFORMANCE_THRESHOLD;
    },

    async saveThreshold(threshold: number): Promise<void> {
      const existing = await readSettingsRow();
      const row = {
        ...(existing !== null ? { id: existing.id } : {}),
        performance_threshold: threshold,
      };
      expectOk(await client.from('settings').upsert(row));
    },

    async loadInternalMarks(): Promise<number[]> {
      const rows = unwrapList(
        await client.from('mark_values').select('student_id, internal_marks_snapshot'),
      ) as InternalMarksRow[];

      // Collapse to the latest snapshot per student (the snapshot is identical
      // across a student's component rows; dedupe so the average is per-student).
      const byStudent = new Map<string, number>();
      for (const row of rows) {
        if (row.internal_marks_snapshot !== null) {
          byStudent.set(row.student_id, row.internal_marks_snapshot);
        }
      }
      return Array.from(byStudent.values());
    },
  };
}
