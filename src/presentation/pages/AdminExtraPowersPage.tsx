/**
 * Admin Console — Extra Powers page (task 6.3).
 *
 * Lists every `public.teachers` row alongside a toggle for each of the two
 * delegated Extra_Power kinds (`cross_section_visibility`,
 * `teacher_allowlist_approval`). Toggling ON calls
 * `grant_teacher_extra_power(email, power)`; toggling OFF calls
 * `revoke_teacher_extra_power(email, power)` — both `is_admin()`-gated
 * `SECURITY DEFINER` RPCs (migration `0044_teacher_extra_powers.sql`).
 *
 * This page is admin-only by construction: it is reachable only through
 * `AdminShell`'s `RequireAdmin` guard in `App.tsx`. Per `design.md`'s Phase 1
 * UI notes, no teacher — even one holding an Extra_Power — may reach this
 * page; only admins grant/revoke (Requirement 3.6), so no additional
 * client-side admin check is added inside this component beyond the route
 * guard already in place.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@data/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@presentation/components/ui/foundation';
import { SectionHeader } from '@presentation/components/ui/foundation';
import { EmptyState, ErrorState, LoadingSpinner } from '@presentation/components/ui/data-display';
import { Switch } from '@presentation/components/ui/forms';

const POWERS = [
  { key: 'cross_section_visibility', label: 'Cross-Section Visibility' },
  { key: 'teacher_allowlist_approval', label: 'Teacher Allowlist Approval' },
] as const;

type PowerKey = (typeof POWERS)[number]['key'];

interface TeacherRow {
  readonly id: string;
  readonly name: string | null;
  readonly email: string | null;
}

interface ExtraPowerRow {
  readonly teacher_id: string;
  readonly power_name: string;
}

/** `${teacherId}:${powerName}` key while a grant/revoke call is in flight. */
type PendingKey = string;

export default function AdminExtraPowersPage() {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [grants, setGrants] = useState<ExtraPowerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ReadonlySet<PendingKey>>(new Set());
  const [toggleError, setToggleError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teachersResult, grantsResult] = await Promise.all([
        supabase.from('teachers').select('id, name, email').order('name', { ascending: true }),
        supabase.from('teacher_extra_powers').select('teacher_id, power_name'),
      ]);

      if (teachersResult.error) throw teachersResult.error;
      if (grantsResult.error) throw grantsResult.error;

      setTeachers((teachersResult.data ?? []) as TeacherRow[]);
      setGrants((grantsResult.data ?? []) as ExtraPowerRow[]);
    } catch {
      setError('Could not load teachers and their Extra Powers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasPower = useCallback(
    (teacherId: string, powerName: PowerKey): boolean =>
      grants.some((row) => row.teacher_id === teacherId && row.power_name === powerName),
    [grants],
  );

  const handleToggle = useCallback(
    async (teacher: TeacherRow, powerName: PowerKey, nextValue: boolean) => {
      if (!teacher.email) return;
      const key: PendingKey = `${teacher.id}:${powerName}`;
      setToggleError(null);
      setPending((current) => new Set(current).add(key));

      try {
        const rpcName = nextValue ? 'grant_teacher_extra_power' : 'revoke_teacher_extra_power';
        const { data, error: rpcError } = await supabase.rpc(rpcName, {
          p_teacher_email: teacher.email,
          p_power: powerName,
        });

        if (rpcError) throw rpcError;

        const status = (data as { status?: string } | null)?.status;
        if (status !== 'granted' && status !== 'revoked') {
          setToggleError(`Could not update ${teacher.name ?? teacher.email}'s power. Please try again.`);
          return;
        }

        // Optimistically update the grants list to reflect the new state.
        setGrants((current) => {
          if (nextValue) {
            if (current.some((row) => row.teacher_id === teacher.id && row.power_name === powerName)) {
              return current;
            }
            return [...current, { teacher_id: teacher.id, power_name: powerName }];
          }
          return current.filter((row) => !(row.teacher_id === teacher.id && row.power_name === powerName));
        });
      } catch {
        setToggleError(`Could not update ${teacher.name ?? teacher.email}'s power. Please try again.`);
      } finally {
        setPending((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [],
  );

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Admin Console"
        title="Extra Powers"
        description="Grant or revoke delegated Extra Powers on a per-teacher basis. Only admins may change these."
      />

      <Card>
        <CardHeader>
          <CardTitle>Teachers</CardTitle>
        </CardHeader>
        <CardContent>
          {toggleError && (
            <p className="mb-4 rounded-control border border-status-red/30 bg-status-red/5 px-3 py-2 text-sm text-status-red">
              {toggleError}
            </p>
          )}

          {loading ? (
            <div className="flex min-h-48 items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : error ? (
            <ErrorState kind="network" title="Unable to load teachers" message={error} onAction={load} className="min-h-64 border-0 shadow-none" />
          ) : teachers.length === 0 ? (
            <EmptyState title="No teachers yet" message="Teachers will appear here once they are approved and onboarded." />
          ) : (
            <div className="table-scroll">
              <table className="table-base">
                <thead className="table-head">
                  <tr>
                    <th className="table-header-cell text-left">Teacher</th>
                    {POWERS.map((power) => (
                      <th key={power.key} className="table-header-cell text-left">
                        {power.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((teacher) => (
                    <tr key={teacher.id} className="table-row">
                      <td className="table-cell">
                        <p className="font-medium text-text">{teacher.name ?? 'Unnamed teacher'}</p>
                        <p className="text-xs text-muted">{teacher.email ?? 'No email on file'}</p>
                      </td>
                      {POWERS.map((power) => {
                        const key: PendingKey = `${teacher.id}:${power.key}`;
                        return (
                          <td key={power.key} className="table-cell">
                            <Switch
                              aria-label={`${power.label} for ${teacher.name ?? teacher.email ?? teacher.id}`}
                              checked={hasPower(teacher.id, power.key)}
                              disabled={pending.has(key) || !teacher.email}
                              onChange={(event) => {
                                void handleToggle(teacher, power.key, event.currentTarget.checked);
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
