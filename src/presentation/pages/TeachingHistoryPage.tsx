/**
 * Connected page wrapper for TeachingHistoryView (task 18.1).
 *
 * Loads the current teacher's own historical (past-semester/graduated)
 * attendance/marks/quiz records via the owner-scoped
 * `teachingHistoryAccess.ts` wrapper and hands them to the purely
 * presentational `TeachingHistoryView`. Follows the same Page/View split as
 * `RosterPage`/`RosterView`, `AttendanceReportPage`/its view, etc.
 */

import { useCallback, useEffect, useState } from 'react';
import { createTeachingHistoryAccess, type HistoricalRecordRow } from '@data/access/teachingHistoryAccess';
import { supabase } from '@data/supabase';
import TeachingHistoryView from '@presentation/views/TeachingHistoryView';

const access = createTeachingHistoryAccess(supabase);

export default function TeachingHistoryPage() {
  const [records, setRecords] = useState<HistoricalRecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);

    void access
      .loadHistoricalRecords()
      .then((rows) => {
        if (!active) return;
        setRecords(rows);
      })
      .catch(() => {
        if (!active) return;
        setRecords([]);
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
    <TeachingHistoryView
      records={records}
      loading={loading}
      loadError={loadError}
      onRetry={load}
    />
  );
}
