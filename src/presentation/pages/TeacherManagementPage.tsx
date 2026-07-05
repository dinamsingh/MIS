import { useState, useEffect } from 'react';
import TeacherManagementView, { type Teacher } from '@presentation/views/TeacherManagementView';

// Mock data to demonstrate the UI since we cannot modify the DB schema.
const MOCK_TEACHERS: Teacher[] = [
  {
    id: 't1', name: 'Dr. Ramesh Kumar', email: 'ramesh.k@edu.in', phone: '+91 98765 43210',
    department: 'Computer Science', designation: 'Professor', status: 'Active',
    subjects: ['Data Structures', 'Algorithms'], assignedSections: ['CSE-A', 'CSE-B'],
    totalClasses: 45, pendingAttendance: 2, pendingMaterials: 1, pendingQuizzes: 0
  },
  {
    id: 't2', name: 'Prof. Aditi Sharma', email: 'aditi.s@edu.in', phone: '+91 98765 43211',
    department: 'Electronics', designation: 'Asst. Professor', status: 'Active',
    subjects: ['Digital Logic', 'Microprocessors'], assignedSections: ['ECE-A'],
    totalClasses: 30, pendingAttendance: 0, pendingMaterials: 0, pendingQuizzes: 1
  },
  {
    id: 't3', name: 'Dr. Vinay Singh', email: 'vinay.s@edu.in', phone: '+91 98765 43212',
    department: 'Mechanical', designation: 'Assoc. Professor', status: 'On Leave',
    subjects: ['Thermodynamics'], assignedSections: [],
    totalClasses: 12, pendingAttendance: 0, pendingMaterials: 2, pendingQuizzes: 0
  },
  {
    id: 't4', name: 'Prof. Neha Gupta', email: 'neha.g@edu.in', phone: '+91 98765 43213',
    department: 'Computer Science', designation: 'Asst. Professor', status: 'Active',
    subjects: ['Operating Systems', 'Computer Networks'], assignedSections: ['CSE-B', 'CSE-C'],
    totalClasses: 50, pendingAttendance: 5, pendingMaterials: 0, pendingQuizzes: 2
  },
  {
    id: 't5', name: 'Dr. Suresh Verma', email: 'suresh.v@edu.in', phone: '+91 98765 43214',
    department: 'Civil', designation: 'Professor', status: 'Active',
    subjects: ['Structural Analysis'], assignedSections: ['CE-A'],
    totalClasses: 28, pendingAttendance: 1, pendingMaterials: 1, pendingQuizzes: 0
  },
];

export default function TeacherManagementPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  // Simulate network load
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (active) {
        setTeachers(MOCK_TEACHERS);
        setLoading(false);
      }
    }, 600);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  return <TeacherManagementView teachers={teachers} loading={loading} />;
}
