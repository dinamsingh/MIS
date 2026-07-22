/**
 * Unit tests for `PasswordStep` — the forced "Set your password" step shown
 * only when a teacher's account was auto-created by an admin
 * (`profile.mustResetPassword`).
 *
 * **Validates: ad-hoc enhancement — admin-creates-teacher-account (admin-
 * console-and-scheduling-upgrade)**
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { messages } from '@domain/shared/messages';
import PasswordStep from './PasswordStep';

afterEach(() => {
  cleanup();
});

describe('PasswordStep', () => {
  it('rejects a password shorter than the minimum length', async () => {
    const onSubmit = vi.fn();
    render(<PasswordStep saving={false} onBack={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    await waitFor(() => {
      expect(screen.getByText(messages.onboardingPassword.passwordTooShort)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords', async () => {
    const onSubmit = vi.fn();
    render(<PasswordStep saving={false} onBack={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'longenough1' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'longenough2' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    await waitFor(() => {
      expect(screen.getByText(messages.onboardingPassword.passwordsDoNotMatch)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with the new password when valid and matching', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PasswordStep saving={false} onBack={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'longenough1' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'longenough1' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('longenough1');
    });
  });

  it('surfaces an error message when onSubmit rejects', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Could not update your password. Please try again.'));
    render(<PasswordStep saving={false} onBack={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'longenough1' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'longenough1' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    await waitFor(() => {
      expect(screen.getByText('Could not update your password. Please try again.')).toBeInTheDocument();
    });
  });
});
