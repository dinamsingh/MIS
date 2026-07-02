/**
 * Data access for the onboarding wizard.
 *
 * Every read/write branches on {@link isLocalDemoMode}:
 *  - Demo mode  → local mock arrays (mirroring `onboarding_seed.sql`) and
 *    localStorage (`mis_onboarding_v1`); no Supabase calls are made.
 *  - Live mode  → the shared authenticated Supabase client, scoped to the
 *    current user's id (RLS enforces per-teacher ownership server-side).
 */

import { supabase } from '@data/supabase';
import { isLocalDemoMode, readDemoValue, writeDemoValue } from '@data/demo/localDemoMode';
import type {
  AssignmentInput,
  Batch,
  OnboardingProfile,
  OnboardingRecord,
  SyllabusSubject,
} from '../types';

/** localStorage key holding the demo onboarding record. */
export const DEMO_STORAGE_KEY = 'mis_onboarding_v1';

/** Stable synthetic id for a demo subject (deterministic across reloads). */
const demoSubjectId = (code: string): string => `demo-subject-${code}`;

// ---------------------------------------------------------------------------
// Mock data — MIRRORS src/data/seeds/onboarding_seed.sql
// ---------------------------------------------------------------------------

/** Demo batches (mirrors the seed; includes the graduated one, filtered later). */
export const MOCK_BATCHES: readonly Batch[] = [
  { id: '2025-29', startYear: 2025, currentSem: 1, status: 'classes' },
  { id: '2024-28', startYear: 2024, currentSem: 3, status: 'classes' },
  { id: '2023-27', startYear: 2023, currentSem: 5, status: 'classes' },
  { id: '2022-26', startYear: 2022, currentSem: 7, status: 'classes' },
  { id: '2021-25', startYear: 2021, currentSem: 8, status: 'graduated' },
];

type SubjectSeed = Omit<SyllabusSubject, 'id'>;

