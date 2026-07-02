/**
 * Compact three-step progress indicator (Profile · Timetable · Review).
 * The current step is highlighted with the accent color; completed steps use a
 * softer accent, upcoming steps are muted.
 */

export type WizardStep = 'profile' | 'timetable' | 'review';

const STEPS: readonly { key: WizardStep; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'timetable', label: 'Timetable' },
  { key: 'review', label: 'Review' },
];

interface StepperProps {
  readonly current: WizardStep;
}

export default function Stepper({ current }: StepperProps) {
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
                  ? 'bg-[#5b54e6] text-white'
                  : isDone
                    ? 'bg-[#eef0fe] text-[#4a42d4]'
                    : 'bg-[#f0f1f5] text-[#969cad]',
              ].join(' ')}
            >
              {index + 1}
            </span>
            <span
              className={[
                'text-sm font-medium',
                isCurrent ? 'text-[#1d2030]' : 'text-[#969cad]',
              ].join(' ')}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 && <span className="mx-1 text-[#ecedf4]">·</span>}
          </li>
        );
      })}
    </ol>
  );
}
