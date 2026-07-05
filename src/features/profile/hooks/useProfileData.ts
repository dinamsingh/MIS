/**
 * Loads the data the Profile page's teaching-setup editor needs:
 *  - every live batch (with its real current semester),
 *  - the syllabus subjects for those semesters, and
 *  - the teacher's CURRENT selection (so the editor is pre-filled).
 *
 * This shows all of the teacher's live batches at once and lets them add or
 * remove subjects/sections — the "edit my whole setup" flow (Decision B).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  fetchCurrentSelection,
  fetchLiveBatches,
  fetchSubjectsForSems,
} from '../../onboarding/api/onboarding';
import type {
  BatchWithSubjects,
  SelectionState,
  SyllabusSubject,
} from '../../onboarding/types';

export interface ProfileData {
  readonly loading: boolean;
  readonly error: string | null;
  /** All subjects loaded across the live sems (for buildAssignments). */
  readonly subjects: readonly SyllabusSubject[];
  /** Live batches paired with their current-semester subjects. */
  readonly batchesWithSubjects: readonly BatchWithSubjects[];
  /** The teacher's saved selection, used to seed the editor once. */
  readonly initialSelection: SelectionState;
}

export function useProfileData(): ProfileData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<readonly SyllabusSubject[]>([]);
  const [batchesWithSubjects, setBatchesWithSubjects] = useState<readonly BatchWithSubjects[]>([]);
  const [initialSelection, setInitialSelection] = useState<SelectionState>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      const batches = await fetchLiveBatches();
      const sems = Array.from(new Set(batches.map((b) => b.currentSem)));
      const [loadedSubjects, selection] = await Promise.all([
        fetchSubjectsForSems(sems),
        fetchCurrentSelection(),
      ]);
      if (!active) return;
      setSubjects(loadedSubjects);
      setBatchesWithSubjects(
        batches.map((batch) => ({
          batch,
          subjects: loadedSubjects.filter((s) => s.sem === batch.currentSem),
        })),
      );
      setInitialSelection(selection);
      setLoading(false);
    })().catch((err: unknown) => {
      if (active) {
        setError(err instanceof Error ? err.message : 'Profile data load nahi ho paaya.');
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return useMemo(
    () => ({ loading, error, subjects, batchesWithSubjects, initialSelection }),
    [loading, error, subjects, batchesWithSubjects, initialSelection],
  );
}
