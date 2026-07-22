/**
 * Connected page wrapper for MyScheduleView (task 26.2).
 *
 * Fetches the current teacher's unified weekly schedule via
 * `fetchMySchedule` (which aggregates across ALL of their
 * `teacher_assignments` — Requirement 17.1) and passes the result to the
 * purely presentational `MyScheduleView`.
 *
 * Deliberately does NOT touch `SelectedSectionContext` or any
 * single-section-scoped page (Requirement 17.4).
 */

import { useCallback, useEffect, useState } from 'react';
import { fetchMySchedule, type MyScheduleCell } from '@data/access/mySchedule';
import MyScheduleView from '@presentation/views/MyScheduleView';

export default function MySchedulePage() {
  const [cells, setCells] = useState<MyScheduleCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);

    void fetchMySchedule()
      .then((result) => {
        if (!active) return;
        setCells(result);
      })
      .catch(() => {
        if (!active) return;
        setCells([]);
        setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  return (
    <MyScheduleView
      cells={cells}
      loading={loading}
      loadError={loadError}
      onRetry={load}
    />
  );
}
