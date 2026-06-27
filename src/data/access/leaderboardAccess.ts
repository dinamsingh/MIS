/**
 * Leaderboard data-access wrapper (task 16.2).
 *
 * Binds the pure `leaderboardService` to the `leaderboard_config` table: the
 * enable flag and the teacher-defined weightages are read/written via
 * parameterized queries, and ranking is computed from freshly-supplied metrics
 * with the re-exported pure `rankStudents`, so each load reflects the current
 * data and weightages (Requirement 11.5).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import {
  combinedScore,
  rankStudents,
  type LeaderboardWeights,
  type StudentMetrics,
} from '../../domain/services/leaderboardService';
import { toLeaderboardWeights, type LeaderboardConfigRow } from './rows';
import { expectOk, unwrap } from './support';

export { combinedScore, rankStudents };

/** The persisted leaderboard configuration. */
export interface LeaderboardConfig {
  readonly enabled: boolean;
  readonly weights: LeaderboardWeights;
}

/** The default configuration used when no row has been saved yet. */
const DEFAULT_CONFIG: LeaderboardConfig = {
  enabled: false,
  weights: { internalMarks: 0, quizScores: 0, attendance: 0 },
};

/** Supabase-backed leaderboard operations. */
export interface LeaderboardAccess {
  /** Load the enable flag and weightages (Requirements 11.1, 11.3). */
  loadConfig(): Promise<LeaderboardConfig>;
  /** Persist the enable flag and weightages (Requirements 11.1, 11.3). */
  saveConfig(config: LeaderboardConfig): Promise<void>;
  /**
   * Rank the supplied student metrics with the loaded weightages, recomputing
   * from scratch so the ranking reflects current data (Requirements 11.4,
   * 11.5, 11.6).
   */
  rank(metrics: StudentMetrics[]): Promise<StudentMetrics[]>;
}

interface ConfigIdRow extends LeaderboardConfigRow {
  readonly id: string;
}

/** Create a {@link LeaderboardAccess} bound to the given Supabase client. */
export function createLeaderboardAccess(
  client: SupabaseClient = defaultClient,
): LeaderboardAccess {
  async function readConfigRow(): Promise<ConfigIdRow | null> {
    return unwrap(
      await client
        .from('leaderboard_config')
        .select('id, enabled, weight_internal, weight_quiz, weight_attendance')
        .limit(1)
        .maybeSingle(),
    ) as ConfigIdRow | null;
  }

  async function loadConfig(): Promise<LeaderboardConfig> {
    const row = await readConfigRow();
    if (row === null) {
      return DEFAULT_CONFIG;
    }
    return { enabled: row.enabled, weights: toLeaderboardWeights(row) };
  }

  return {
    loadConfig,

    async saveConfig(config: LeaderboardConfig): Promise<void> {
      const existing = await readConfigRow();
      const row = {
        ...(existing !== null ? { id: existing.id } : {}),
        enabled: config.enabled,
        weight_internal: config.weights.internalMarks,
        weight_quiz: config.weights.quizScores,
        weight_attendance: config.weights.attendance,
      };
      expectOk(await client.from('leaderboard_config').upsert(row));
    },

    async rank(metrics: StudentMetrics[]): Promise<StudentMetrics[]> {
      const { weights } = await loadConfig();
      return rankStudents(metrics, weights);
    },
  };
}
