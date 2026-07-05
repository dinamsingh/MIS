/**
 * Global selected-section + selected-subject context.
 *
 * A single teacher works across several class groups (e.g. CSE-5A, CSE-5B) and,
 * within each, several subjects (DBMS, OS, ...). This context is the ONE source
 * of truth for "which section AND which subject the teacher is currently looking
 * at". It loads the teacher's real sections (from onboarding), and for the
 * selected section loads that section's subjects — both driving the two global
 * dropdowns in the top bar. Choices persist across reloads via localStorage.
 *
 * Pages read `selectedSection` and `selectedSubject` (full objects, incl. ids)
 * and load that scope's data — no per-page section/subject pickers, no fragile
 * name matching.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchOnboardedSections } from '../../features/onboarding/api/onboarding';
import { loadSubjectOptionsForSection, type SubjectOption } from '@presentation/loaders/subjectOptions';
import type { Section } from '@data/access/rows';

/** localStorage key holding the last-selected section id. */
const SECTION_STORAGE_KEY = 'mis_selected_section_id';
/** localStorage key holding the last-selected subject id, keyed by section id. */
const SUBJECT_STORAGE_KEY = 'mis_selected_subject_by_section';

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
  /**
   * Reload the teacher's sections from the database. Call after editing the
   * teaching setup (Profile page) so newly added/removed sections and their
   * subjects appear immediately without a full page reload.
   */
  readonly refresh: () => void;

  /** Subjects available in the currently-selected section. */
  readonly subjects: SubjectOption[];
  /** The id of the currently-selected subject, or null when none available. */
  readonly selectedSubjectId: string | null;
  /** The full currently-selected subject, or null when none available. */
  readonly selectedSubject: SubjectOption | null;
  /** Switch the active subject (persisted per section to localStorage). */
  readonly setSelectedSubjectId: (id: string) => void;
  /** True while the selected section's subjects are still loading. */
  readonly isSubjectsLoading: boolean;
}

const SelectedSectionContext = createContext<SelectedSectionValue | undefined>(undefined);

/** Read the per-section subject map from localStorage (id → subjectId). */
function readSubjectMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SUBJECT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Persist the per-section subject choice. */
function writeSubjectChoice(sectionId: string, subjectId: string): void {
  try {
    const map = readSubjectMap();
    map[sectionId] = subjectId;
    localStorage.setItem(SUBJECT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Non-fatal: persistence is a convenience only.
  }
}

/**
 * Provides the global selected-section + selected-subject state to its subtree.
 * Wrap the teacher area with this so the top bar and all pages share one scope.
 */
export function SelectedSectionProvider({ children }: { children: ReactNode }) {
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectIdState] = useState<string | null>(null);
  const [isSubjectsLoading, setIsSubjectsLoading] = useState(false);

  // Load (or reload) the teacher's sections. Keeps the current selection when
  // it is still valid; otherwise falls back to the saved id, then the first.
  const loadSections = useCallback(async () => {
    setIsLoading(true);
    try {
      const loaded = await fetchOnboardedSections();
      setSections(loaded);
      setSelectedSectionIdState((prev) => {
        if (prev && loaded.some((s) => s.id === prev)) return prev;
        const saved = localStorage.getItem(SECTION_STORAGE_KEY);
        const validSaved = saved && loaded.some((s) => s.id === saved) ? saved : null;
        return validSaved ?? loaded[0]?.id ?? null;
      });
    } catch {
      // Leave sections empty; consumers handle the empty state.
    } finally {
      setIsLoading(false);
    }
  }, []);

  // --- Load the teacher's sections on mount. ---
  useEffect(() => {
    void loadSections();
  }, [loadSections]);

  const selectedSection = useMemo(
    () => sections.find((s) => s.id === selectedSectionId) ?? null,
    [sections, selectedSectionId],
  );

  // --- Load the selected section's subjects whenever the section changes. ---
  useEffect(() => {
    let active = true;
    if (!selectedSection) {
      setSubjects([]);
      setSelectedSubjectIdState(null);
      return;
    }
    setIsSubjectsLoading(true);
    void (async () => {
      try {
        const loaded = await loadSubjectOptionsForSection(selectedSection);
        if (!active) return;
        setSubjects(loaded);

        // Restore the subject saved for this section, else default to the first.
        const savedForSection = readSubjectMap()[selectedSection.id];
        const validSaved = savedForSection && loaded.some((s) => s.id === savedForSection)
          ? savedForSection
          : null;
        setSelectedSubjectIdState(validSaved ?? loaded[0]?.id ?? null);
      } catch {
        if (active) {
          setSubjects([]);
          setSelectedSubjectIdState(null);
        }
      } finally {
        if (active) setIsSubjectsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedSection]);

  const setSelectedSectionId = (id: string) => {
    setSelectedSectionIdState(id);
    localStorage.setItem(SECTION_STORAGE_KEY, id);
  };

  const setSelectedSubjectId = (id: string) => {
    setSelectedSubjectIdState(id);
    if (selectedSectionId) {
      writeSubjectChoice(selectedSectionId, id);
    }
  };

  const value = useMemo<SelectedSectionValue>(() => {
    const selectedSubject = subjects.find((s) => s.id === selectedSubjectId) ?? null;
    return {
      sections,
      selectedSectionId,
      selectedSection,
      setSelectedSectionId,
      isLoading,
      refresh: () => void loadSections(),
      subjects,
      selectedSubjectId,
      selectedSubject,
      setSelectedSubjectId,
      isSubjectsLoading,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, selectedSectionId, selectedSection, isLoading, loadSections, subjects, selectedSubjectId, isSubjectsLoading]);

  return (
    <SelectedSectionContext.Provider value={value}>{children}</SelectedSectionContext.Provider>
  );
}

/**
 * Read the global selected-section + subject state. Must be used within a
 * {@link SelectedSectionProvider}; throws otherwise so misuse is caught early.
 */
export function useSelectedSection(): SelectedSectionValue {
  const ctx = useContext(SelectedSectionContext);
  if (ctx === undefined) {
    throw new Error('useSelectedSection must be used within a SelectedSectionProvider');
  }
  return ctx;
}
