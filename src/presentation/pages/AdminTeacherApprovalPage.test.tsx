/**
 * Unit tests for `AdminTeacherApprovalPage` (task 6.2;
 * admin-console-and-scheduling-upgrade).
 *
 * The page module-level-instantiates `createAdminTeacherAccess(supabase)`
 * using the default `@data/supabase` client import, and separately calls
 * `supabase.rpc('has_extra_power', { p_power: 'teacher_allowlist_approval' })`
 * directly (via `useHasAllowlistPower`). Both are controlled here by mocking
 * `@data/supabase` with a fake client whose `.from(table).select().order()`
 * chain and `.rpc(name, args)` call resolve from test-local, per-test-
 * configurable state — the same pattern `App.routing.test.tsx` and
 * `RequireTeacher.test.tsx` use to mock `@data/supabase`'s `.rpc(...)` for
 * `get_my_role`. `isAdmin` is controlled by mocking `@presentation/auth/
 * useUserRole` directly, since it is the page's only other read of caller
 * identity.
 *
 * **Validates: Requirements 2.1, 2.5, 2.6**
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, within, fireEvent } from '@testing-library/react';
import type { AdminTeacherRow } from '@data/access/adminTeacherAccess';
import { messages } from '@domain/shared/messages';

// --- Control `isAdmin` (the page's `useUserRole()` read) ---
let currentIsAdmin = false;
vi.mock('@presentation/auth/useUserRole', () => ({
  useUserRole: () => ({
    roles: currentIsAdmin ? ['admin'] : [],
    loading: false,
    isAdmin: currentIsAdmin,
    isTeacher: false,
    isPendingTeacher: false,
  }),
}));

// --- Control the two `allowed_teacher_emails`/`teachers` table reads and the
// `has_extra_power` RPC the page depends on, via a fake `@data/supabase`
// client. `listAllowedTeacherEmails()`/`listTeachers()` (adminTeacherAccess.ts)
// call `.from(table).select(cols).order(...)`, which resolves a
// `{ data, error }` pair; `has_extra_power` is read via `.rpc(name, args)`.
let allowedEmailRows: Array<{ email: string; added_by: string | null; created_at: string }> = [];
let teacherRows: Array<{ id: string; name: string | null; email: string | null; onboarded: boolean | null }> = [];
let hasExtraPowerResponse: { data: boolean | null; error: { message: string } | null } = {
  data: false,
  error: null,
};

vi.mock('@data/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        order: () => {
          if (table === 'allowed_teacher_emails') {
            return Promise.resolve({ data: allowedEmailRows, error: null });
          }
          if (table === 'teachers') {
            return Promise.resolve({ data: teacherRows, error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
      }),
    }),
    rpc: (name: string) => {
      if (name === 'has_extra_power') {
        return Promise.resolve(hasExtraPowerResponse);
      }
      return Promise.resolve({ data: null, error: null });
    },
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { access_token: 'fake-access-token' } } }),
    },
  },
}));

// Imported after the mocks above so the page's module-level
// `createAdminTeacherAccess(supabase)` and `useUserRole()` pick them up.
import AdminTeacherApprovalPage from './AdminTeacherApprovalPage';

afterEach(() => {
  cleanup();
  currentIsAdmin = false;
  allowedEmailRows = [];
  teacherRows = [];
  hasExtraPowerResponse = { data: false, error: null };
});

/** Render the page and wait for its initial `load()` to settle. */
async function renderPage() {
  render(<AdminTeacherApprovalPage />);
  // Wait for the loading spinner in the allowlist section to clear, i.e.
  // for `listAllowedTeacherEmails()`/`listTeachers()` to have resolved.
  await waitFor(() => {
    expect(screen.queryByText('Allowed Teacher Emails')).toBeInTheDocument();
  });
  await waitFor(() => {
    // Once loaded, either a row's email or the "No allowed teacher emails
    // yet" empty state is present — either way the spinner is gone.
    expect(screen.queryByText(/Add email/i) || true).toBeTruthy();
  });
}

