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

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLoader from '@presentation/components/PageLoader';
import { useOnboardingData } from './hooks/useOnboardingData';
import { buildAssignments, fetchTeacherProfile, saveOnboarding } from './api/onboarding';
import ProfileStep from './steps/ProfileStep';
import TimetableStep from './steps/TimetableStep';
import ReviewStep from './steps/ReviewStep';
import type { AcademicSession, OnboardingProfile, Section, SelectionState } from './types';
import type { WizardStep } from './components/Stepper';

const EMPTY_PROFILE: OnboardingProfile = { name: '', email: '' };

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [currentSession, setCurrentSession] = useState<AcademicSession | null>(null);
  const { loading, error, batches, subjects, batchesWithSubjects } = useOnboardingData(currentSession);

  const [step, setStep] = useState<WizardStep>('profile');
  const [profile, setProfile] = useState<OnboardingProfile>(EMPTY_PROFILE);
  const [nameEditable, setNameEditable] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionState>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    setProfileLoading(true);
    setProfileError(null);

    fetchTeacherProfile()
      .then((loadedProfile) => {
        if (active) {
          setProfile(loadedProfile);
          setNameEditable(loadedProfile.name.trim().length === 0);
          setProfileLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setProfileError(err instanceof Error ? err.message : 'Teacher profile could not be loaded.');
          setProfileLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSessionChange = (session: AcademicSession) => {
    setCurrentSession(session);
    setSelection({});
    setSaveError(null);
  };

  const handleChangeSubject = (batchId: string, subjectId: string, sections: Section[]) => {
    setSelection((prev) => {
      const batchSel = { ...(prev[batchId] ?? {}) };
      if (sections.length === 0) {
        delete batchSel[subjectId];
      } else {
        const previous = batchSel[subjectId];
        const previousSections = previous?.sections ?? [];
        const previousLabSections = previous?.labSections ?? [];
        batchSel[subjectId] = {
          sections,
          labSections: sections.filter((section) =>
            previous ? (!previousSections.includes(section) || previousLabSections.includes(section)) : true,
          ),
        };
      }
      return { ...prev, [batchId]: batchSel };
    });
  };

  const handleChangeSubjectLab = (
    batchId: string,
    subjectId: string,
    section: Section,
    includeLab: boolean,
  ) => {
    setSelection((prev) => {
      const batchSel = { ...(prev[batchId] ?? {}) };
      const subjectSelection = batchSel[subjectId];
      if (!subjectSelection) {
        return prev;
      }
      const nextLabSections = includeLab
        ? Array.from(new Set([...subjectSelection.labSections, section]))
        : subjectSelection.labSections.filter((item) => item !== section);
      batchSel[subjectId] = {
        ...subjectSelection,
        labSections: subjectSelection.sections.filter((item) => nextLabSections.includes(item)),
      };
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
          {profileLoading || loading ? (
            <PageLoader />
          ) : profileError || error ? (
            <div className="flex flex-col gap-2 text-center">
              <p className="text-sm font-semibold text-[#f0506e]">Data load nahi ho paaya.</p>
              <p className="text-xs text-[#969cad]">{profileError ?? error}</p>
            </div>
          ) : (
            <>
              {step === 'profile' && (
                <ProfileStep
                  profile={profile}
                  nameEditable={nameEditable}
                  onNameChange={(name) => setProfile((prev) => ({ ...prev, name }))}
                  currentSession={currentSession}
                  onSessionChange={handleSessionChange}
                  activeBatches={batches}
                  onContinue={() => setStep('timetable')}
                />
              )}

              {step === 'timetable' && (
                <TimetableStep
                  batchesWithSubjects={batchesWithSubjects}
                  selection={selection}
                  onChangeSubject={handleChangeSubject}
                  onChangeSubjectLab={handleChangeSubjectLab}
                  onBack={() => setStep('profile')}
                  onContinue={() => setStep('review')}
                />
              )}

              {step === 'review' && currentSession !== null && (
                <ReviewStep
                  batchesWithSubjects={batchesWithSubjects}
                  selection={selection}
                  currentSession={currentSession}
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
