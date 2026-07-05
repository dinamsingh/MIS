/**
 * Step 1 - locked teacher identity plus the odd/even academic session choice.
 */

import type { AcademicSession, Batch, OnboardingProfile } from '../types';

interface ProfileStepProps {
  readonly profile: OnboardingProfile;
  readonly nameEditable: boolean;
  readonly onNameChange: (name: string) => void;
  readonly currentSession: AcademicSession | null;
  readonly onSessionChange: (session: AcademicSession) => void;
  readonly activeBatches: readonly Batch[];
  readonly onContinue: () => void;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'] as const;

const SESSION_OPTIONS: readonly { value: AcademicSession; label: string; detail: string }[] = [
  { value: 'odd', label: 'Odd', detail: 'Sem I, III, V, VII' },
  { value: 'even', label: 'Even', detail: 'Sem II, IV, VI, VIII' },
];

function toRoman(sem: number): string {
  return ROMAN[sem - 1] ?? String(sem);
}

export default function ProfileStep({
  profile,
  nameEditable,
  onNameChange,
  currentSession,
  onSessionChange,
  activeBatches,
  onContinue,
}: ProfileStepProps) {
  const canContinue =
    profile.name.trim().length > 0 && profile.email.trim().length > 0 && currentSession !== null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (canContinue) {
      onContinue();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1d2030]">Verify teacher profile</h1>
        <p className="mt-1 text-sm text-[#5a6072]">
          Your registered identity is locked for this setup.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="onb-name" className="text-sm font-medium text-[#1d2030]">
            Name
          </label>
          <input
            id="onb-name"
            type="text"
            value={profile.name}
            readOnly={!nameEditable}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Teacher name not found"
            className={[
              'rounded-xl border px-4 py-2.5 text-sm font-semibold text-[#1d2030] placeholder:text-[#969cad]',
              nameEditable
                ? 'border-[#d8dbee] bg-white focus:border-[#5b54e6] focus:outline-none focus:ring-2 focus:ring-[#5b54e6]/20'
                : 'border-[#ecedf4] bg-[#f4f5f9]',
            ].join(' ')}
          />
          {nameEditable && (
            <p className="text-xs text-[#969cad]">Name not found. Please enter it once for setup.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="onb-email" className="text-sm font-medium text-[#1d2030]">
            College email
          </label>
          <input
            id="onb-email"
            type="email"
            value={profile.email}
            readOnly
            placeholder="Registered email not found"
            className="rounded-xl border border-[#ecedf4] bg-[#f4f5f9] px-4 py-2.5 text-sm font-semibold text-[#1d2030] placeholder:text-[#969cad]"
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-[#1d2030]">Current session</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {SESSION_OPTIONS.map((option) => {
            const active = currentSession === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => onSessionChange(option.value)}
                className={[
                  'rounded-xl border px-4 py-3 text-left transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b54e6]/35',
                  active
                    ? 'border-[#5b54e6] bg-[#eef0fe] text-[#1d2030]'
                    : 'border-[#ecedf4] bg-white text-[#5a6072] hover:bg-[#f4f5f9]',
                ].join(' ')}
              >
                <span className="block text-sm font-bold">{option.label}</span>
                <span className="mt-1 block text-xs font-medium text-[#5a6072]">{option.detail}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-[#1d2030]">Session batches</span>
        {currentSession === null ? (
          <p className="rounded-xl border border-[#ecedf4] bg-[#f4f5f9] px-4 py-3 text-sm text-[#5a6072]">
            Select odd or even session to preview batches.
          </p>
        ) : activeBatches.length === 0 ? (
          <p className="text-xs text-[#969cad]">No active batches detected.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {activeBatches.map((batch) => (
              <span
                key={batch.id}
                className="inline-flex items-center rounded-full bg-[#eef0fe] px-3 py-1 text-xs font-semibold text-[#4a42d4]"
              >
                Batch {batch.id} / Sem {toRoman(batch.currentSem)}
              </span>
            ))}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={!canContinue}
        className="mt-2 inline-flex items-center justify-center rounded-xl bg-[#5b54e6] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#4a42d4] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continue
      </button>
    </form>
  );
}
