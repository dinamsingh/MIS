/**
 * Resolves whether the current teacher has finished onboarding.
 *
 * Used by the routing gate in `App.tsx` to redirect un-onboarded teachers to
 * `/onboarding` and to keep already-onboarded teachers out of it. While the
 * status is loading the caller renders a loader/null to avoid redirect flicker.
 */

import { useEffect, useState } from 'react';
import { fetchOnboardedStatus } from '../api/onboarding';

export interface OnboardingStatus {
  readonly loading: boolean;
  readonly onboarded: boolean;
}

export function useOnboardingStatus(): OnboardingStatus {
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetchOnboardedStatus()
      .then((value) => {
        if (active) {
          setOnboarded(value);
          setLoading(false);
        }
      })
      .catch(() => {
        // On any read failure, treat the teacher as not onboarded so the
        // wizard is offered rather than silently skipped.
        if (active) {
          setOnboarded(false);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return { loading, onboarded };
}
