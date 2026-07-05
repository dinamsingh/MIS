import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import AppLayout from '@presentation/components/AppLayout';
import { SelectedSectionProvider } from '@presentation/context/SelectedSectionContext';
import { AuthProvider } from '@presentation/auth/AuthContext';
import type { AuthService } from '@data/access/authService';
import type { Actor } from '@domain/shared/types';
import { navGroups } from '@presentation/navigation';

const ANONYMOUS: Actor = { kind: 'anonymous' };

/**
 * A stub auth service so AuthProvider can resolve without Supabase. The command
 * center (rendered inside AppLayout) calls useAuth, so the tree needs an
 * AuthProvider; the stub keeps the actor anonymous and the subscription inert.
 */
const stubAuthService: AuthService = {
  getCurrentActor: () => Promise.resolve(ANONYMOUS),
  subscribe: () => () => {},
  signInTeacherPassword: () => Promise.resolve({ ok: false, error: { kind: 'unknown', message: 'stub' } }),
  sendEmailOtp: () => Promise.resolve({ ok: false, error: { kind: 'unknown', message: 'stub' } }),
  verifyEmailOtp: () => Promise.resolve({ ok: false, error: { kind: 'unknown', message: 'stub' } }),
  signInWithGoogle: () => Promise.resolve({ ok: false, error: { kind: 'unknown', message: 'stub' } }),
  signOut: () => Promise.resolve(),
} as unknown as AuthService;

/**
 * AppLayout renders the global section dropdown, which reads the
 * SelectedSectionProvider. With no Supabase in tests the section list stays
 * empty (the dropdown shows "No sections"), which is fine for these shell tests.
 */
function renderLayout(ui: ReactNode) {
  return render(
    <AuthProvider service={stubAuthService}>
      <SelectedSectionProvider>{ui}</SelectedSectionProvider>
    </AuthProvider>,
  );
}

describe('AppLayout shell', () => {
  it('renders the grouped-section navigation with every module (Req 20.7)', () => {
    renderLayout(<AppLayout activePath="/dashboard">content</AppLayout>);

    // Each group label is rendered.
    for (const group of navGroups) {
      expect(screen.getAllByText(group.label).length).toBeGreaterThan(0);
    }

    // Each nav item is rendered (sidebar present in DOM even when hidden via CSS).
    for (const group of navGroups) {
      for (const item of group.items) {
        expect(screen.getAllByText(item.label).length).toBeGreaterThan(0);
      }
    }
  });

  it('marks the active item with aria-current=page', () => {
    renderLayout(<AppLayout activePath="/dashboard">content</AppLayout>);
    const active = screen.getByRole('button', { name: /Dashboard/i });
    expect(active).toHaveAttribute('aria-current', 'page');
  });

  it('does not render the removed AI Quiz Generator menu item', () => {
    renderLayout(<AppLayout activePath="/dashboard">content</AppLayout>);
    expect(screen.queryByRole('button', { name: /AI Quiz Generator/i })).not.toBeInTheDocument();
  });

  it('renders the provided main content', () => {
    renderLayout(
      <AppLayout activePath="/dashboard">
        <span>region-content</span>
      </AppLayout>,
    );
    expect(screen.getByText('region-content')).toBeInTheDocument();
  });
});
