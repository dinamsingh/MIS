/**
 * featureFlags — reads feature flags from build-time environment variables
 * (Requirements 15.4, 18.3).
 *
 * The FEATURE_AI flag controls whether the AI Quiz Generator and Risk
 * Predictor capabilities are active or rendered as locked placeholders. All
 * configuration is loaded from environment variables rather than hard-coded
 * values (Requirement 18.3); in the static Vite bundle that means
 * `import.meta.env.VITE_FEATURE_AI`.
 *
 * When the flag is true the AI entry points are exposed without any code
 * structure changes (Requirement 15.4) — only this flag flips.
 */

/** Known feature flags. */
export type FeatureFlag = 'ai';

/**
 * Parse an environment string into a boolean. Treats 'true' and '1'
 * (case-insensitive, trimmed) as enabled; everything else, including unset, as
 * disabled. This keeps locked features inactive by default.
 */
export function parseBooleanFlag(value: string | undefined | null): boolean {
  if (value == null) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
}

/** Resolved feature flag values, read once from build-time env. */
export const featureFlags: Readonly<Record<FeatureFlag, boolean>> = Object.freeze({
  ai: parseBooleanFlag(import.meta.env.VITE_FEATURE_AI),
});

/** Returns whether a given feature flag is enabled. */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return featureFlags[flag];
}
