/**
 * Admin Console boundaries audit test (task 6.5;
 * admin-console-and-scheduling-upgrade).
 *
 * One-time example/audit test — NOT property-based, per `design.md`'s
 * Testing Strategy ("absence-of-control guardrails ... get one-time example/
 * audit tests instead, never PBT"). Walks the three Phase 1 Admin Console
 * pages (`AdminTeacherApprovalPage`, `AdminExtraPowersPage`,
 * `AdminManageAdminsPage`) and asserts none of them render:
 *
 *  - a raw-SQL input (Requirement 4.3)
 *  - a migration-runner control (Requirement 4.4)
 *  - a generic "edit as this user" / impersonation action (Requirement 4.1)
 *  - in-place editing of attendance/marks/quiz content (Requirement 4.2 —
 *    trivially true, since none of these three pages render that data at all)
 *  - a bulk-delete control beyond the single-row "Remove" actions already
 *    present on `AdminTeacherApprovalPage`/`AdminManageAdminsPage`
 *    (Requirement 4.5 — those are per-row removals, not bulk, and are
 *    explicitly NOT flagged by this audit)
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { Actor } from '@domain/shared/types';
import type { AuthService } from '@data/access/authService';

/**
 * Minimal in-memory table data for the `.from(table)` calls each page makes.
 * Deliberately distinct emails/names per table so `findByText` queries below
 * are unambiguous (no duplicate text across the "Allowed Teacher Emails" and
 * "Teachers" sections of `AdminTeacherApprovalPage`, for example).
 */
const TABLE_DATA: Record<string, ReadonlyArray<Record<string, unknown>>> = {
  allowed_teacher_emails: [
    { email: 'pending.teacher@example.com', added_by: 'root.admin@example.com', created_at: '2024-01-01T00:00:00Z' },
  ],
  teachers: [
    { id: 't1', name: 'Onboard Teacher', email: 'onboard.teacher@example.com', onboarded: true },
  ],
  teacher_extra_powers: [],
  admins: [
    { email: 'root.admin@example.com', added_by: null, created_at: '2024-01-01T00:00:00Z' },
  ],
};

/**
 * A minimal chainable stand-in for Supabase's query builder. Every method
 * (`select`/`order`/`eq`/...) returns another chainable resolving to the same
 * `{ data, error }` result, so it works regardless of how many methods a
 * given page happens to chain before awaiting.
 */
function chainable(result: { data: unknown; error: null }): PromiseLike<{ data: unknown; error: null }> & Record<string, unknown> {
  const promise = Promise.resolve(result);
  const proxy = new Proxy(promise, {
    get(target, prop) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        // Bind to `target` (the real Promise) so the native method sees a
        // compatible receiver — calling it with `this = proxy` would throw
        // "Method Promise.prototype.then called on incompatible receiver".
        const method = Reflect.get(target, prop) as (...args: unknown[]) => unknown;
        return method.bind(target);
      }
      return () => chainable(result);
    },
  }) as unknown as PromiseLike<{ data: unknown; error: null }> & Record<string, unknown>;
  return proxy;
}

