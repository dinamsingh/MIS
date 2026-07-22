/**
 * Teacher Profile & Teaching Setup page.
 *
 * Shows the teacher's profile (name editable, email locked) and an editor to
 * change which subjects/sections they teach AFTER onboarding. The editor reuses
 * the onboarding subject-selection UI (SemAccordion), pre-filled with the
 * teacher's current assignments, and saves via the same idempotent path
 * (saveOnboarding = delete-all + re-insert). On save it refreshes the global
 * section selector so changes appear immediately.
 *
 * Removing a subject/section only changes what is visible in the selector and
 * dashboard — it does NOT delete historical attendance/marks/quizzes, which are
 * owned per teacher and keyed by section, not by these assignments.
 */

import { useEffect, useMemo, useState } from 'react';
import PageLoader from '@presentation/components/PageLoader';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import SemAccordion from '../onboarding/components/SemAccordion';
import StaleAssignmentBanner from '../onboarding/components/StaleAssignmentBanner';
import { buildAssignments, fetchTeacherProfile, saveOnboarding } from '../onboarding/api/onboarding';
import type { OnboardingProfile, Section, SelectionState } from '../onboarding/types';
import { useProfileData } from './hooks/useProfileData';

const EMPTY_PROFILE: OnboardingProfile = { name: '', email: '', mustResetPassword: false };

/** Count distinct subjects, sections and batches picked across the selection. */
function summarize(selection: SelectionState) {
  const subjectIds = new Set<string>();
  const sectionKeys = new Set<string>();
  const batchIds = new Set<string>();
  for (const [batchId, subjectMap] of Object.entries(selection)) {
    for (const [subjectId, sel] of Object.entries(subjectMap)) {
      if (sel.sections.length === 0) continue;
      subjectIds.add(subjectId);
      batchIds.add(batchId);
      for (const section of sel.sections) {
        sectionKeys.add(`${batchId}-${section}`);
      }
    }
  }
  return { subjects: subjectIds.size, sections: sectionKeys.size, batches: batchIds.size };
}

export default function ProfilePage() {
  const { refresh } = useSelectedSection();
  const { loading, error, subjects, batchesWithSubjects, initialSelection } = useProfileData();

  const [profile, setProfile] = useState<OnboardingProfile>(EMPTY_PROFILE);
  const [profileLoading, setProfileLoading] = useState(true);
  const [selection, setSelection] = useState<SelectionState>({});
  const [seeded, setSeeded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Load the teacher's profile (name + email).
  useEffect(() => {
    let active = true;
    setProfileLoading(true);
    fetchTeacherProfile()
      .then((loaded) => active && (setProfile(loaded), setProfileLoading(false)))
      .catch(() => active && setProfileLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // Seed the editor with the current assignments once they load.
  useEffect(() => {
    if (!loading && !seeded) {
      setSelection(initialSelection);
      setSeeded(true);
    }
  }, [loading, seeded, initialSelection]);

  const handleChangeSubject = (batchId: string, subjectId: string, sections: Section[]) => {
    setSavedAt(null);
    setSelection((prev) => {
      const batchSel = { ...(prev[batchId] ?? {}) };
      if (sections.length === 0) {
        delete batchSel[subjectId];
      } else {
        const previous = batchSel[subjectId];
        const previousSections = previous?.sections ?? [];
        const previousLabSections = previous?.labSections ?? [];
        batchSel[subjectId] = {
          sections,
          labSections: sections.filter((section) =>
            previous ? (!previousSections.includes(section) || previousLabSections.includes(section)) : true,
          ),
        };
      }
      return { ...prev, [batchId]: batchSel };
    });
  };

  const handleChangeSubjectLab = (
    batchId: string,
    subjectId: string,
    section: Section,
    includeLab: boolean,
  ) => {
    setSavedAt(null);
    setSelection((prev) => {
      const batchSel = { ...(prev[batchId] ?? {}) };
      const subjectSelection = batchSel[subjectId];
      if (!subjectSelection) return prev;
      const nextLabSections = includeLab
        ? Array.from(new Set([...subjectSelection.labSections, section]))
        : subjectSelection.labSections.filter((item) => item !== section);
      batchSel[subjectId] = {
        ...subjectSelection,
        labSections: subjectSelection.sections.filter((item) => nextLabSections.includes(item)),
      };
      return { ...prev, [batchId]: batchSel };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const assignments = buildAssignments(selection, subjects);
      await saveOnboarding(profile, assignments);
      refresh();
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => summarize(selection), [selection]);

  if (loading || profileLoading) {
    return <PageLoader />;
  }

  if (error) {
    return (
      <div className="rounded-card border border-border bg-surface p-6 text-center">
        <p className="text-sm font-semibold text-status-red">Failed to load profile.</p>
        <p className="mt-1 text-xs text-muted">{error}</p>
      </div>
    );
  }

  const initials = (profile.name || profile.email || 'T').trim().charAt(0).toUpperCase();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <StaleAssignmentBanner />

      {/* Profile card */}
      <section className="rounded-card border border-border bg-surface p-6 shadow-soft">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xl font-bold text-accent">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Naam</label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => {
                setSavedAt(null);
                setProfile((prev) => ({ ...prev, name: e.target.value }));
              }}
              placeholder="Aapka naam"
              className="mt-1 w-full max-w-sm rounded-control border border-border bg-background px-3 py-2 text-sm font-medium text-text focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Email</p>
            <p className="mt-1 truncate text-sm font-medium text-soft">{profile.email || '—'}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { label: 'Subjects', value: stats.subjects },
            { label: 'Sections', value: stats.sections },
            { label: 'Batches', value: stats.batches },
          ].map((s) => (
            <div key={s.label} className="rounded-control border border-border bg-background px-4 py-3 text-center">
              <p className="text-2xl font-bold text-text">{s.value}</p>
              <p className="text-[11px] font-medium text-muted">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Teaching-setup editor */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-text">My Teaching Subjects</h2>
            <p className="mt-0.5 text-xs text-muted">
              Subjects and sections for each batch can be edited here. Removing a subject does
              not delete its records — it only hides it from the selector.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center rounded-full bg-accent-tint px-3 py-1 text-xs font-semibold text-accent">
            {stats.sections} selected
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {batchesWithSubjects.length === 0 ? (
            <p className="rounded-card border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
              No live batch found.
            </p>
          ) : (
            batchesWithSubjects.map(({ batch, subjects: batchSubjects }) => (
              <SemAccordion
                key={batch.id}
                batch={batch}
                subjects={batchSubjects}
                selection={selection[batch.id] ?? {}}
                expanded={expandedId === batch.id}
                onToggle={() => setExpandedId((prev) => (prev === batch.id ? null : batch.id))}
                onChangeSubject={(subjectId, sections) => handleChangeSubject(batch.id, subjectId, sections)}
                onChangeSubjectLab={(subjectId, section, includeLab) =>
                  handleChangeSubjectLab(batch.id, subjectId, section, includeLab)
                }
              />
            ))
          )}
        </div>

        {saveError && (
          <p className="rounded-control bg-status-red/10 px-4 py-2 text-sm font-medium text-status-red">
            {saveError}
          </p>
        )}
        {savedAt && !saveError && (
          <p className="rounded-control bg-status-green/10 px-4 py-2 text-sm font-medium text-status-green">
            Changes save ho gaye ✓
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-control bg-accent px-6 py-3 text-sm font-semibold text-surface shadow-soft transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </section>
    </div>
  );
}
