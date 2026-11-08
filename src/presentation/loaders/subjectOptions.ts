import { isLocalDemoMode } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { DEMO_STORAGE_KEY, MOCK_BATCHES, MOCK_SUBJECTS, fetchLiveBatches } from '../../features/onboarding/api/onboarding';
import { readDemoValue } from '@data/demo/localDemoMode';
import type { Section as AppSection } from '@data/access/rows';
import type {
  AssignmentInput,
  OnboardingRecord,
  Section as OnboardingSection,
} from '../../features/onboarding/types';

export interface SubjectOption {
  readonly id: string;
  readonly name: string;
}

interface SubjectRow {
  readonly id: string;
  readonly name: string;
}

interface SyllabusSubjectRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

function semesterNumber(semester: string | null | undefined): number | null {
  if (!semester) {
    return null;
  }
  const match = semester.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function sectionLetter(section: Pick<AppSection, 'id' | 'name'>): OnboardingSection | null {
  const candidates = [section.name];
  for (const candidate of candidates) {
    const match = candidate.match(/(?:^|-)([ABC])$/i) ?? candidate.match(/([ABC])$/i);
    const letter = match?.[1]?.toUpperCase();
    if (letter === 'A' || letter === 'B' || letter === 'C') {
      return letter;
    }
  }
  return null;
}

function subjectLabel(subject: { readonly code?: string; readonly name: string }): string {
  return subject.code ? `${subject.code} - ${subject.name}` : subject.name;
}

function selectedSubjectIdsForAssignments(
  assignments: readonly AssignmentInput[],
  section: Pick<AppSection, 'id' | 'name' | 'batch' | 'semester'>,
): string[] {
  const letter = sectionLetter(section);
  if (!section.batch || !letter) {
    return [];
  }

  return Array.from(
    new Set(
      assignments
        .filter((assignment) => assignment.batchId === section.batch && assignment.section === letter
          && (assignment.semester === undefined || assignment.semester === semesterNumber(section.semester)))
        .map((assignment) => assignment.subjectId),
    ),
  );
}

function mergeSubjects(
  primary: readonly SubjectOption[],
  fallback: readonly SubjectOption[],
): SubjectOption[] {
  const byId = new Map<string, SubjectOption>();
  const names = new Set<string>();

  for (const subject of [...primary, ...fallback]) {
    const normalizedName = subject.name.trim().toLowerCase();
    if (byId.has(subject.id) || names.has(normalizedName)) {
      continue;
    }
    byId.set(subject.id, subject);
    names.add(normalizedName);
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function loadAssignedSyllabusSubjects(
  section: Pick<AppSection, 'id' | 'name' | 'batch' | 'semester'>,
): Promise<SubjectOption[]> {
  if (isLocalDemoMode()) {
    const record = readDemoValue<OnboardingRecord>(DEMO_STORAGE_KEY, {
      onboarded: false,
      profile: { name: '', email: '', mustResetPassword: false },
      assignments: [],
    });
    const selectedIds = new Set(selectedSubjectIdsForAssignments(record.assignments, section));
    // Scope to the batch's CURRENT semester (bugfix: batch-promotion-selector-mixing) —
    // mirrors the live-mode filter below so a stale demo assignment from
    // before a batch promotion cannot leak an old semester's subject in.
    const currentSem = MOCK_BATCHES.find((b) => b.id === section.batch)?.currentSem ?? null;
    return MOCK_SUBJECTS.filter(
      (subject) => selectedIds.has(subject.id) && (currentSem === null || subject.sem === currentSem),
    ).map((subject) => ({
      id: subject.id,
      name: subjectLabel(subject),
    }));
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const teacherId = sessionData.session?.user.id;
  const letter = sectionLetter(section);
  if (!teacherId || !section.batch || !letter) {
    return [];
  }

  const { data: assignmentRows } = await supabase
    .from('teacher_assignments')
    .select('subject_id')
    .eq('teacher_id', teacherId)
    .eq('batch_id', section.batch)
    .eq('section', letter);

  const selectedIds = Array.from(
    new Set(((assignmentRows ?? []) as Array<{ subject_id: string }>).map((row) => row.subject_id)),
  );
  if (selectedIds.length === 0) {
    return [];
  }

  // The effective semester is owner-approved for this teacher. Require the
  // selected real section to match it, so similar A/B/C names never collide.
  const batch = (await fetchLiveBatches()).find(b => b.id === section.batch);
  const currentSem = batch?.currentSem;
  if (!batch || semesterNumber(section.semester) !== currentSem
    || (batch.allowedSections && !batch.allowedSections.includes(letter))) return [];

  const { data: subjectRows } = await supabase
    .from('syllabus_subjects')
    .select('id, code, name, sem')
    .in('id', selectedIds)
    .order('code');

  const filtered = currentSem === null
    ? ((subjectRows ?? []) as Array<SyllabusSubjectRow & { sem: number }>)
    : ((subjectRows ?? []) as Array<SyllabusSubjectRow & { sem: number }>).filter(
        (subject) => subject.sem === currentSem,
      );

  return filtered.map((subject) => ({
    id: subject.id,
    name: subjectLabel(subject),
  }));
}

export async function loadSubjectOptionsForSection(
  section: (Pick<AppSection, 'id' | 'name' | 'batch' | 'semester'> & { department?: string | null }) | null | undefined,
): Promise<SubjectOption[]> {
  if (!section) {
    return [];
  }

  if (section.department && section.department !== 'CSE') return [];

  const assigned = await loadAssignedSyllabusSubjects(section);
  if (assigned.length > 0) {
    return assigned.sort((a, b) => a.name.localeCompare(b.name));
  }

  return [];
}

export async function loadSubjectOptionsForSemester(
  semester: string | null | undefined,
): Promise<SubjectOption[]> {
  if (!semester) {
    return [];
  }

  const { data } = await supabase
    .from('subjects')
    .select('id, name')
    .eq('semester', semester)
    .order('name');

  const persisted = ((data ?? []) as SubjectRow[]).map((subject) => ({
    id: subject.id,
    name: subject.name,
  }));

  if (!isLocalDemoMode()) {
    return persisted;
  }

  const sem = semesterNumber(semester);
  const demoSubjects =
    sem === null
      ? []
      : MOCK_SUBJECTS.filter((subject) => subject.sem === sem).map((subject) => ({
          id: subject.id,
          name: `${subject.code} - ${subject.name}`,
        }));

  return mergeSubjects(persisted, demoSubjects);
}

export async function loadSubjectNameMapForSection(
  section: (Pick<AppSection, 'id' | 'name' | 'batch' | 'semester'> & { department?: string | null }) | null | undefined,
): Promise<Record<string, string>> {
  const subjects = await loadSubjectOptionsForSection(section);
  return Object.fromEntries(subjects.map((subject) => [subject.id, subject.name]));
}