vi.mock('@data/supabase', () => ({
  supabase: {
    from: (table: string) => chainable({ data: TABLE_DATA[table] ?? [], error: null }),
    rpc: (fn: string, _args?: unknown) => {
      if (fn === 'get_my_role') return Promise.resolve({ data: ['admin'], error: null });
      if (fn === 'has_extra_power') return Promise.resolve({ data: true, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  },
}));

// Imported after the mock above so each page's `@data/supabase` import (and
// `adminTeacherAccess.ts`'s, transitively) resolves to the mocked client.
import AdminTeacherApprovalPage from './AdminTeacherApprovalPage';
import AdminExtraPowersPage from './AdminExtraPowersPage';
import AdminManageAdminsPage from './AdminManageAdminsPage';
import { AuthProvider } from '@presentation/auth/AuthContext';

/** Stub `AuthService` resolving immediately to the given actor, never emitting further changes. */
function stubServiceReturning(actor: Actor): AuthService {
  return {
    getCurrentActor: () => Promise.resolve(actor),
    subscribe: () => () => {},
    signInTeacherPassword: () => Promise.reject(new Error('not used in this test')),
    sendEmailOtp: () => Promise.reject(new Error('not used in this test')),
    verifyEmailOtp: () => Promise.reject(new Error('not used in this test')),
    sendStudentEmailOtp: () => Promise.reject(new Error('not used in this test')),
    verifyStudentEmailOtp: () => Promise.reject(new Error('not used in this test')),
    signInWithGoogle: () => Promise.reject(new Error('not used in this test')),
    signOut: () => Promise.resolve(),
  };
}

const ADMIN_ACTOR: Actor = { kind: 'teacher', userId: 'admin-1', email: 'root.admin@example.com' };

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Boundary patterns (Requirement 4.1-4.5)
// ---------------------------------------------------------------------------

const SQL_PATTERN = /\bsql\b/i;
const MIGRATION_PATTERN = /\b(run|execute)\s*migration\b|\bmigrate\b/i;
const EDIT_AS_PATTERN = /\bedit as\b|\bimpersonate\b|\blog\s*in as\b/i;
const BULK_DELETE_PATTERN = /\bdelete all\b|\bremove all\b|\bselect all\b/i;
const ACADEMIC_CONTENT_PATTERN = /\battendance\b|\bmarks?\b|\bquiz\b/i;

/**
 * Asserts a rendered Admin Console page violates none of the Requirement 4
 * guardrails. Shared across all three pages so each gets the identical,
 * precise set of checks.
 */
function assertNoAdminConsoleBoundaryViolations(container: HTMLElement): void {
  const inputsAndTextareas = Array.from(container.querySelectorAll('input, textarea'));
  const buttons = Array.from(container.querySelectorAll('button, [role="button"]'));
  const fullText = container.textContent ?? '';

  // Requirement 4.3: no raw-SQL input anywhere in the page.
  for (const el of inputsAndTextareas) {
    const descriptor = [
      el.getAttribute('placeholder'),
      el.getAttribute('aria-label'),
      el.getAttribute('name'),
      el.getAttribute('id'),
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ');
    expect(descriptor).not.toMatch(SQL_PATTERN);
  }
  expect(fullText).not.toMatch(SQL_PATTERN);

  // Requirement 4.4: no migration-runner control.
  for (const button of buttons) {
    expect(button.textContent ?? '').not.toMatch(MIGRATION_PATTERN);
  }
  expect(fullText).not.toMatch(MIGRATION_PATTERN);

  // Requirement 4.1: no generic "edit as this user" / impersonation action.
  for (const button of buttons) {
    expect(button.textContent ?? '').not.toMatch(EDIT_AS_PATTERN);
  }
  expect(fullText).not.toMatch(EDIT_AS_PATTERN);

  // Requirement 4.2: no in-place editing of attendance/marks/quiz content —
  // no table header and no labeled form field referencing that data at all
  // (these pages don't render such data, so this is expected to hold trivially).
  const tableHeaders = Array.from(container.querySelectorAll('th'));
  for (const header of tableHeaders) {
    expect(header.textContent ?? '').not.toMatch(ACADEMIC_CONTENT_PATTERN);
  }
  const labeledFields = Array.from(container.querySelectorAll('input, textarea, select'));
  for (const field of labeledFields) {
    const descriptor = [
      field.getAttribute('aria-label'),
      field.getAttribute('placeholder'),
      field.getAttribute('name'),
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ');
    expect(descriptor).not.toMatch(ACADEMIC_CONTENT_PATTERN);
  }

  // Requirement 4.5: no bulk-delete control (e.g. "Delete all"/"Remove all"),
  // and no "select all" checkbox pattern that would drive a bulk action.
  // Single-row "Remove" buttons, and per-row Extra_Power toggle switches
  // (which happen to render as `<input type="checkbox">` but are individual,
  // non-destructive per-teacher-per-power toggles, not a bulk-delete
  // mechanism), are intentionally NOT matched by this pattern.
  for (const button of buttons) {
    expect(button.textContent ?? '').not.toMatch(BULK_DELETE_PATTERN);
  }
  expect(fullText).not.toMatch(BULK_DELETE_PATTERN);
  // No "select all" checkbox in a table header (the header-row control that
  // would typically drive a bulk-selected-rows delete action).
  const headerCheckboxes = container.querySelectorAll('th input[type="checkbox"]');
  expect(headerCheckboxes.length).toBe(0);
}

describe('Admin Console boundaries audit (Requirement 4)', () => {
  it('AdminTeacherApprovalPage renders no out-of-scope control, and its "Remove" buttons remain single-row', async () => {
    const { container } = render(
      <AuthProvider service={stubServiceReturning(ADMIN_ACTOR)}>
        <AdminTeacherApprovalPage />
      </AuthProvider>,
    );

    // Wait for both sections' data loads to settle.
    await screen.findByText('pending.teacher@example.com');
    await screen.findByText('onboard.teacher@example.com');

    assertNoAdminConsoleBoundaryViolations(container);

    // Distinguish: the allowlist row's per-row "Remove" button IS present
    // and is exactly one button per row, not a bulk action.
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    expect(removeButtons.length).toBe(1);

    // Requirement 2.6 boundary, reused here as an additional sanity check:
    // the read-only "Teachers" table renders no edit/delete control at all.
    const teachersRow = screen.getByText('onboard.teacher@example.com').closest('tr');
    expect(teachersRow?.querySelector('button')).toBeNull();
  });

  it('AdminExtraPowersPage renders no out-of-scope control (only per-power toggles)', async () => {
    const { container } = render(<AdminExtraPowersPage />);

    await screen.findByText('Onboard Teacher');

    assertNoAdminConsoleBoundaryViolations(container);

    // This page has no delete-style buttons of any kind — only Switch toggles.
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  it('AdminManageAdminsPage renders no out-of-scope control, and its "Remove" button remains single-row', async () => {
    const { container } = render(<AdminManageAdminsPage />);

    await screen.findByText('root.admin@example.com');

    assertNoAdminConsoleBoundaryViolations(container);

    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    expect(removeButtons.length).toBe(1);
  });
});
