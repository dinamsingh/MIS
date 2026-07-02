import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import AppLayout from '@presentation/components/AppLayout';
import { SelectedSectionProvider } from '@presentation/context/SelectedSectionContext';
import { navGroups } from '@presentation/navigation';

/**
 * AppLayout renders the global section dropdown, which reads the
 * SelectedSectionProvider. With no Supabase in tests the section list stays
 * empty (the dropdown shows "No sections"), which is fine for these shell tests.
 */
function renderLayout(ui: ReactNode) {
  return render(<SelectedSectionProvider>{ui}</SelectedSectionProvider>);
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
