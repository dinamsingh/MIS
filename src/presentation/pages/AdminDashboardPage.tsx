/**
 * Admin Dashboard page — overview of institution-wide stats.
 *
 * Shows total counts of teachers, students, sections, and batches via
 * simple Supabase count queries. Only accessible to admin-role users.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@data/supabase';
import { messages } from '@domain/shared/messages';
import { SectionHeader, StatsCard } from '@presentation/components/ui/foundation';
import { ErrorState, LoadingSpinner } from '@presentation/components/ui/data-display';

interface DashboardStats {
  totalTeachers: number;
  totalStudents: number;
  totalSections: number;
  totalBatches: number;
}

async function fetchAdminStats(): Promise<DashboardStats> {
  const [teachersRes, studentsRes, sectionsRes, batchesRes] = await Promise.all([
    supabase.from('teachers').select('*', { count: 'exact', head: true }),
    supabase.from('students').select('*', { count: 'exact', head: true }),
    supabase.from('sections').select('*', { count: 'exact', head: true }),
    supabase.from('batches').select('*', { count: 'exact', head: true }),
  ]);

  return {
    totalTeachers: teachersRes.count ?? 0,
    totalStudents: studentsRes.count ?? 0,
    totalSections: sectionsRes.count ?? 0,
    totalBatches: batchesRes.count ?? 0,
  };
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminStats();
      setStats(data);
    } catch {
      setError(messages.adminDashboard.loadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-5">
        <SectionHeader
          eyebrow="Admin Console"
          title={messages.adminDashboard.title}
          description={messages.adminDashboard.description}
        />
        <div className="flex min-h-48 items-center justify-center">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="space-y-5">
        <SectionHeader
          eyebrow="Admin Console"
          title={messages.adminDashboard.title}
          description={messages.adminDashboard.description}
        />
        <ErrorState
          kind="network"
          title="Unable to load stats"
          message={error ?? messages.error.generic}
          onAction={load}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Admin Console"
        title={messages.adminDashboard.title}
        description={messages.adminDashboard.description}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          icon="👤"
          label={messages.adminDashboard.totalTeachers}
          value={stats.totalTeachers}
          tone="info"
        />
        <StatsCard
          icon="🎓"
          label={messages.adminDashboard.totalStudents}
          value={stats.totalStudents}
          tone="success"
        />
        <StatsCard
          icon="📚"
          label={messages.adminDashboard.totalSections}
          value={stats.totalSections}
          tone="warning"
        />
        <StatsCard
          icon="📦"
          label={messages.adminDashboard.totalBatches}
          value={stats.totalBatches}
          tone="neutral"
        />
      </div>
    </div>
  );
}
