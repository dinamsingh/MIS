/**
 * Admin Console — Teacher Approval page (task 6.1).
 *
 * Two read sections:
 *  - "Allowed Teacher Emails" (`public.allowed_teacher_emails`): every row,
 *    with an add-email form calling the existing `add_allowed_teacher()` RPC
 *    (migration 0027) and a remove button per row calling the new
 *    `remove_allowed_teacher()` RPC (migration 0044).
 *  - "Teachers" (`public.teachers`): every row, annotated with onboarded
 *    status, distinguishing onboarded teachers from allowlisted-but-not-yet-
 *    onboarded ("pending") emails. This section is strictly read-only — no
 *    edit/delete control is rendered on any teacher row (Requirement 2.6).
 *
 * Add/remove controls on the allowlist section are hidden client-side for a
 * caller who is neither an admin nor holds the `teacher_allowlist_approval`
 * Extra_Power (Requirement 2.4's client-side half — the `remove_allowed_
 * teacher()`/`add_allowed_teacher()` RPCs enforce the same check server-side,
 * which remains the authoritative boundary). `hasAllowlistPower` is resolved
 * locally via `has_extra_power('teacher_allowlist_approval')` since that RPC
 * is a general-purpose SQL helper, not part of `useUserRole()`'s role-tag
 * array contract.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@data/supabase';
import {
  createAdminTeacherAccess,
  type AdminTeacherRow,
  type AllowedTeacherEmailRow,
  type CreateTeacherAccountResult,
} from '@data/access/adminTeacherAccess';
import { messages } from '@domain/shared/messages';
import { useUserRole } from '@presentation/auth/useUserRole';
import { Card, CardContent, CardHeader, CardTitle, SectionHeader, Button } from '@presentation/components/ui/foundation';
import { Badge, EmptyState, ErrorState, LoadingSpinner } from '@presentation/components/ui/data-display';
import { Input } from '@presentation/components/ui/forms';

const access = createAdminTeacherAccess(supabase);

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Resolve whether the signed-in caller holds the `teacher_allowlist_
 * approval` Extra_Power, via a single `has_extra_power` RPC call on mount.
 * Scoped to this page only — not part of `useUserRole()`'s contract.
 */
function useHasAllowlistPower(): { readonly hasPower: boolean; readonly loading: boolean } {
  const [hasPower, setHasPower] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.rpc('has_extra_power', {
          p_power: 'teacher_allowlist_approval',
        });
        if (!active) return;
        setHasPower(error ? false : data === true);
      } catch {
        if (active) setHasPower(false);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return { hasPower, loading };
}

