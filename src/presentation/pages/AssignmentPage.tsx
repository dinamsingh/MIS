/**
 * Assignment page — wires the Excel-style AssignmentGridView to real data.
 *
 * Uses the simplified slot-based access model (migration 0030):
 *   • No file upload, no share token, no creation form
 *   • Subjects come from the teacher's timetable assignment
 *   • Students come from all onboarded sections (shared-materials model)
 *   • Lab file is tracked per student per subject (one DONE checkbox)
 */

import { useEffect, useState, useMemo } from 'react';
import AssignmentGridView, {
  type GridSubject,
  type GridStudent,
  type AssignmentGridAccess,
} from '@presentation/views/AssignmentView';
import { createAssignmentAccess } from '@data/access/assignmentAccess';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { loadRosterStudentsForSection } from '@presentation/loaders/rosterStudents';
import { loadSubjectOptionsForSection } from '@presentation/loaders/subjectOptions';
import {
  isLocalDemoMode,
  readDemoValue,
  writeDemoValue,
  createDemoId,
  demoNumber,
} from '@data/demo/localDemoMode';
import type { SubmissionStatus } from '@domain/shared/types';

// ---------------------------------------------------------------------------
// Supabase-backed access adapter
// ---------------------------------------------------------------------------

const assignmentAccess = createAssignmentAccess(supabase);

function createSupabaseAccess(): AssignmentGridAccess {
  return {
    listSlotsForSubject: (subjectId) =>
      assignmentAccess.listSlotsForSubject(subjectId),

    getOrCreateSlot: (subjectId, slotNumber) =>
      assignmentAccess.getOrCreateSlot(subjectId, slotNumber),

    getSlotSubmissions: (assignmentId, studentIds) =>
      assignmentAccess.getSlotSubmissions(assignmentId, studentIds),

    setSlotSubmission: (assignmentId, studentId, status) =>
      assignmentAccess.setSlotSubmission(assignmentId, studentId, status),

    getLabManualsBySubject: (studentIds, subjectId) =>
      assignmentAccess.getLabManualsBySubject(studentIds, subjectId),

    setLabManualBySubject: (studentId, subjectId, status) =>
      assignmentAccess.setLabManualBySubject(studentId, subjectId, status),
  };
}

// ---------------------------------------------------------------------------
// Demo-mode access adapter (localStorage-backed)
// ---------------------------------------------------------------------------

const DEMO_SLOT_STORE_KEY = 'mis_demo_assignment_slots_v2';
const DEMO_SUB_STORE_KEY  = 'mis_demo_assignment_subs_v2';
const DEMO_LAB_STORE_KEY  = 'mis_demo_lab_by_subject_v2';

interface DemoSlotStore {
  /** slotsBySubject[subjectId][slotNumber] = assignmentId */
  readonly slotsBySubject: Record<string, Record<string, string>>;
}

interface DemoSubStore {
  /** subs[assignmentId][studentId] = status */
  readonly subs: Record<string, Record<string, SubmissionStatus>>;
}

interface DemoLabStore {
  /** lab[subjectId][studentId] = status */
  readonly lab: Record<string, Record<string, SubmissionStatus>>;
}

function readDemoSlots(): DemoSlotStore {
  return readDemoValue<DemoSlotStore>(DEMO_SLOT_STORE_KEY, { slotsBySubject: {} });
}
function readDemoSubs(): DemoSubStore {
  return readDemoValue<DemoSubStore>(DEMO_SUB_STORE_KEY, { subs: {} });
}
function readDemoLab(): DemoLabStore {
  return readDemoValue<DemoLabStore>(DEMO_LAB_STORE_KEY, { lab: {} });
}

function createDemoAccess(students: readonly GridStudent[]): AssignmentGridAccess {
  return {
    async listSlotsForSubject(subjectId) {
      const store = readDemoSlots();
      const subjectSlots = store.slotsBySubject[subjectId] ?? {};
      return Object.entries(subjectSlots).map(([n, id]) => ({
        id,
        slotNumber: Number(n),
      })).sort((a, b) => a.slotNumber - b.slotNumber);
    },

    async getOrCreateSlot(subjectId, slotNumber) {
      const store = readDemoSlots();
      const existing = store.slotsBySubject[subjectId]?.[String(slotNumber)];
      if (existing) return existing;
      const id = createDemoId('slot');
      writeDemoValue<DemoSlotStore>(DEMO_SLOT_STORE_KEY, {
        slotsBySubject: {
          ...store.slotsBySubject,
          [subjectId]: {
            ...(store.slotsBySubject[subjectId] ?? {}),
            [String(slotNumber)]: id,
          },
        },
      });
      return id;
    },

    async getSlotSubmissions(assignmentId, studentIds) {
      const store = readDemoSubs();
      const saved = store.subs[assignmentId] ?? {};
      const result: Record<string, SubmissionStatus> = {};
      for (const sid of studentIds) {
        result[sid] =
          saved[sid] ??
          (demoNumber(`${assignmentId}:${sid}:slot`, 0, 1) > 0.42
            ? 'submitted'
            : 'not-submitted');
      }
      return result;
    },

    async setSlotSubmission(assignmentId, studentId, status) {
      const store = readDemoSubs();
      writeDemoValue<DemoSubStore>(DEMO_SUB_STORE_KEY, {
        subs: {
          ...store.subs,
          [assignmentId]: {
            ...(store.subs[assignmentId] ?? {}),
            [studentId]: status,
          },
        },
      });
    },

    async getLabManualsBySubject(studentIds, subjectId) {
      const store = readDemoLab();
      const saved = store.lab[subjectId] ?? {};
      const result: Record<string, SubmissionStatus> = {};
      for (const sid of studentIds) {
        result[sid] =
          saved[sid] ??
          (demoNumber(`${subjectId}:${sid}:lab`, 0, 1) > 0.5
            ? 'submitted'
            : 'not-submitted');
      }
      return result;
    },

    async setLabManualBySubject(studentId, subjectId, status) {
      const store = readDemoLab();
      writeDemoValue<DemoLabStore>(DEMO_LAB_STORE_KEY, {
        lab: {
          ...store.lab,
          [subjectId]: {
            ...(store.lab[subjectId] ?? {}),
            [studentId]: status,
          },
        },
      });
    },
  };

  // suppress unused warning — students used only for demo seed
  void students;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function AssignmentPage() {
  const { selectedSection } = useSelectedSection();

  const [subjects, setSubjects] = useState<GridSubject[]>([]);
  const [students, setStudents] = useState<GridStudent[]>([]);

  // Load subjects + students when selected section changes
  useEffect(() => {
    if (!selectedSection) {
      setSubjects([]);
      setStudents([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [opts, roster] = await Promise.all([
          loadSubjectOptionsForSection(selectedSection),
          loadRosterStudentsForSection(selectedSection),
        ]);
        if (!cancelled) {
          setSubjects(opts);
          setStudents(
            roster.map((s) => ({
              id: s.id,
              name: s.name,
              enrollmentNumber: s.enrollmentNumber,
              sectionLabel: s.sectionLabel,
            })),
          );
        }
      } catch {
        if (!cancelled) {
          setSubjects([]);
          setStudents([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSection]);

  const access = useMemo<AssignmentGridAccess>(
    () => (isLocalDemoMode() ? createDemoAccess(students) : createSupabaseAccess()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLocalDemoMode()],
  );

  return (
    <AssignmentGridView
      subjects={subjects}
      students={students}
      access={access}
    />
  );
}
