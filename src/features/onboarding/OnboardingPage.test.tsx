/**
 * Integration tests for the onboarding wizard's forced password-reset step.
 *
 * Verifies:
 *  - When `mustResetPassword` is true, Review's "Continue →" advances to the
 *    Password step, which calls `setTeacherPassword` then `saveOnboarding`
 *    before navigating away.
 *  - When `mustResetPassword` is false (the normal case), Review's "Finish
 *    setup ✓" calls `saveOnboarding` directly with no password step shown —
 *    i.e. no regression on the pre-existing behavior.
 *
 * **Validates: ad-hoc enhancement — admin-creates-teacher-account (admin-
 * console-and-scheduling-upgrade)**
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { OnboardingProfile } from './types';

let currentProfile: OnboardingProfile = { name: 'Jane Doe', email: 'jane@example.com', mustResetPassword: false };

const saveOnboarding = vi.fn().mockResolvedValue(undefined);
const setTeacherPassword = vi.fn().mockResolvedValue(undefined);

vi.mock('./api/onboarding', () => ({
  fetchTeacherProfile: () => Promise.resolve(currentProfile),
  buildAssignments: () => [{ subjectId: 's1', batchId: 'b1', section: 'A', isLab: false }],
  saveOnboarding: (...args: unknown[]) => saveOnboarding(...args),
  setTeacherPassword: (...args: unknown[]) => setTeacherPassword(...args),
}));

vi.mock('./hooks/useOnboardingData', () => ({
  useOnboardingData: () => ({
    loading: false,
    error: null,
    batches: [{ id: 'b1', startYear: 2024, currentSem: 5, status: 'classes' }],
    subjects: [
      { id: 's1', sem: 5, code: 'CS-501', name: 'Theory of Computation', kind: 'theory', labName: null, electiveGroup: null },
    ],
    batchesWithSubjects: [
      {
        batch: { id: 'b1', startYear: 2024, currentSem: 5, status: 'classes' },
        subjects: [
          { id: 's1', sem: 5, code: 'CS-501', name: 'Theory of Computation', kind: 'theory', labName: null, electiveGroup: null },
        ],
      },
    ],
  }),
}));

import OnboardingPage from './OnboardingPage';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  currentProfile = { name: 'Jane Doe', email: 'jane@example.com', mustResetPassword: false };
});

/** Drive the wizard from Profile -> Timetable -> Review, selecting one subject/section. */
async function advanceToReview() {
  render(
    <MemoryRouter>
      <OnboardingPage />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByText('Verify teacher profile')).toBeInTheDocument();
  });

  // Profile step: pick a session, then continue.
  fireEvent.click(screen.getByRole('button', { name: /odd/i }));
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));

  await waitFor(() => {
    expect(screen.getByText('Aapki timetable')).toBeInTheDocument();
  });

  // Timetable step: expand the batch, select the subject's section A.
  fireEvent.click(screen.getByText(/Batch b1/i));
  const sectionAButtons = screen.getAllByText('A');
  fireEvent.click(sectionAButtons[sectionAButtons.length - 1]);

  fireEvent.click(screen.getByRole('button', { name: /continue/i }));

  await waitFor(() => {
    expect(screen.getByText('Ek baar dekh lijiye')).toBeInTheDocument();
  });
}

describe('OnboardingPage — forced password-reset step', () => {
  it('skips the Password step entirely when mustResetPassword is false (no regression)', async () => {
    currentProfile = { name: 'Jane Doe', email: 'jane@example.com', mustResetPassword: false };
    await advanceToReview();

    expect(screen.getByRole('button', { name: /finish setup/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    await waitFor(() => {
      expect(saveOnboarding).toHaveBeenCalledTimes(1);
    });
    expect(setTeacherPassword).not.toHaveBeenCalled();
    expect(screen.queryByText('Set your password')).not.toBeInTheDocument();
  });

  it('inserts the Password step when mustResetPassword is true, and saves only after it succeeds', async () => {
    currentProfile = { name: 'Jane Doe', email: 'jane@example.com', mustResetPassword: true };
    await advanceToReview();

    // Review's finish button reads "Continue →" in this case, not "Finish setup".
    expect(screen.queryByRole('button', { name: /finish setup/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByText('Set your password')).toBeInTheDocument();
    });
    expect(saveOnboarding).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'longenough1' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'longenough1' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    await waitFor(() => {
      expect(setTeacherPassword).toHaveBeenCalledWith('longenough1');
      expect(saveOnboarding).toHaveBeenCalledTimes(1);
    });
  });
});