/** Demo syllabus subjects (mirrors the RGPV CSE Sem 1–8 seed rows). */
const SUBJECT_SEEDS: readonly SubjectSeed[] = [
  // Sem 1 (I)
  { sem: 1, code: 'BT-101', name: 'Engineering Chemistry', kind: 'theory', labName: 'Engineering Chemistry Lab' },
  { sem: 1, code: 'BT-102', name: 'Mathematics-I', kind: 'theory', labName: null },
  { sem: 1, code: 'BT-103', name: 'English for Communication', kind: 'theory', labName: 'English Communication Lab' },
  { sem: 1, code: 'BT-104', name: 'Basic Electrical & Electronics Engineering', kind: 'theory', labName: 'Basic Electrical & Electronics Lab' },
  { sem: 1, code: 'BT-105', name: 'Engineering Graphics', kind: 'theory', labName: 'Engineering Graphics Lab' },
  { sem: 1, code: 'BT-106', name: 'Manufacturing Practices (Lab)', kind: 'lab', labName: null },
  { sem: 1, code: 'BT-107', name: 'Internship-I', kind: 'special', labName: null },
  { sem: 1, code: 'BT-108', name: 'Rural Outreach / Swachh Bharat Internship', kind: 'special', labName: null },

  // Sem 2 (II)
  { sem: 2, code: 'BT-201', name: 'Engineering Physics', kind: 'theory', labName: 'Engineering Physics Lab' },
  { sem: 2, code: 'BT-202', name: 'Mathematics-II', kind: 'theory', labName: null },
  { sem: 2, code: 'BT-203', name: 'Basic Mechanical Engineering', kind: 'theory', labName: 'Basic Mechanical Engineering Lab' },
  { sem: 2, code: 'BT-204', name: 'Basic Civil Engineering & Mechanics', kind: 'theory', labName: 'Basic Civil Engineering & Mechanics Lab' },
  { sem: 2, code: 'BT-205', name: 'Basic Computer Engineering', kind: 'theory', labName: 'Basic Computer Engineering Lab' },
  { sem: 2, code: 'BT-206', name: 'Language Lab & Seminars', kind: 'lab', labName: null },

  // Sem 3 (III)
  { sem: 3, code: 'ES-301', name: 'Energy & Environmental Engineering', kind: 'theory', labName: null },
  { sem: 3, code: 'CS-302', name: 'Discrete Structure', kind: 'theory', labName: null },
  { sem: 3, code: 'CS-303', name: 'Data Structure', kind: 'theory', labName: 'Data Structure Lab' },
  { sem: 3, code: 'CS-304', name: 'Digital Systems', kind: 'theory', labName: 'Digital Systems Lab' },
  { sem: 3, code: 'CS-305', name: 'Object Oriented Programming & Methodology', kind: 'theory', labName: 'OOP Lab' },
  { sem: 3, code: 'CS-306', name: 'Computer Workshop (Lab)', kind: 'lab', labName: null },
  { sem: 3, code: 'BT-307', name: 'Internship-II', kind: 'special', labName: null },

  // Sem 4 (IV)
  { sem: 4, code: 'BT-401', name: 'Mathematics-III', kind: 'theory', labName: null },
  { sem: 4, code: 'CS-402', name: 'Analysis & Design of Algorithms', kind: 'theory', labName: 'ADA Lab' },
  { sem: 4, code: 'CS-403', name: 'Software Engineering', kind: 'theory', labName: 'Software Engineering Lab' },
  { sem: 4, code: 'CS-404', name: 'Computer Organization & Architecture', kind: 'theory', labName: 'COA Lab' },
  { sem: 4, code: 'CS-405', name: 'Operating Systems', kind: 'theory', labName: 'Operating Systems Lab' },
  { sem: 4, code: 'CS-406', name: 'Programming Practices (Lab)', kind: 'lab', labName: null },
  { sem: 4, code: 'BT-407', name: 'Internship-II', kind: 'special', labName: null },
  { sem: 4, code: 'BT-408', name: 'Cyber Security (Audit)', kind: 'special', labName: null },

  // Sem 5 (V)
  { sem: 5, code: 'CS-501', name: 'Theory of Computation', kind: 'theory', labName: 'TOC Lab' },
  { sem: 5, code: 'CS-502', name: 'Database Management Systems', kind: 'theory', labName: 'DBMS Lab' },
  { sem: 5, code: 'CS-503', name: 'Departmental Elective-I', kind: 'elective', labName: null },
  { sem: 5, code: 'CS-504', name: 'Open Elective-I', kind: 'elective', labName: null },
  { sem: 5, code: 'CS-505', name: 'Mini Project', kind: 'project', labName: null },
  { sem: 5, code: 'CS-506', name: 'Skill Development / Practical', kind: 'lab', labName: null },

  // Sem 6 (VI)
  { sem: 6, code: 'CS-601', name: 'Machine Learning', kind: 'theory', labName: 'Machine Learning Lab' },
  { sem: 6, code: 'CS-602', name: 'Computer Networks', kind: 'theory', labName: 'Computer Networks Lab' },
  { sem: 6, code: 'CS-603', name: 'Departmental Elective-II', kind: 'elective', labName: null },
  { sem: 6, code: 'CS-604', name: 'Open Elective-II', kind: 'elective', labName: null },
  { sem: 6, code: 'CS-605', name: 'Minor Project', kind: 'project', labName: null },
  { sem: 6, code: 'CS-606', name: 'Internship / Skill Development', kind: 'special', labName: null },

  // Sem 7 (VII)
  { sem: 7, code: 'CS-7001', name: 'Distributed Systems', kind: 'theory', labName: null },
  { sem: 7, code: 'CS-7002', name: 'Compiler Design', kind: 'theory', labName: null },
  { sem: 7, code: 'CS-7003', name: 'Web Engineering', kind: 'theory', labName: null },
  { sem: 7, code: 'CS-7004', name: 'Departmental Elective-III', kind: 'elective', labName: null },
  { sem: 7, code: 'CS-7005', name: 'Departmental Elective-IV', kind: 'elective', labName: null },
  { sem: 7, code: 'CS-7006', name: 'Major Project Phase-I', kind: 'project', labName: null },
  { sem: 7, code: 'CS-7007', name: 'Seminar', kind: 'special', labName: null },

  // Sem 8 (VIII)
  { sem: 8, code: 'CS-8001', name: 'Major Project Phase-II', kind: 'project', labName: null },
  { sem: 8, code: 'CS-8002', name: 'Comprehensive Viva', kind: 'special', labName: null },
  { sem: 8, code: 'CS-8003', name: 'Industrial Training / Internship', kind: 'special', labName: null },
];

/** Demo syllabus subjects with deterministic ids derived from their code. */
export const MOCK_SUBJECTS: readonly SyllabusSubject[] = SUBJECT_SEEDS.map((seed) => ({
  id: demoSubjectId(seed.code),
  ...seed,
}));

// ---------------------------------------------------------------------------
// Demo-mode localStorage helpers
// ---------------------------------------------------------------------------

const EMPTY_RECORD: OnboardingRecord = {
  onboarded: false,
  profile: { name: '', email: '' },
  assignments: [],
};

function readDemoRecord(): OnboardingRecord {
  return readDemoValue<OnboardingRecord>(DEMO_STORAGE_KEY, EMPTY_RECORD);
}

// ---------------------------------------------------------------------------
// Row types + mappers (live mode)
// ---------------------------------------------------------------------------