export default function AdminTeacherApprovalPage() {
  const { isAdmin } = useUserRole();
  const { hasPower: hasAllowlistPower } = useHasAllowlistPower();
  const canManageAllowlist = isAdmin || hasAllowlistPower;

  const [allowedEmails, setAllowedEmails] = useState<AllowedTeacherEmailRow[]>([]);
  const [teachers, setTeachers] = useState<AdminTeacherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');

  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [creatingAccount, setCreatingAccount] = useState(false);
  const [createAccountError, setCreateAccountError] = useState<string | null>(null);
  const [createdAccount, setCreatedAccount] = useState<
    { email: string; temporaryPassword: string; warning?: string } | null
  >(null);
  const [passwordCopied, setPasswordCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [emails, teacherRows] = await Promise.all([
        access.listAllowedTeacherEmails(),
        access.listTeachers(),
      ]);
      setAllowedEmails(emails);
      setTeachers(teacherRows);
    } catch {
      setLoadError(messages.error.network);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Onboarded teacher emails (lower-cased), used to mark an allowlist row as
  // "pending" (allowlisted but no teachers row yet) vs. already onboarded.
  const onboardedEmails = useMemo(() => {
    const set = new Set<string>();
    for (const teacher of teachers) {
      if (teacher.onboarded && teacher.email) set.add(teacher.email.toLowerCase());
    }
    return set;
  }, [teachers]);

  const handleCreateAccount = useCallback(async () => {
    const email = newEmail.trim();
    if (email === '') {
      setCreateAccountError(messages.admin.emailRequired);
      return;
    }

    setCreatingAccount(true);
    setCreateAccountError(null);
    setCreatedAccount(null);
    setPasswordCopied(false);
    try {
      const result: CreateTeacherAccountResult = await access.createTeacherAccount(email);
      if (result.status === 'created') {
        setNewEmail('');
        setCreatedAccount({
          email: result.email,
          temporaryPassword: result.temporaryPassword,
          warning: result.warning,
        });
        void load();
      } else if (result.status === 'already-exists') {
        setCreateAccountError(messages.admin.accountAlreadyExists);
      } else if (result.status === 'denied') {
        setCreateAccountError(messages.auth.notAuthorized);
      } else {
        setCreateAccountError(result.message || messages.admin.createAccountFailed);
      }
    } catch {
      setCreateAccountError(messages.admin.createAccountFailed);
    } finally {
      setCreatingAccount(false);
    }
  }, [newEmail, load]);

  const handleCopyPassword = useCallback(async () => {
    if (!createdAccount) return;
    try {
      await navigator.clipboard.writeText(createdAccount.temporaryPassword);
      setPasswordCopied(true);
    } catch {
      // Clipboard access can fail (permissions, non-secure context); the
      // password remains visible on screen for manual copy either way.
    }
  }, [createdAccount]);

  const handleRemove = useCallback(
    async (email: string) => {
      setRemovingEmail(email);
      setRemoveError(null);
      try {
        const result = await access.removeAllowedTeacherEmail(email);
        if (result.status === 'removed') {
          setAllowedEmails((current) => current.filter((row) => row.email !== email));
        } else if (result.status === 'denied') {
          setRemoveError(messages.auth.notAuthorized);
        } else if (result.status === 'not-found') {
          void load();
        } else {
          setRemoveError(messages.admin.removeEmailFailed);
        }
      } catch {
        setRemoveError(messages.admin.removeEmailFailed);
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
        title="Teacher Approval"
        description="Manage the approved-teacher allowlist and review teacher onboarding status."
      />

      <Card>
        <CardHeader>
          <CardTitle>Allowed Teacher Emails</CardTitle>
        </CardHeader>
        <CardContent>
          {canManageAllowlist && (
            <form onSubmit={(event) => { event.preventDefault(); void handleCreateAccount(); }} className="flex flex-wrap items-end gap-3">
              <Input
                type="email"
                label="Email"
                placeholder="teacher@example.com"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                required
                disabled={creatingAccount}
                className="min-w-[260px] flex-1"
              />
              <Button
                type="submit"
                variant="primary"
                loading={creatingAccount}
                disabled={newEmail.trim() === ''}
              >
                Create teacher account
              </Button>
            </form>
          )}
          {createAccountError && (
            <p className="mt-3 rounded-control border border-status-red/30 bg-status-red/5 px-3 py-2 text-sm text-status-red">
              {createAccountError}
            </p>
          )}
          {removeError && (
            <p className="mt-3 rounded-control border border-status-red/30 bg-status-red/5 px-3 py-2 text-sm text-status-red">
              {removeError}
            </p>
          )}

          {createdAccount && (
            <div
              role="alert"
              className="mt-3 rounded-control border border-status-amber/40 bg-status-amber/10 px-4 py-3 text-sm text-text"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-center gap-2 font-semibold text-status-amber">
                  <span aria-hidden="true">⚠️</span> Teacher account created — shown once
                </p>
                <button
                  type="button"
                  aria-label="Dismiss"
                  className="text-xs font-medium text-muted hover:text-text"
                  onClick={() => setCreatedAccount(null)}
                >
                  Dismiss
                </button>
              </div>
              <p className="mt-2 text-xs text-muted">
                This temporary password is shown only once. Copy it now and share it securely with the teacher — it
                cannot be retrieved again after you leave this page.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="rounded-control bg-surface px-3 py-1.5 font-mono text-sm text-text">
                  {createdAccount.email}
                </span>
                <span className="rounded-control bg-surface px-3 py-1.5 font-mono text-sm text-text">
                  {createdAccount.temporaryPassword}
                </span>
                <Button type="button" variant="secondary" size="sm" onClick={() => void handleCopyPassword()}>
                  Copy
                </Button>
                {passwordCopied && (
                  <span className="text-xs font-medium text-status-green">{messages.admin.passwordCopied}</span>
                )}
              </div>
              {createdAccount.warning && (
                <p className="mt-3 rounded-control border border-status-red/30 bg-status-red/5 px-3 py-2 text-xs text-status-red">
                  {createdAccount.warning}
                </p>
              )}
            </div>
          )}

          <div className="mt-5">
            {loading ? (
              <div className="flex min-h-48 items-center justify-center">
                <LoadingSpinner />
              </div>
            ) : loadError ? (
              <ErrorState kind="network" title="Unable to load allowlist" message={loadError} onAction={load} className="min-h-64 border-0 shadow-none" />
            ) : allowedEmails.length === 0 ? (
              <EmptyState title="No allowed teacher emails yet" message="Add an email to allow a new teacher to onboard." />
            ) : (
              <div className="table-scroll">
                <table className="table-base">
                  <thead className="table-head">
                    <tr>
                      <th className="table-header-cell text-left">Email</th>
                      <th className="table-header-cell text-left">Status</th>
                      <th className="table-header-cell text-left">Added</th>
                      {canManageAllowlist && <th className="table-header-cell text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {allowedEmails.map((row) => {
                      const onboarded = onboardedEmails.has(row.email.toLowerCase());
                      return (
                        <tr key={row.email} className="table-row">
                          <td className="table-cell">
                            <p className="font-medium text-text">{row.email}</p>
                          </td>
                          <td className="table-cell">
                            <Badge tone={onboarded ? 'success' : 'warning'} size="sm">
                              {onboarded ? 'Onboarded' : 'Pending'}
                            </Badge>
                          </td>
                          <td className="table-cell text-sm text-muted">{formatDate(row.createdAt)}</td>
                          {canManageAllowlist && (
                            <td className="table-cell text-right">
                              <Button
                                variant="danger"
                                size="sm"
                                loading={removingEmail === row.email}
                                disabled={removingEmail !== null && removingEmail !== row.email}
                                onClick={() => void handleRemove(row.email)}
                              >
                                Remove
                              </Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Teachers</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex min-h-48 items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : loadError ? (
            <ErrorState kind="network" title="Unable to load teachers" message={loadError} onAction={load} className="min-h-64 border-0 shadow-none" />
          ) : teachers.length === 0 ? (
            <EmptyState title="No teachers yet" message="Teachers appear here once they complete onboarding." />
          ) : (
            <div className="table-scroll">
              <table className="table-base">
                <thead className="table-head">
                  <tr>
                    <th className="table-header-cell text-left">Name</th>
                    <th className="table-header-cell text-left">Email</th>
                    <th className="table-header-cell text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((teacher) => (
                    <tr key={teacher.id} className="table-row">
                      <td className="table-cell">
                        <p className="font-medium text-text">{teacher.name ?? '—'}</p>
                      </td>
                      <td className="table-cell text-sm text-muted">{teacher.email ?? '—'}</td>
                      <td className="table-cell">
                        <Badge tone={teacher.onboarded ? 'success' : 'neutral'} size="sm">
                          {teacher.onboarded ? 'Onboarded' : 'Not onboarded'}
                        </Badge>
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
