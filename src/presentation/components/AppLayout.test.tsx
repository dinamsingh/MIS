import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AppLayout from '@presentation/components/AppLayout';
import { navGroups } from '@presentation/navigation';

describe('AppLayout shell', () => {
  it('renders the grouped-section navigation with every module (Req 20.7)', () => {
    render(<AppLayout activePath="/dashboard">content</AppLayout>);

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
    render(<AppLayout activePath="/dashboard">content</AppLayout>);
    const active = screen.getByRole('button', { name: /Dashboard/i });
    expect(active).toHaveAttribute('aria-current', 'page');
  });

  it('renders locked AI items as disabled placeholders', () => {
    render(<AppLayout activePath="/dashboard">content</AppLayout>);
    const lockedItem = screen.getByRole('button', { name: /AI Quiz Generator/i });
    expect(lockedItem).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders the provided main content', () => {
    render(
      <AppLayout activePath="/dashboard">
        <span>region-content</span>
      </AppLayout>,
    );
    expect(screen.getByText('region-content')).toBeInTheDocument();
  });
});