interface BatchRow {
  id: string;
  start_year: number;
  current_sem: number;
  status: Batch['status'];
}

interface SubjectRow {
  id: string;
  sem: number;
  code: string;
  name: string;
  kind: SyllabusSubject['kind'];
  lab_name: string | null;
}

const toBatch = (row: BatchRow): Batch => ({
  id: row.id,
  startYear: row.start_year,
  currentSem: row.current_sem,
  status: row.status,
});

const toSubject = (row: SubjectRow): SyllabusSubject => ({
  id: row.id,
  sem: row.sem,
  code: row.code,
  name: row.name,
  kind: row.kind,
  labName: row.lab_name,
});

/** Resolve the current teacher's id from the Supabase session (live mode). */
async function requireTeacherId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) {
    throw new Error('No authenticated teacher session.');
  }
  return userId;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Load the live batches (status !== 'graduated'). */
export async function fetchLiveBatches(): Promise<Batch[]> {
  if (isLocalDemoMode()) {
    return MOCK_BATCHES.filter((b) => b.status !== 'graduated');
  }
  const { data, error } = await supabase
    .from('batches')
    .select('id, start_year, current_sem, status')
    .neq('status', 'graduated')
    .order('start_year', { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return (data as BatchRow[]).map(toBatch);
}

/** Load syllabus subjects for the given set of semesters. */
export async function fetchSubjectsForSems(sems: readonly number[]): Promise<SyllabusSubject[]> {
  const unique = Array.from(new Set(sems));
  if (unique.length === 0) {
    return [];
  }
  if (isLocalDemoMode()) {
    return MOCK_SUBJECTS.filter((s) => unique.includes(s.sem));
  }
  const { data, error } = await supabase
    .from('syllabus_subjects')
    .select('id, sem, code, name, kind, lab_name')
    .in('sem', unique)
    .order('sem', { ascending: true })
    .order('code', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return (data as SubjectRow[]).map(toSubject);
}

/** Return whether the current teacher has completed onboarding. */
export async function fetchOnboardedStatus(): Promise<boolean> {
  if (isLocalDemoMode()) {
    return readDemoRecord().onboarded;
  }
  const teacherId = await requireTeacherId();
  const { data, error } = await supabase
    .from('teachers')
    .select('onboarded')
    .eq('id', teacherId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data?.onboarded === true;
}

/**
 * Persist the onboarding result: writes all assignment rows and flips the
 * teacher's `onboarded` flag to true.
 */
export async function saveOnboarding(
  profile: OnboardingProfile,
  assignments: readonly AssignmentInput[],
): Promise<void> {
  if (isLocalDemoMode()) {
    const record: OnboardingRecord = { onboarded: true, profile, assignments };
    writeDemoValue<OnboardingRecord>(DEMO_STORAGE_KEY, record);
    return;
  }

  const teacherId = await requireTeacherId();

  // Ensure the teacher profile row exists and is marked onboarded.
  const { error: teacherError } = await supabase.from('teachers').upsert(
    {
      id: teacherId,
      name: profile.name,
      email: profile.email,
      onboarded: true,
    },
    { onConflict: 'id' },
  );
  if (teacherError) {
    throw new Error(teacherError.message);
  }

  if (assignments.length > 0) {
    const rows = assignments.map((a) => ({
      teacher_id: teacherId,
      subject_id: a.subjectId,
      batch_id: a.batchId,
      section: a.section,
      is_lab: a.isLab,
    }));
    const { error: assignError } = await supabase
      .from('teacher_assignments')
      .upsert(rows, { onConflict: 'teacher_id,subject_id,batch_id,section,is_lab' });
    if (assignError) {
      throw new Error(assignError.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Selection → assignment rows (pure)
// ---------------------------------------------------------------------------

/**
 * Flatten the wizard's selection state into concrete assignment rows.
 *
 * Each selected (subject, section) yields one row. When the subject is a
 * `theory` subject that carries a `labName`, an additional `is_lab = true` row
 * is auto-attached for the same subject+section.
 */
export function buildAssignments(
  selection: import('../types').SelectionState,
  subjects: readonly SyllabusSubject[],
): AssignmentInput[] {
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const rows: AssignmentInput[] = [];

  for (const [batchId, subjectMap] of Object.entries(selection)) {
    for (const [subjectId, sections] of Object.entries(subjectMap)) {
      const subject = byId.get(subjectId);
      for (const section of sections) {
        rows.push({ subjectId, batchId, section, isLab: false });
        if (subject && subject.kind === 'theory' && subject.labName) {
          rows.push({ subjectId, batchId, section, isLab: true });
        }
      }
    }
  }

  return rows;
}
