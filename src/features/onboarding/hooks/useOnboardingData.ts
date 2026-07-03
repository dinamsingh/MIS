/**
 * Loads the data the wizard needs: the live batches plus the syllabus subjects
 * that apply to each batch's current semester.
 *
 * The derived rule: for each live batch, show subjects where
 * `syllabus_subjects.sem === batch.current_sem`.
 */

import { useEffect, useMemo, useState } from 'react';
import { fetchLiveBatches, fetchSubjectsForSems } from '../api/onboarding';
import type { Batch, BatchWithSubjects, SyllabusSubject } from '../types';

export interface OnboardingData {
  readonly loading: boolean;
  readonly error: string | null;
  readonly batches: readonly Batch[];
  /** All subjects loaded (across the live sems), for assignment building. */
  readonly subjects: readonly SyllabusSubject[];
  /** Live batches paired with their current-semester subjects. */
  readonly batchesWithSubjects: readonly BatchWithSubjects[];
}

export function useOnboardingData(): OnboardingData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState<readonly Batch[]>([]);
  const [subjects, setSubjects] = useState<readonly SyllabusSubject[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      const liveBatches = await fetchLiveBatches();
      const sems = liveBatches.map((b) => b.currentSem);
      const loadedSubjects = await fetchSubjectsForSems(sems);
      if (active) {
        setBatches(liveBatches);
        setSubjects(loadedSubjects);
        setLoading(false);
      }
    })().catch((err: unknown) => {
      if (active) {
        setError(err instanceof Error ? err.message : 'Failed to load onboarding data.');
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const batchesWithSubjects = useMemo<BatchWithSubjects[]>(
    () =>
      batches.map((batch) => ({
        batch,
        subjects: subjects.filter((s) => s.sem === batch.currentSem),
      })),
    [batches, subjects],
  );

  return { loading, error, batches, subjects, batchesWithSubjects };
}
