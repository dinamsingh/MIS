import { useEffect, useMemo, useState } from 'react';
import AssignmentView, {
  type AssignmentSubjectOption,
  type AssignmentUnitOption,
  type AssignmentStudent,
  type AssignmentViewAccess,
  type AssignmentListItem,
  type UploadedAssignmentFile,
} from '@presentation/views/AssignmentView';
import { createAssignmentAccess } from '@data/access/assignmentAccess';
import { createTimetableAccess } from '@data/access/timetableAccess';
import { fileStorage } from '@data/storage';
import {
  createDemoAssignment,
  createDemoMaterial,
  getDemoAssignmentSubmission,
  getDemoLabManualSubmission,
  isLocalDemoMode,
  listDemoAssignments,
  setDemoAssignmentSubmission,
  setDemoLabManualSubmission,
} from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { loadRosterStudentsForSections } from '@presentation/loaders/rosterStudents';
import { loadSubjectOptionsForSection } from '@presentation/loaders/subjectOptions';
import type { UploadPolicy } from '@domain/services/storageRouter';

const assignmentAccess = createAssignmentAccess(supabase);
const timetableAccess = createTimetableAccess(supabase);

const ASSIGNMENT_POLICY: UploadPolicy = {
  allowedTypes: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  maxSizeBytes: 25 * 1024 * 1024,
};

/**
 * Compose the AssignmentViewAccess from the assignment data access + file
 * storage. `listAssignments` is scoped to the active semester's subjects, so it
 * depends on the globally-selected section's semester.
 */
function createAccess(
  semester: string | null,
  subjects: readonly AssignmentSubjectOption[],
  students: readonly AssignmentStudent[],
): AssignmentViewAccess {
  if (isLocalDemoMode()) {
    return {
      createAssignment: (input) => Promise.resolve(createDemoAssignment(input)),

      async uploadFile(file: File): Promise<UploadedAssignmentFile> {
        const material = createDemoMaterial({
          category: 'assignment',
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        });
        return { fileId: material.id, url: material.url };
      },

      async listAssignments(): Promise<AssignmentListItem[]> {
        const subjectIds = subjects.map((subject) => subject.id);
        return listDemoAssignments(subjectIds).map((item) => ({
          id: item.id,
          title: item.title,
          subjectId: item.subjectId,
          unitId: item.unitId,
          dueDate: item.dueDate,
          shareLink: `${window.location.origin}/assignment/${item.shareToken}`,
        }));
      },

      getAssignmentSubmission: (assignmentId, studentId, unitId) =>
        Promise.resolve(getDemoAssignmentSubmission(assignmentId, studentId, unitId)),
      setAssignmentSubmission: (assignmentId, studentId, unitId, status) => {
        setDemoAssignmentSubmission(assignmentId, studentId, unitId, status);
        return Promise.resolve();
      },
      getLabManualSubmission: (studentId, unitId) =>
        Promise.resolve(getDemoLabManualSubmission(studentId, unitId)),
      setLabManualSubmission: (studentId, unitId, status) => {
        setDemoLabManualSubmission(studentId, unitId, status);
        return Promise.resolve();
      },
      listSectionIdsForSubject: () =>
        Promise.resolve(
          Array.from(new Set(students.map((student) => student.sectionId).filter(Boolean) as string[])),
        ),
    };
  }

  return {
    createAssignment: (input) => assignmentAccess.createAssignment(input),

    async uploadFile(file: File): Promise<UploadedAssignmentFile> {
      const result = await fileStorage.uploadFile({
        category: 'assignment',
        data: file,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        policy: ASSIGNMENT_POLICY,
      });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return { fileId: result.value.fileId, url: result.value.url };
    },

    async listAssignments(): Promise<AssignmentListItem[]> {
      if (!semester) return [];

      // Fetch subjects for this semester to filter assignments
      const { data: subjectRows } = await supabase
        .from('subjects')
        .select('id')
        .eq('semester', semester);
      const subjectIds = (subjectRows || []).map((s) => s.id);

      const { data } = await supabase
        .from('assignments')
        .select('id, title, subject_id, unit_id, due_date, share_token')
        .in('subject_id', subjectIds)
        .order('created_at', { ascending: false });

      if (!data) return [];
      return data.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        title: row.title as string,
        subjectId: row.subject_id as string,
        unitId: row.unit_id as string,
        dueDate: (row.due_date as string) ?? null,
        shareLink: `${window.location.origin}/assignment/${row.share_token as string}`,
      }));
    },

    getAssignmentSubmission: (assignmentId, studentId, unitId) =>
      assignmentAccess.getAssignmentSubmission(assignmentId, studentId, unitId),
    setAssignmentSubmission: (assignmentId, studentId, unitId, status) =>
      assignmentAccess.setAssignmentSubmission(assignmentId, studentId, unitId, status),
    getLabManualSubmission: (studentId, unitId) =>
      assignmentAccess.getLabManualSubmission(studentId, unitId),
    setLabManualSubmission: (studentId, unitId, status) =>
      assignmentAccess.setLabManualSubmission(studentId, unitId, status),

    // Shared-materials model: an assignment is shared across every section that
    // studies its subject, so the trackers list students from all those sections.
    listSectionIdsForSubject: (subjectId) =>
      timetableAccess.listSectionIdsForSubject(subjectId),
  };
}

export default function AssignmentPage() {
  const { selectedSection, sections } = useSelectedSection();
  const [subjects, setSubjects] = useState<AssignmentSubjectOption[]>([]);
  const [units, setUnits] = useState<AssignmentUnitOption[]>([]);
  const [students, setStudents] = useState<AssignmentStudent[]>([]);

  const semester = selectedSection?.semester ?? null;
  const access = useMemo(
    () => createAccess(semester, subjects, students),
    [semester, subjects, students],
  );

  useEffect(() => {
    if (!semester) {
      setSubjects([]);
      setUnits([]);
      return;
    }
    setSubjects([]);
    setUnits([]);
    void (async () => {
      try {
        // Subjects are scoped to the selected semester; units follow those subjects.
        const activeSubjects = await loadSubjectOptionsForSection(selectedSection);
        setSubjects(activeSubjects);

        const activeSubjectIds = activeSubjects.map((s) => s.id);
        if (activeSubjectIds.length === 0) {
          setUnits([]);
          return;
        }
        const unitRes = await supabase
          .from('units')
          .select('id, name, subject_id')
          .in('subject_id', activeSubjectIds)
          .order('name');
        setUnits((unitRes.data as AssignmentUnitOption[]) || []);
      } catch {
        // View handles empty arrays gracefully.
      }
    })();
  }, [semester, selectedSection]);

  useEffect(() => {
    void (async () => {
      try {
        // Assignments/quizzes/materials are shared across every section that
        // studies a subject, so the tracker lists students from all onboarded
        // sections, each labelled by its section.
        const roster = await loadRosterStudentsForSections(sections);
        setStudents(
          roster.map((student) => ({
            id: student.id,
            name: student.name,
            enrollmentNumber: student.enrollmentNumber,
            sectionId: student.sectionId,
            sectionLabel: student.sectionLabel,
          })),
        );
      } catch {
        // View handles empty arrays gracefully.
      }
    })();
  }, [sections]);

  return (
    <AssignmentView
      subjects={subjects}
      units={units}
      students={students}
      access={access}
    />
  );
}
