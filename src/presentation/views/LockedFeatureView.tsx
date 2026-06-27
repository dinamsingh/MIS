import { isFeatureEnabled } from '@domain/featureFlags';
import { messages } from '@domain/shared/messages';

/**
 * Props for the LockedFeatureView component.
 */
export interface LockedFeatureViewProps {
  /** Display title for the AI capability (e.g. "AI Quiz Generator"). */
  title: string;
  /** Short description shown when the feature is unlocked and ready. */
  description?: string;
}

/**
 * LockedFeatureView — renders a locked placeholder or the unlocked entry point
 * for an AI capability based on the FEATURE_AI flag.
 *
 * - While FEATURE_AI is false: shows the locked state with the "Locked —
 *   unlock later" message and executes no AI logic (Requirements 15.2, 15.3).
 * - When FEATURE_AI is true: exposes the entry point without requiring any
 *   code-structure changes (Requirement 15.4). The actual AI logic will be
 *   implemented here in a future version.
 */
export default function LockedFeatureView({ title, description }: LockedFeatureViewProps) {
  const aiEnabled = isFeatureEnabled('ai');

  if (!aiEnabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24" data-testid="locked-feature">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-text">{title}</h2>
        <p className="text-sm text-muted">{messages.features.locked}</p>
      </div>
    );
  }

  // FEATURE_AI is true — expose the entry point (Requirement 15.4).
  // AI logic will be wired here in a future version without code-structure changes.
  return (
    <div className="flex flex-col gap-4 p-6" data-testid="unlocked-feature">
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      {description && <p className="text-sm text-soft">{description}</p>}
      <div className="card flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-tint">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <span className="text-sm font-medium text-text">Ready — configure and launch</span>
      </div>
    </div>
  );
}
