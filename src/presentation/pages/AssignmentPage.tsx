import { useEffect, useState } from 'react';
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
import { supabase } from '@data/supabase';
import { formatSectionLabel } from '@presentation/format/sectionLabel';
import { useSelectedSemester, useSelectedSection, mapSemesterToDb } from '@presentation/hooks';
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

/** Compose the AssignmentViewAccess from the assignment data access + file storage. */
const access: AssignmentViewAccess = {
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
    const sem = localStorage.getItem('mis_selected_semester') || 'Semester 5';
    const dbSemester = mapSemesterToDb(sem);

    // Fetch subjects for this semester to filter assignments
    const { data: subjectRows } = await supabase
      .from('subjects')
      .select('id')
      .eq('semester', dbSemester);
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

export default function AssignmentPage() {
  const [subjects, setSubjects] = useState<AssignmentSubjectOption[]>([]);
  const [units, setUnits] = useState<AssignmentUnitOption[]>([]);
  const [students, setStudents] = useState<AssignmentStudent[]>([]);
  const semester = useSelectedSemester();
  const section = useSelectedSection();

  useEffect(() => {
    void (async () => {
      try {
        const dbSemester = mapSemesterToDb(semester);

        // Subjects are scoped to the selected semester; units follow those subjects.
        const subjectRes = await supabase
          .from('subjects')
          .select('id, name')
          .eq('semester', dbSemester)
          .order('name');
        const activeSubjects = (subjectRes.data as AssignmentSubjectOption[]) || [];
        setSubjects(activeSubjects);

        const activeSubjectIds = activeSubjects.map((s) => s.id);
        const unitRes = await supabase
          .from('units')
          .select('id, name, subject_id')
          .in('subject_id', activeSubjectIds)
          .order('name');
        setUnits((unitRes.data as AssignmentUnitOption[]) || []);

        // Assignments/quizzes/materials are shared across every section that
        // studies a subject, so the tracker lists students from ALL sections
        // (each labelled by its section), not just the globally-selected one.
        const [sectionRes, studentRes] = await Promise.all([
          supabase.from('sections').select('id, name, batch, semester, department'),
          supabase.from('students').select('id, name, enrollment_number, section_id').order('name'),
        ]);

        const sectionLabelById = new Map<string, string>();
        for (const row of (sectionRes.data ?? []) as Array<{
          id: string;
          name: string;
          batch: string | null;
          semester: string | null;
          department: string | null;
        }>) {
          sectionLabelById.set(row.id, formatSectionLabel(row));
        }

        if (studentRes.data) {
          setStudents(
            (studentRes.data as Array<{
              id: string;
              name: string;
              enrollment_number?: string;
              section_id?: string | null;
            }>).map((row) => ({
              id: row.id,
              name: row.name,
              enrollmentNumber: row.enrollment_number,
              ...(row.section_id
                ? {
                    sectionId: row.section_id,
                    sectionLabel: sectionLabelById.get(row.section_id),
                  }
                : {}),
            })),
          );
        }
      } catch {
        // View handles empty arrays gracefully.
      }
    })();
  }, [semester, section]);

  return (
    <AssignmentView
      subjects={subjects}
      units={units}
      students={students}
      access={access}
    />
  );
}
