/**
 * Global selected-section context.
 *
 * A single teacher works across several class groups (e.g. CSE-5A, CSE-5B). This
 * context is the ONE source of truth for "which section is the teacher currently
 * looking at". It loads the real sections from the database (no hardcoded
 * A/B/C list), remembers the choice across reloads via localStorage, and exposes
 * the selected section to the top-bar dropdown and every page.
 *
 * Pages read `selectedSection` (a full {@link Section}, including its id and
 * semester) and load that section's data by id — no fragile name matching.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createSectionsAccess } from '@data/access/sectionsAccess';
import type { Section } from '@data/access/rows';

/** localStorage key holding the last-selected section id. */
const STORAGE_KEY = 'mis_selected_section_id';

const sectionsAccess = createSectionsAccess();

/** The value exposed by {@link useSelectedSection}. */
export interface SelectedSectionValue {
  /** Every section the teacher can switch between (from the database). */
  readonly sections: Section[];
  /** The id of the currently-selected section, or null before any load. */
  readonly selectedSectionId: string | null;
  /** The full currently-selected section, or null when none is available. */
  readonly selectedSection: Section | null;
  /** Switch the active section (persisted to localStorage). */
  readonly setSelectedSectionId: (id: string) => void;
  /** True while the section list is still loading. */
  readonly isLoading: boolean;
}

const SelectedSectionContext = createContext<SelectedSectionValue | undefined>(undefined);

/**
 * Provides the global selected-section state to its subtree. Wrap the teacher
 * area with this so the top bar and all pages share one selection.
 */
export function SelectedSectionProvider({ children }: { children: ReactNode }) {
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = await sectionsAccess.listSections();
        if (!active) return;
        setSections(loaded);

        // Restore the saved selection when it still exists; otherwise default
        // to the first available section.
        const saved = localStorage.getItem(STORAGE_KEY);
        const validSaved = saved && loaded.some((s) => s.id === saved) ? saved : null;
        setSelectedSectionIdState(validSaved ?? loaded[0]?.id ?? null);
      } catch {
        // Leave sections empty; consumers handle the empty state.
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setSelectedSectionId = (id: string) => {
    setSelectedSectionIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const value = useMemo<SelectedSectionValue>(() => {
    const selectedSection = sections.find((s) => s.id === selectedSectionId) ?? null;
    return { sections, selectedSectionId, selectedSection, setSelectedSectionId, isLoading };
  }, [sections, selectedSectionId, isLoading]);

  return (
    <SelectedSectionContext.Provider value={value}>{children}</SelectedSectionContext.Provider>
  );
}

/**
 * Read the global selected-section state. Must be used within a
 * {@link SelectedSectionProvider}; throws otherwise so misuse is caught early.
 */
export function useSelectedSection(): SelectedSectionValue {
  const ctx = useContext(SelectedSectionContext);
  if (ctx === undefined) {
    throw new Error('useSelectedSection must be used within a SelectedSectionProvider');
  }
  return ctx;
}
