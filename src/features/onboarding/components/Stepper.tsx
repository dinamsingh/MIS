/**
 * Compact progress indicator: Profile · Timetable · Review, plus an optional
 * fourth "Password" step shown only for a teacher whose account was
 * auto-created by an admin (`profile.mustResetPassword`). The current step is
 * highlighted with the accent color; completed steps use a softer accent,
 * upcoming steps are muted.
 */

export type WizardStep = 'profile' | 'timetable' | 'review' | 'password';

const BASE_STEPS: readonly { key: WizardStep; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'timetable', label: 'Timetable' },
  { key: 'review', label: 'Review' },
];

const PASSWORD_STEP = { key: 'password' as const, label: 'Password' };

interface StepperProps {
  readonly current: WizardStep;
  /**
   * Include the "Password" step in the displayed sequence. Defaults to
   * false so a teacher who does NOT need the forced password reset sees the
   * exact same three-step stepper as before this feature existed.
   */
  readonly includePassword?: boolean;
}

export default function Stepper({ current, includePassword = false }: StepperProps) {
  const STEPS = includePassword ? [...BASE_STEPS, PASSWORD_STEP] : BASE_STEPS;
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <ol className="flex items-center gap-2" aria-label="Onboarding progress">
      {STEPS.map((step, index) => {
        const isCurrent = index === currentIndex;
        const isDone = index < currentIndex;
        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              aria-current={isCurrent ? 'step' : undefined}
              className={[
                'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                isCurrent
                  ? 'bg-accent text-surface'
                  : isDone
                    ? 'bg-accent-tint text-accent'
                    : 'bg-secondary text-muted',
              ].join(' ')}
            >
              {index + 1}
            </span>
            <span
              className={[
                'text-sm font-medium',
                isCurrent ? 'text-text' : 'text-muted',
              ].join(' ')}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 && <span className="mx-1 text-border">·</span>}
          </li>
        );
      })}
    </ol>
  );
}
