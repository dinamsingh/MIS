/**
 * Admin Console — Manage Admins page (task 6.4).
 *
 * Lists every `public.admins` row (email, `added_by`, `created_at`) —
 * readable by any signed-in admin per the `admins_read` RLS policy
 * (migration 0043). Adding an email calls `add_admin(email)`; removing a row
 * calls `remove_admin(email)`, both `is_admin()`-gated `SECURITY DEFINER`
 * RPCs.
 *
 * `remove_admin()`'s structured denials are surfaced inline rather than as a
 * raw error:
 *  - `{status: 'denied', reason: 'last-admin'}` — the sole remaining admin
 *    row; shown via the new `messages.admin.lastAdminProtected` catalog
 *    entry (Requirement 1.6).
 *  - `{status: 'denied', reason: 'not-admin'}` — shouldn't normally happen
 *    since this page sits behind `RequireAdmin`, but handled defensively.
 *  - `{status: 'not-found'}` — the row was already removed elsewhere.
 *
 * This page is admin-only by construction: it is reachable only through
 * `AdminShell`'s `RequireAdmin` guard in `App.tsx`.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@data/supabase';
import { messages } from '@domain/shared/messages';
import { Card, CardContent, CardHeader, CardTitle, SectionHeader, Button } from '@presentation/components/ui/foundation';
import { EmptyState, ErrorState, LoadingSpinner } from '@presentation/components/ui/data-display';
import { Input } from '@presentation/components/ui/forms';

interface AdminRow {
  readonly email: string;
  readonly added_by: string | null;
  readonly created_at: string;
}

/** Shape returned by both `add_admin()` and `remove_admin()`. */
interface AdminRpcResult {
  readonly status?: string;
  readonly reason?: string;
  readonly email?: string;
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminManageAdminsPage() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('admins')
        .select('email, added_by, created_at')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setAdmins((data ?? []) as AdminRow[]);
    } catch {
      setLoadError(messages.error.network);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAddSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const email = newEmail.trim();
      if (email === '') return;

      setAdding(true);
      setAddError(null);
      try {
        const { data, error } = await supabase.rpc('add_admin', { p_email: email });
        if (error) throw error;

        const result = data as AdminRpcResult | null;
        if (result?.status === 'added') {
          const addedEmail = result.email ?? email.toLowerCase();
          setAdmins((current) => {
            if (current.some((row) => row.email === addedEmail)) return current;
            return [...current, { email: addedEmail, added_by: null, created_at: new Date().toISOString() }];
          });
          setNewEmail('');
          // Refetch to pick up the server-assigned added_by/created_at values.
          void load();
        } else if (result?.status === 'denied' && result.reason === 'not-admin') {
          setAddError(messages.auth.notAuthorized);
        } else {
          setAddError(messages.error.generic);
        }
      } catch {
        setAddError(messages.error.generic);
      } finally {
        setAdding(false);
      }
    },
    [newEmail, load],
  );

  const handleRemove = useCallback(
    async (email: string) => {
      setRemovingEmail(email);
      setRemoveError(null);
      try {
        const { data, error } = await supabase.rpc('remove_admin', { p_email: email });
        if (error) throw error;

        const result = data as AdminRpcResult | null;
        if (result?.status === 'removed') {
          setAdmins((current) => current.filter((row) => row.email !== email));
        } else if (result?.status === 'denied' && result.reason === 'last-admin') {
          setRemoveError(messages.admin.lastAdminProtected);
        } else if (result?.status === 'denied' && result.reason === 'not-admin') {
          setRemoveError(messages.auth.notAuthorized);
        } else if (result?.status === 'not-found') {
          setRemoveError(messages.error.generic);
          void load();
        } else {
          setRemoveError(messages.error.generic);
        }
      } catch {
        setRemoveError(messages.error.generic);
      } finally {
        setRemovingEmail(null);
      }
    },
    [load],
  );

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Admin Console"
        title="Manage Admins"
        description="Add or remove admins. At least one admin must always remain."
      />

      <Card>
        <CardHeader>
          <CardTitle>Add an admin</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void handleAddSubmit(event)} className="flex flex-wrap items-end gap-3">
            <Input
              type="email"
              label="Email"
              placeholder="admin@example.com"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              required
              disabled={adding}
              className="min-w-[260px] flex-1"
            />
            <Button type="submit" variant="primary" loading={adding} disabled={newEmail.trim() === ''}>
              Add admin
            </Button>
          </form>
          {addError && (
            <p className="mt-3 rounded-control border border-status-red/30 bg-status-red/5 px-3 py-2 text-sm text-status-red">
              {addError}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Admins</CardTitle>
        </CardHeader>
        <CardContent>
          {removeError && (
            <p className="mb-4 rounded-control border border-status-red/30 bg-status-red/5 px-3 py-2 text-sm text-status-red">
              {removeError}
            </p>
          )}

          {loading ? (
            <div className="flex min-h-48 items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : loadError ? (
            <ErrorState kind="network" title="Unable to load admins" message={loadError} onAction={load} className="min-h-64 border-0 shadow-none" />
          ) : admins.length === 0 ? (
            <EmptyState title="No admins yet" message="Admins added here will be able to sign in and access the Admin Console." />
          ) : (
            <div className="table-scroll">
              <table className="table-base">
                <thead className="table-head">
                  <tr>
                    <th className="table-header-cell text-left">Email</th>
                    <th className="table-header-cell text-left">Added</th>
                    <th className="table-header-cell text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((admin) => (
                    <tr key={admin.email} className="table-row">
                      <td className="table-cell">
                        <p className="font-medium text-text">{admin.email}</p>
                      </td>
                      <td className="table-cell text-sm text-muted">{formatDate(admin.created_at)}</td>
                      <td className="table-cell text-right">
                        <Button
                          variant="danger"
                          size="sm"
                          loading={removingEmail === admin.email}
                          disabled={removingEmail !== null && removingEmail !== admin.email}
                          onClick={() => void handleRemove(admin.email)}
                        >
                          Remove
                        </Button>
                      </td>
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
