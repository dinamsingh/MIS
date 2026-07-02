/**
 * Step 1 — Profile. Captures the teacher's name and college email, prefilled
 * from the auth actor when available, and shows read-only chips of the
 * auto-detected active batches.
 */

import type { Batch, OnboardingProfile } from '../types';

interface ProfileStepProps {
  readonly profile: OnboardingProfile;
  readonly onChange: (profile: OnboardingProfile) => void;
  readonly activeBatches: readonly Batch[];
  readonly onContinue: () => void;
}

export default function ProfileStep({ profile, onChange, activeBatches, onContinue }: ProfileStepProps) {
  const canContinue = profile.name.trim().length > 0 && profile.email.trim().length > 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (canContinue) {
      onContinue();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1d2030]">Aapka profile 👋</h1>
        <p className="mt-1 text-sm text-[#5a6072]">
          Chaliye shuru karte hain — thodi si jaankari.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="onb-name" className="text-sm font-medium text-[#1d2030]">
          Naam
        </label>
        <input
          id="onb-name"
          type="text"
          value={profile.name}
          onChange={(e) => onChange({ ...profile, name: e.target.value })}
          placeholder="Dr. Aapka Naam"
          className="rounded-xl border border-[#ecedf4] bg-[#fff] px-4 py-2.5 text-sm text-[#1d2030] placeholder:text-[#969cad] focus:border-[#5b54e6] focus:outline-none focus:ring-2 focus:ring-[#5b54e6]/20"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="onb-email" className="text-sm font-medium text-[#1d2030]">
          College email
        </label>
        <input
          id="onb-email"
          type="email"
          value={profile.email}
          onChange={(e) => onChange({ ...profile, email: e.target.value })}
          placeholder="you@college.edu"
          className="rounded-xl border border-[#ecedf4] bg-[#fff] px-4 py-2.5 text-sm text-[#1d2030] placeholder:text-[#969cad] focus:border-[#5b54e6] focus:outline-none focus:ring-2 focus:ring-[#5b54e6]/20"
        />
        <p className="text-xs text-[#969cad]">attendance/notifications isi par</p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-[#1d2030]">Active batches</span>
        {activeBatches.length === 0 ? (
          <p className="text-xs text-[#969cad]">No active batches detected.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {activeBatches.map((batch) => (
              <span
                key={batch.id}
                className="inline-flex items-center rounded-full bg-[#eef0fe] px-3 py-1 text-xs font-semibold text-[#4a42d4]"
              >
                Batch {batch.id}
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
        Continue →
      </button>
    </form>
  );
}
