/**
 * Admin Batch Promotion page — list all batches and promote them.
 *
 * Lists all batches with current semester and status. Each batch has a
 * "Promote" button calling the `promote_batch` RPC. Graduated batches
 * (sem 8, status 'graduated') display a badge instead of a button.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@data/supabase';
import { messages } from '@domain/shared/messages';
import { Card, CardContent, CardHeader, CardTitle, SectionHeader, Button } from '@presentation/components/ui/foundation';
import { Badge, EmptyState, ErrorState, LoadingSpinner } from '@presentation/components/ui/data-display';

interface BatchRow {
  id: string;
  start_year: number;
  current_sem: number;
  status: string;
}

interface PromoteResult {
  status: string;
  batchId?: string;
  newSem?: number;
  newStatus?: string;
  reason?: string;
}

export default function AdminBatchPromotionPage() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoteSuccess, setPromoteSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('batches')
        .select('id, start_year, current_sem, status')
        .order('start_year', { ascending: false });
      if (error) throw error;
      setBatches(data ?? []);
    } catch {
      setLoadError(messages.error.network);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePromote = useCallback(async (batch: BatchRow) => {
    const isGraduation = batch.current_sem >= 8;
    const confirmed = window.confirm(
      isGraduation
        ? messages.batchPromotion.confirmGraduate(batch.id)
        : messages.batchPromotion.confirmPromote(batch.id, batch.current_sem),
    );
    if (!confirmed) return;

    setPromotingId(batch.id);
    setPromoteError(null);
    setPromoteSuccess(null);

    try {
      const { data, error } = await supabase.rpc('promote_batch', { p_batch_id: batch.id });
      if (error) throw error;

      const result = data as PromoteResult;
      if (result.status === 'promoted') {
        setPromoteSuccess(messages.batchPromotion.promoteSuccess(batch.id, result.newSem ?? batch.current_sem + 1));
        void load();
      } else if (result.status === 'graduated') {
        setPromoteSuccess(messages.batchPromotion.graduateSuccess(batch.id));
        void load();
      } else {
        setPromoteError(messages.batchPromotion.promoteFailed);
      }
    } catch {
      setPromoteError(messages.batchPromotion.promoteFailed);
    } finally {
      setPromotingId(null);
    }
  }, [load]);

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Admin Console"
        title={messages.batchPromotion.title}
        description={messages.batchPromotion.description}
      />

      {promoteSuccess && (
        <div className="rounded-control border border-status-green/30 bg-status-green/5 px-3 py-2 text-sm text-status-green">
          {promoteSuccess}
        </div>
      )}
      {promoteError && (
        <div className="rounded-control border border-status-red/30 bg-status-red/5 px-3 py-2 text-sm text-status-red">
          {promoteError}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Batches</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex min-h-48 items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : loadError ? (
            <ErrorState kind="network" title="Unable to load batches" message={loadError} onAction={load} className="min-h-64 border-0 shadow-none" />
          ) : batches.length === 0 ? (
            <EmptyState title={messages.batchPromotion.noBatches} message="Batches appear here once sessions are created." />
          ) : (
            <div className="table-scroll">
              <table className="table-base">
                <thead className="table-head">
                  <tr>
                    <th className="table-header-cell text-left">Batch Code</th>
                    <th className="table-header-cell text-left">Start Year</th>
                    <th className="table-header-cell text-left">Current Semester</th>
                    <th className="table-header-cell text-left">Status</th>
                    <th className="table-header-cell text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => {
                    const isGraduated = batch.status === 'graduated';
                    return (
                      <tr key={batch.id} className="table-row">
                        <td className="table-cell">
                          <p className="font-medium text-text">{batch.id}</p>
                        </td>
                        <td className="table-cell text-sm text-muted">{batch.start_year}</td>
                        <td className="table-cell text-sm text-text">{batch.current_sem}</td>
                        <td className="table-cell">
                          <Badge
                            tone={isGraduated ? 'success' : batch.status === 'exams' ? 'warning' : 'info'}
                            size="sm"
                          >
                            {isGraduated ? '🎓 Graduated' : batch.status}
                          </Badge>
                        </td>
                        <td className="table-cell text-right">
                          {isGraduated ? (
                            <Badge tone="success" size="sm">Completed</Badge>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              loading={promotingId === batch.id}
                              disabled={promotingId !== null && promotingId !== batch.id}
                              onClick={() => void handlePromote(batch)}
                            >
                              {batch.current_sem >= 8 ? 'Graduate' : 'Promote'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
