/**
 * Connected page wrapper for AssignmentView.
 * Wires Supabase-backed assignmentAccess with file storage, and loads
 * subjects/units/students from the database.
 */

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
import { fileStorage } from '@data/storage';
import { supabase } from '@data/supabase';
import type { UploadPolicy } from '@domain/services/storageRouter';

const assignmentAccess = createAssignmentAccess(supabase);

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
    const { data } = await supabase
      .from('assignments')
      .select('id, title, subject_id, unit_id, due_date, share_token')
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
};

export default function AssignmentPage() {
  const [subjects, setSubjects] = useState<AssignmentSubjectOption[]>([]);
  const [units, setUnits] = useState<AssignmentUnitOption[]>([]);
  const [students, setStudents] = useState<AssignmentStudent[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [subjectRes, unitRes, studentRes] = await Promise.all([
          supabase.from('subjects').select('id, name').order('name'),
          supabase.from('units').select('id, name').order('name'),
          supabase.from('student_roster').select('id, name, enrollment_number').order('name'),
        ]);
        if (subjectRes.data) setSubjects(subjectRes.data as AssignmentSubjectOption[]);
        if (unitRes.data) setUnits(unitRes.data as AssignmentUnitOption[]);
        if (studentRes.data) {
          setStudents(
            studentRes.data.map((row: { id: string; name: string; enrollment_number?: string }) => ({
              id: row.id,
              name: row.name,
              enrollmentNumber: row.enrollment_number,
            })),
          );
        }
      } catch {
        // View handles empty arrays gracefully.
      }
    })();
  }, []);

  return (
    <AssignmentView
      subjects={subjects}
      units={units}
      students={students}
      access={access}
    />
  );
}