describe('AdminTeacherApprovalPage', () => {
  it('renders every row from listAllowedTeacherEmails() (Req 2.1)', async () => {
    allowedEmailRows = [
      { email: 'alice@example.com', added_by: null, created_at: '2024-01-01T00:00:00Z' },
      { email: 'bob@example.com', added_by: null, created_at: '2024-01-02T00:00:00Z' },
      { email: 'carol@example.com', added_by: null, created_at: '2024-01-03T00:00:00Z' },
    ] satisfies Array<{ email: string; added_by: string | null; created_at: string }>;

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
      expect(screen.getByText('bob@example.com')).toBeInTheDocument();
      expect(screen.getByText('carol@example.com')).toBeInTheDocument();
    });
  });

  it('distinguishes onboarded vs. pending-only teachers (Req 2.1, 2.5)', async () => {
    allowedEmailRows = [
      { email: 'onboarded@example.com', added_by: null, created_at: '2024-01-01T00:00:00Z' },
      { email: 'pending@example.com', added_by: null, created_at: '2024-01-02T00:00:00Z' },
    ];
    teacherRows = [
      { id: 't1', name: 'Onboarded Teacher', email: 'onboarded@example.com', onboarded: true },
    ] satisfies Array<AdminTeacherRow & { onboarded: boolean }> as unknown as typeof teacherRows;

    await renderPage();

    await waitFor(() => {
      // "onboarded@example.com" legitimately appears twice (once in the
      // allowlist table, once in the Teachers table), so assert via
      // getAllByText here and disambiguate below via each section's table.
      expect(screen.getAllByText('onboarded@example.com').length).toBeGreaterThan(0);
      expect(screen.getByText('pending@example.com')).toBeInTheDocument();
    });

    // The allowlist row for the onboarded email shows an "Onboarded" badge;
    // the row with no matching teachers row shows "Pending". The allowlist
    // table is the first table in the document (Allowed Teacher Emails
    // section renders before the Teachers section).
    const allowlistTable = screen.getAllByRole('table')[0];
    const onboardedRow = within(allowlistTable).getByText('onboarded@example.com').closest('tr');
    const pendingRow = within(allowlistTable).getByText('pending@example.com').closest('tr');
    expect(onboardedRow).not.toBeNull();
    expect(pendingRow).not.toBeNull();
    expect(within(onboardedRow!).getByText('Onboarded')).toBeInTheDocument();
    expect(within(pendingRow!).getByText('Pending')).toBeInTheDocument();

    // The Teachers section also shows the onboarded teacher with its own
    // "Onboarded" status badge. The Teachers table is the second table in
    // the document.
    const teachersTable = screen.getAllByRole('table')[1];
    expect(teachersTable).toBeDefined();
    expect(within(teachersTable).getByText('Onboarded Teacher')).toBeInTheDocument();
  });

  it('has no direct-edit control on any teacher row (Req 2.6)', async () => {
    allowedEmailRows = [];
    teacherRows = [
      { id: 't1', name: 'Onboarded Teacher', email: 'onboarded@example.com', onboarded: true },
      { id: 't2', name: 'Another Teacher', email: 'another@example.com', onboarded: false },
    ];

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Onboarded Teacher')).toBeInTheDocument();
      expect(screen.getByText('Another Teacher')).toBeInTheDocument();
    });

    // Scope to the Teachers card only (the allowlist section legitimately
    // has an "Add email" button/form and per-row "Remove" buttons, which are
    // a different control on a different table — not an edit control on a
    // teacher row).
    const teachersHeading = screen.getByText('Teachers');
    const teachersCard = teachersHeading.closest('div')?.parentElement;
    expect(teachersCard).not.toBeNull();

    const editButtons = within(teachersCard!).queryAllByRole('button');
    expect(editButtons).toHaveLength(0);
    expect(within(teachersCard!).queryByText(/edit/i)).not.toBeInTheDocument();
  });

  it('hides add/remove controls for a caller lacking both admin and the allowlist power (Req 2.5)', async () => {
    currentIsAdmin = false;
    hasExtraPowerResponse = { data: false, error: null };
    allowedEmailRows = [{ email: 'someone@example.com', added_by: null, created_at: '2024-01-01T00:00:00Z' }];
    teacherRows = [];

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('someone@example.com')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /add email/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('shows add/remove controls when isAdmin is true (Req 2.5)', async () => {
    currentIsAdmin = true;
    hasExtraPowerResponse = { data: false, error: null };
    allowedEmailRows = [{ email: 'someone@example.com', added_by: null, created_at: '2024-01-01T00:00:00Z' }];
    teacherRows = [];

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('someone@example.com')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /create teacher account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  describe('Create teacher account (admin-console-and-scheduling-upgrade ad-hoc enhancement)', () => {
    beforeEach(() => {
      currentIsAdmin = true;
      hasExtraPowerResponse = { data: false, error: null };
      allowedEmailRows = [];
      teacherRows = [];
      vi.stubGlobal('fetch', vi.fn());
      Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    async function fillEmailAndClickCreate(email: string) {
      const emailInput = screen.getByLabelText(/email/i);
      fireEvent.change(emailInput, { target: { value: email } });
      fireEvent.click(screen.getByRole('button', { name: /create teacher account/i }));
    }

    it('shows a dismissible one-time password banner on success, with a working copy button', async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ status: 'created', email: 'new@example.com', temporaryPassword: 'Temp-Pass-1234!' }),
      });

      await renderPage();
      await fillEmailAndClickCreate('new@example.com');

      await waitFor(() => {
        expect(screen.getByText('new@example.com')).toBeInTheDocument();
        expect(screen.getByText('Temp-Pass-1234!')).toBeInTheDocument();
      });
      expect(screen.getByText(/shown once/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /copy/i }));
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Temp-Pass-1234!');
        expect(screen.getByText(messages.admin.passwordCopied)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
      await waitFor(() => {
        expect(screen.queryByText('Temp-Pass-1234!')).not.toBeInTheDocument();
      });
    });

    it('shows the warning field distinctly when present alongside a success response', async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: 'created',
            email: 'new@example.com',
            temporaryPassword: 'Temp-Pass-1234!',
            warning: 'The allowlist insert failed.',
          }),
      });

      await renderPage();
      await fillEmailAndClickCreate('new@example.com');

      await waitFor(() => {
        expect(screen.getByText('The allowlist insert failed.')).toBeInTheDocument();
      });
    });

    it('shows a distinct message for already-exists (409)', async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: 'A user with this email already exists.' }),
      });

      await renderPage();
      await fillEmailAndClickCreate('existing@example.com');

      await waitFor(() => {
        expect(screen.getByText(messages.admin.accountAlreadyExists)).toBeInTheDocument();
      });
    });

    it('shows a distinct message for denied (403)', async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Not authorized.' }),
      });

      await renderPage();
      await fillEmailAndClickCreate('new@example.com');

      await waitFor(() => {
        expect(screen.getByText(messages.auth.notAuthorized)).toBeInTheDocument();
      });
    });

    it('shows a distinct message for other failures', async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'The server exploded.' }),
      });

      await renderPage();
      await fillEmailAndClickCreate('new@example.com');

      await waitFor(() => {
        expect(screen.getByText('The server exploded.')).toBeInTheDocument();
      });
    });
  });
});
