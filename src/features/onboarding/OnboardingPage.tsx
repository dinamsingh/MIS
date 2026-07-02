/**
 * First-Time Teacher Onboarding wizard shell.
 *
 * Full-screen, centered card that walks a new teacher through three steps —
 * Profile → Timetable → Review — and, on finish, writes their assignments and
 * flips the onboarded flag, then routes to the dashboard with a success toast.
 *
 * Data source (batches/subjects/reads/writes) is chosen inside `api/onboarding`
 * based on demo mode, so this component stays storage-agnostic.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@presentation/auth';
import PageLoader from '@presentation/components/PageLoader';
import { useOnboardingData } from './hooks/useOnboardingData';
import { buildAssignments, saveOnboarding } from './api/onboarding';
import ProfileStep from './steps/ProfileStep';
import TimetableStep from './steps/TimetableStep';
import ReviewStep from './steps/ReviewStep';
import type { OnboardingProfile, Section, SelectionState } from './types';
import type { WizardStep } from './components/Stepper';

/** Derive the initial profile from the authenticated actor when available. */
function useInitialProfile(): OnboardingProfile {
  const { actor } = useAuth();
  return useMemo<OnboardingProfile>(() => {
    if (actor.kind === 'teacher') {
      return { name: '', email: actor.email };
    }
    return { name: '', email: '' };
  }, [actor]);
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const initialProfile = useInitialProfile();
  const { loading, error, batches, subjects, batchesWithSubjects } = useOnboardingData();

  const [step, setStep] = useState<WizardStep>('profile');
  const [profile, setProfile] = useState<OnboardingProfile>(initialProfile);
  const [selection, setSelection] = useState<SelectionState>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Keep the profile email in sync once the actor resolves (only if untouched).
  useEffect(() => {
    setProfile((prev) => (prev.email === '' && initialProfile.email !== '' ? initialProfile : prev));
  }, [initialProfile]);

  const handleChangeSubject = (batchId: string, subjectId: string, sections: Section[]) => {
    setSelection((prev) => {
      const batchSel = { ...(prev[batchId] ?? {}) };
      if (sections.length === 0) {
        delete batchSel[subjectId];
      } else {
        batchSel[subjectId] = sections;
      }
      return { ...prev, [batchId]: batchSel };
    });
  };

  const handleFinish = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const assignments = buildAssignments(selection, subjects);
      await saveOnboarding(profile, assignments);
      setDone(true);
      // Brief success toast before landing on the dashboard.
      window.setTimeout(() => navigate('/dashboard', { replace: true }), 1200);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Setup save failed. Try again.');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f4f5f9] font-[Inter,system-ui,sans-serif]">
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4 py-10">
        <div className="w-full max-w-[720px] rounded-2xl border border-[#ecedf4] bg-[#fff] p-6 shadow-[0_10px_40px_-12px_rgba(29,32,48,0.18)] sm:p-8">
          {loading ? (
            <PageLoader />
          ) : error ? (
            <div className="flex flex-col gap-2 text-center">
              <p className="text-sm font-semibold text-[#f0506e]">Data load nahi ho paaya.</p>
              <p className="text-xs text-[#969cad]">{error}</p>
            </div>
          ) : (
            <>
              {step === 'profile' && (
                <ProfileStep
                  profile={profile}
                  onChange={setProfile}
                  activeBatches={batches}
                  onContinue={() => setStep('timetable')}
                />
              )}

              {step === 'timetable' && (
                <TimetableStep
                  batchesWithSubjects={batchesWithSubjects}
                  selection={selection}
                  onChangeSubject={handleChangeSubject}
                  onBack={() => setStep('profile')}
                  onContinue={() => setStep('review')}
                />
              )}

              {step === 'review' && (
                <ReviewStep
                  batchesWithSubjects={batchesWithSubjects}
                  selection={selection}
                  saving={saving}
                  onBack={() => setStep('timetable')}
                  onFinish={handleFinish}
                />
              )}

              {saveError && (
                <p className="mt-4 rounded-xl bg-[#f0506e]/10 px-4 py-2 text-center text-sm font-medium text-[#f0506e]">
                  {saveError}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {done && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#12b886] px-5 py-3 text-sm font-semibold text-white shadow-lg"
        >
          Setup complete ✓ Dashboard khul raha hai…
        </div>
      )}
    </div>
  );
}
