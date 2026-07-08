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
        <h1 className="text-2xl font-bold text-text">Verify teacher profile</h1>
        <p className="mt-1 text-sm text-soft">
          Your registered identity is locked for this setup.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="onb-name" className="text-sm font-medium text-text">
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
              'rounded-control border px-4 py-2.5 text-sm font-semibold text-text placeholder:text-muted transition-[border-color,box-shadow,background-color] duration-fast',
              nameEditable
                ? 'border-input bg-surface focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25'
                : 'border-border bg-surface-muted text-soft',
            ].join(' ')}
          />
          {nameEditable && (
            <p className="text-xs text-muted">Name not found. Please enter it once for setup.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="onb-email" className="text-sm font-medium text-text">
            College email
          </label>
          <input
            id="onb-email"
            type="email"
            value={profile.email}
            readOnly
            placeholder="Registered email not found"
            className="rounded-control border border-border bg-surface-muted px-4 py-2.5 text-sm font-semibold text-soft placeholder:text-muted"
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-text">Current session</legend>
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
                  'rounded-control border px-4 py-3 text-left transition-[border-color,background-color,box-shadow,color] duration-fast',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
                  active
                    ? 'border-accent bg-accent-tint text-text shadow-soft'
                    : 'border-border bg-surface text-soft hover:bg-secondary hover:text-text',
                ].join(' ')}
              >
                <span className="block text-sm font-bold">{option.label}</span>
                <span className="mt-1 block text-xs font-medium text-muted">{option.detail}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-text">Session batches</span>
        {currentSession === null ? (
          <p className="rounded-control border border-border bg-surface-muted px-4 py-3 text-sm text-soft">
            Select odd or even session to preview batches.
          </p>
        ) : activeBatches.length === 0 ? (
          <p className="text-xs text-muted">No active batches detected.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {activeBatches.map((batch) => (
              <span
                key={batch.id}
                className="inline-flex items-center rounded-full bg-accent-tint px-3 py-1 text-xs font-semibold text-accent"
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
        className="btn-primary mt-2 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </form>
  );
}
