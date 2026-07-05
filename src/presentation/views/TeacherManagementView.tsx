import { useCallback, useMemo, useState, useRef, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

import {
  SectionHeader,
  Button,
  IconButton,
  FilterBar,
  SearchInput,
  Select,
  Checkbox,
  Card,
  Avatar,
  Badge,
  SkeletonLoader,
  Toast,
} from '@presentation/components/ui';
import { DashboardStatCard } from '@presentation/components/dashboard/DashboardWidgets';
import { parseRosterCsv, type RejectedRosterRow } from '@domain/services/rosterImportService';

export interface Teacher {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  status: 'Active' | 'On Leave' | 'Suspended';
  subjects: string[];
  assignedSections: string[];
  totalClasses: number;
  pendingAttendance: number;
  pendingMaterials: number;
  pendingQuizzes: number;
}

export interface TeacherManagementViewProps {
  teachers: Teacher[];
  loading: boolean;
}

export default function TeacherManagementView({ teachers, loading }: TeacherManagementViewProps) {
  const navigate = useNavigate();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [designationFilter, setDesignationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Selection
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // Drawer & Modals
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [assignmentType, setAssignmentType] = useState<'subject' | 'section'>('subject');

  // CSV State
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Feedback
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Unique lists for filters
  const departments = useMemo(() => Array.from(new Set(teachers.map(t => t.department))), [teachers]);
  const subjects = useMemo(() => Array.from(new Set(teachers.flatMap(t => t.subjects))), [teachers]);
  const designations = useMemo(() => Array.from(new Set(teachers.map(t => t.designation))), [teachers]);

  // Aggregated Stats for Dashboard
  const globalStats = useMemo(() => {
    return teachers.reduce((acc, t) => ({
      totalClasses: acc.totalClasses + t.totalClasses,
      subjectsAssigned: acc.subjectsAssigned + t.subjects.length,
      pendingAttendance: acc.pendingAttendance + t.pendingAttendance,
      pendingMaterials: acc.pendingMaterials + t.pendingMaterials,
      pendingQuizzes: acc.pendingQuizzes + t.pendingQuizzes,
    }), { totalClasses: 0, subjectsAssigned: 0, pendingAttendance: 0, pendingMaterials: 0, pendingQuizzes: 0 });
  }, [teachers]);

  // Filtering Logic
  const filteredTeachers = useMemo(() => {
    let result = teachers;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q));
    }
    if (departmentFilter !== 'all') {
      result = result.filter(t => t.department === departmentFilter);
    }
    if (subjectFilter !== 'all') {
      result = result.filter(t => t.subjects.includes(subjectFilter));
    }
    if (designationFilter !== 'all') {
      result = result.filter(t => t.designation === designationFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter(t => t.status.toLowerCase() === statusFilter);
    }
    return result;
  }, [teachers, searchQuery, departmentFilter, subjectFilter, designationFilter, statusFilter]);

  // Handlers
  const toggleRowSelection = useCallback((id: string, index: number, shiftKey: boolean) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        for (let i = start; i <= end; i++) {
          next.add(filteredTeachers[i].id);
        }
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
    setLastSelectedIndex(index);
  }, [filteredTeachers, lastSelectedIndex]);

  const toggleAllSelection = useCallback(() => {
    if (selectedRows.size === filteredTeachers.length && filteredTeachers.length > 0) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredTeachers.map(t => t.id)));
    }
  }, [filteredTeachers, selectedRows.size]);

  const handleExportCSV = () => {
    const data = filteredTeachers.filter(t => selectedRows.has(t.id) || selectedRows.size === 0);
    const csvContent = "data:text/csv;charset=utf-8," +
      "Name,Email,Phone,Department,Designation,Status,Subjects,Assigned Sections\n" +
      data.map(t => `"${t.name}","${t.email}","${t.phone}","${t.department}","${t.designation}","${t.status}","${t.subjects.join('; ')}","${t.assignedSections.join('; ')}"`).join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = `faculty_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setSuccessMessage("Export completed.");
  };

  const dummyAction = (actionName: string) => {
    setSuccessMessage(`Simulated action: ${actionName}`);
    setSelectedRows(new Set());
  };

  const openAssignmentManager = (type: 'subject' | 'section') => {
    setAssignmentType(type);
    setShowAssignmentModal(true);
  };

  const submitAssignment = () => {
    setSuccessMessage(`Simulated assignment of ${assignmentType} to selected teachers.`);
    setShowAssignmentModal(false);
    setSelectedRows(new Set());
  };

  // Import Handlers
  const { valid, rejected } = useMemo(() => parseRosterCsv(csvText), [csvText]);
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(file);
  };
  const handleImportSubmit = () => {
    setSuccessMessage(`Simulated import of ${valid.length} teachers.`);
    setShowImportModal(false);
    setCsvText('');
    setFileName(null);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-20 relative">
      <SectionHeader
        eyebrow="Faculty Management"
        title="Teachers"
        description="Manage teaching staff, assignments, and view academic profiles."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => setShowImportModal(true)}>
              Import CSV
            </Button>
            <Button variant="primary" onClick={() => dummyAction("Open Add Teacher Form")}>
              Add Teacher
            </Button>
          </div>
        }
      />

      {/* Premium Teacher Dashboard */}
      {!loading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <DashboardStatCard
            icon="M"
            label="Total Classes"
            value={globalStats.totalClasses}
            trend="active"
            tone="blue"
            description="Across all faculty"
          />
          <DashboardStatCard
            icon="B"
            label="Subjects Assigned"
            value={globalStats.subjectsAssigned}
            trend="active"
            tone="neutral"
            description="Total allocations"
          />
          <DashboardStatCard
            icon="A"
            label="Pending Attendance"
            value={globalStats.pendingAttendance}
            trend={globalStats.pendingAttendance > 0 ? 'review' : 'healthy'}
            trendDirection={globalStats.pendingAttendance > 0 ? 'down' : 'up'}
            tone={globalStats.pendingAttendance > 0 ? 'amber' : 'green'}
            description="Classes unmarked"
          />
          <DashboardStatCard
            icon="P"
            label="Pending Materials"
            value={globalStats.pendingMaterials}
            trend={globalStats.pendingMaterials > 0 ? 'due soon' : 'clear'}
            trendDirection={globalStats.pendingMaterials > 0 ? 'down' : 'up'}
            tone={globalStats.pendingMaterials > 0 ? 'red' : 'green'}
            description="Uploads requested"
          />
          <DashboardStatCard
            icon="Q"
            label="Pending Quizzes"
            value={globalStats.pendingQuizzes}
            trend="active"
            tone={globalStats.pendingQuizzes > 0 ? 'amber' : 'neutral'}
            description="Assessments due"
          />
        </div>
      )}

      {/* Teacher List */}
      <Card padded={false} className="overflow-hidden flex flex-col mt-2">
        <FilterBar className="border-b border-border rounded-none bg-surface-muted/30 flex-wrap">
          <SearchInput
            placeholder="Search name or email..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="min-w-[200px]"
          />
          <Select
            options={[{ label: 'All Depts', value: 'all' }, ...departments.map(d => ({ label: d, value: d }))]}
            value={departmentFilter}
            onChange={e => setDepartmentFilter(e.target.value)}
            className="w-36"
          />
          <Select
            options={[{ label: 'All Designations', value: 'all' }, ...designations.map(d => ({ label: d, value: d }))]}
            value={designationFilter}
            onChange={e => setDesignationFilter(e.target.value)}
            className="w-40"
          />
          <Select
            options={[{ label: 'All Subjects', value: 'all' }, ...subjects.map(s => ({ label: s, value: s }))]}
            value={subjectFilter}
            onChange={e => setSubjectFilter(e.target.value)}
            className="w-36"
          />
          <Select
            options={[
              { label: 'All Statuses', value: 'all' },
              { label: 'Active', value: 'active' },
              { label: 'On Leave', value: 'on leave' },
              { label: 'Suspended', value: 'suspended' }
            ]}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-32"
          />
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => { setSearchQuery(''); setDepartmentFilter('all'); setSubjectFilter('all'); setDesignationFilter('all'); setStatusFilter('all'); }}>
            Reset
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            Export
          </Button>
        </FilterBar>

        {loading ? (
          <div className="p-6 space-y-4">
            <SkeletonLoader variant="block" className="h-12 w-full" />
            <SkeletonLoader variant="block" className="h-12 w-full" />
            <SkeletonLoader variant="block" className="h-12 w-full" />
          </div>
        ) : teachers.length === 0 ? (
          <div className="py-20 text-center text-muted">No teachers found.</div>
        ) : filteredTeachers.length === 0 ? (
          <div className="py-20 text-center text-muted">No teachers match your filters.</div>
        ) : (
          <div className="overflow-x-auto max-h-[65vh]">
            <table className="table-base w-full min-w-[950px] border-collapse relative text-left">
              <thead className="table-head sticky top-0 z-20 bg-surface shadow-sm">
                <tr>
                  <th className="table-header-cell sticky left-0 z-30 w-12 text-center bg-surface border-b border-border py-2.5 px-4">
                    <Checkbox checked={selectedRows.size > 0 && selectedRows.size === filteredTeachers.length} onChange={toggleAllSelection} label="" />
                  </th>
                  <th className="table-header-cell sticky left-12 z-30 bg-surface border-b border-border py-2.5 px-4 text-[11px] font-bold uppercase text-muted">Faculty</th>
                  <th className="table-header-cell bg-surface border-b border-border py-2.5 px-4 text-[11px] font-bold uppercase text-muted">Designation</th>
                  <th className="table-header-cell bg-surface border-b border-border py-2.5 px-4 text-[11px] font-bold uppercase text-muted">Department</th>
                  <th className="table-header-cell bg-surface border-b border-border py-2.5 px-4 text-[11px] font-bold uppercase text-muted">Subjects</th>
                  <th className="table-header-cell bg-surface border-b border-border py-2.5 px-4 text-[11px] font-bold uppercase text-muted">Status</th>
                  <th className="table-header-cell text-right bg-surface pr-6 border-b border-border py-2.5 px-4 text-[11px] font-bold uppercase text-muted">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <AnimatePresence>
                  {filteredTeachers.map((teacher, index) => (
                    <motion.tr
                      key={teacher.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15, delay: Math.min(index * 0.01, 0.2) }}
                      className={`table-row cursor-pointer hover:bg-surface-muted transition-colors ${selectedRows.has(teacher.id) ? 'bg-accent/5' : ''}`}
                      onClick={() => setSelectedTeacher(teacher)}
                    >
                      <td className="table-cell sticky left-0 z-10 w-12 text-center bg-inherit" onClick={e => e.stopPropagation()}>
                        <Checkbox checked={selectedRows.has(teacher.id)} onChange={(e) => toggleRowSelection(teacher.id, index, (e.nativeEvent as PointerEvent).shiftKey)} label="" />
                      </td>
                      <td className="table-cell sticky left-12 z-10 bg-inherit min-w-[220px]">
                        <div className="flex items-center gap-3">
                          <Avatar name={teacher.name} size="md" className="shrink-0" />
                          <div className="min-w-0">
                            <p className="font-semibold text-text truncate">{teacher.name}</p>
                            <p className="text-xs text-muted truncate">{teacher.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="table-cell text-sm text-text">{teacher.designation}</td>
                      <td className="table-cell">
                        <Badge tone="neutral" size="sm">{teacher.department}</Badge>
                      </td>
                      <td className="table-cell text-sm text-soft">
                        {teacher.subjects.length > 0 ? (
                          <span className="flex items-center gap-1.5">
                            <span className="bg-surface-muted border border-border px-1.5 py-0.5 rounded text-xs font-medium">{teacher.subjects.length}</span>
                            <span className="truncate max-w-[150px]">{teacher.subjects[0]}{teacher.subjects.length > 1 ? ', ...' : ''}</span>
                          </span>
                        ) : '-'}
                      </td>
                      <td className="table-cell">
                        <Badge tone={teacher.status === 'Active' ? 'success' : teacher.status === 'On Leave' ? 'warning' : 'danger'} size="sm">
                          {teacher.status}
                        </Badge>
                      </td>
                      <td className="table-cell text-right pr-6" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedTeacher(teacher)}>Profile</Button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Floating Bulk Actions Toolbar */}
      <AnimatePresence>
        {selectedRows.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-full border border-border bg-surface px-6 py-3 shadow-elevated"
          >
            <span className="text-sm font-semibold text-text">{selectedRows.size} selected</span>
            <div className="h-6 w-px bg-border" />
            <Button size="sm" variant="outline" onClick={() => openAssignmentManager('subject')}>Assign Subject</Button>
            <Button size="sm" variant="outline" onClick={() => openAssignmentManager('section')}>Assign Section</Button>
            <Button size="sm" variant="outline" onClick={handleExportCSV}>Export</Button>
            <Button size="sm" variant="danger" onClick={() => dummyAction("Delete Teachers")}>Delete</Button>
            <IconButton icon={<ClearIcon />} label="Clear" onClick={() => setSelectedRows(new Set())} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Assignment Manager Modal */}
      <AnimatePresence>
        {showAssignmentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" onClick={() => setShowAssignmentModal(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex w-full max-w-md flex-col rounded-card border border-border bg-surface shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-muted/30">
                <h2 className="text-xl font-semibold text-text">Assign {assignmentType === 'subject' ? 'Subject' : 'Section'}</h2>
                <IconButton icon={<ClearIcon />} label="Close" onClick={() => setShowAssignmentModal(false)} />
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-soft mb-2">Assigning to {selectedRows.size} selected faculty member(s).</p>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text">Semester</label>
                  <Select options={[{ label: 'Fall 2026', value: 'fall2026' }, { label: 'Spring 2027', value: 'spring2027' }]} value="fall2026" onChange={() => {}} className="w-full" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text">Batch / Year</label>
                  <Select options={[{ label: '2023-2027', value: '23-27' }, { label: '2024-2028', value: '24-28' }]} value="23-27" onChange={() => {}} className="w-full" />
                </div>
                {assignmentType === 'subject' ? (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-text">Select Subject</label>
                    <Select options={[{ label: 'Data Structures', value: 'ds' }, { label: 'Algorithms', value: 'algo' }]} value="ds" onChange={() => {}} className="w-full" />
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-text">Select Section</label>
                    <Select options={[{ label: 'CSE-A', value: 'cse-a' }, { label: 'CSE-B', value: 'cse-b' }]} value="cse-a" onChange={() => {}} className="w-full" />
                  </div>
                )}
              </div>
              <div className="border-t border-border px-6 py-4 bg-surface-muted/30 flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setShowAssignmentModal(false)}>Cancel</Button>
                <Button variant="primary" onClick={submitAssignment}>Confirm Assignment</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CSV Import Modal (Reused) */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" onClick={() => setShowImportModal(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-card border border-border bg-surface shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-muted/30">
                <h2 className="text-xl font-semibold text-text">Import Faculty</h2>
                <IconButton icon={<ClearIcon />} label="Close" onClick={() => setShowImportModal(false)} />
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="teacher-file" className="text-sm font-medium text-text">Upload CSV</label>
                  <input
                    id="teacher-file"
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-muted file:mr-3 file:rounded-button file:border-0 file:bg-accent/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent"
                  />
                  {fileName && <p className="text-xs text-emerald-600 font-medium">Loaded: {fileName}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="teacher-text" className="text-sm font-medium text-text">Or Paste CSV Content</label>
                  <textarea
                    id="teacher-text"
                    value={csvText}
                    onChange={e => setCsvText(e.target.value)}
                    rows={4}
                    placeholder={'name,email,phone,department,designation\nRamesh Kumar,ramesh@edu.in,9876543210,CSE,Professor'}
                    className="w-full rounded-button border border-border bg-surface px-3 py-2 text-xs font-mono focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
                {csvText.trim() !== '' && (
                  <div className="bg-surface-muted rounded-card p-4 border border-border">
                    <div className="flex items-center gap-3 mb-3">
                      <Badge tone="success">{valid.length} Valid Rows</Badge>
                      <Badge tone="danger">{rejected.length} Rejected Rows</Badge>
                    </div>
                    {rejected.length > 0 && <RejectedRowList rejected={rejected} />}
                  </div>
                )}
              </div>
              <div className="border-t border-border px-6 py-4 bg-surface-muted/30 flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setShowImportModal(false)}>Cancel</Button>
                <Button variant="primary" disabled={valid.length === 0} onClick={handleImportSubmit}>Review Import</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Teacher Profile Drawer */}
      <AnimatePresence>
        {selectedTeacher && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setSelectedTeacher(null)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface shadow-2xl overflow-y-auto border-l border-border"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-muted/30 sticky top-0 z-10">
                <h2 className="text-lg font-semibold text-text">Faculty Profile</h2>
                <IconButton icon={<ClearIcon />} label="Close" onClick={() => setSelectedTeacher(null)} />
              </div>
              <div className="flex-1 p-6 space-y-8">
                {/* Header Info */}
                <div className="flex items-center gap-5">
                  <Avatar name={selectedTeacher.name} size="lg" className="h-20 w-20 text-2xl shadow-sm" />
                  <div>
                    <h1 className="text-xl font-bold text-text leading-tight">{selectedTeacher.name}</h1>
                    <p className="text-sm text-accent font-medium mt-1">{selectedTeacher.designation}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge tone={selectedTeacher.status === 'Active' ? 'success' : 'warning'} size="sm">{selectedTeacher.status}</Badge>
                      <Badge tone="neutral" size="sm">{selectedTeacher.department}</Badge>
                    </div>
                  </div>
                </div>

                {/* Contact Info */}
                <div className="flex flex-col gap-1 text-sm bg-surface-muted p-4 rounded-lg border border-border">
                   <div className="flex justify-between items-center"><span className="text-muted">Email</span><span className="font-medium">{selectedTeacher.email}</span></div>
                   <div className="flex justify-between items-center"><span className="text-muted">Phone</span><span className="font-medium">{selectedTeacher.phone}</span></div>
                </div>

                {/* Quick Actions Navigator */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-3 border-b border-border pb-2">Quick Actions</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigate('/attendance')}>Take Attendance</Button>
                    <Button variant="outline" size="sm" onClick={() => navigate('/material')}>Upload Material</Button>
                    <Button variant="outline" size="sm" onClick={() => navigate('/quizzes')}>Create Quiz</Button>
                    <Button variant="outline" size="sm" onClick={() => navigate('/analytics')}>View Reports</Button>
                  </div>
                </div>

                {/* Workload Summary */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-3 border-b border-border pb-2">Workload Summary</h3>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-100">
                      <p className="text-xs text-blue-800 font-medium uppercase">Total Classes</p>
                      <p className="text-2xl font-bold text-blue-900 mt-1">{selectedTeacher.totalClasses}</p>
                    </div>
                    <div className="bg-amber-50/50 rounded-lg p-3 border border-amber-100">
                      <p className="text-xs text-amber-800 font-medium uppercase">Pending Quizzes</p>
                      <p className="text-2xl font-bold text-amber-900 mt-1">{selectedTeacher.pendingQuizzes}</p>
                    </div>
                  </div>
                  <div className="space-y-4 text-sm">
                    <div>
                      <p className="text-soft mb-1 font-medium flex justify-between">
                        <span>Subjects Taught</span>
                        <span className="text-muted">{selectedTeacher.subjects.length} assigned</span>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedTeacher.subjects.length > 0 ? selectedTeacher.subjects.map(s => (
                          <Badge key={s} tone="info" size="sm">{s}</Badge>
                        )) : <span className="text-muted italic">None</span>}
                      </div>
                    </div>
                    <div>
                      <p className="text-soft mb-1 font-medium flex justify-between">
                        <span>Sections</span>
                        <span className="text-muted">{selectedTeacher.assignedSections.length} assigned</span>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedTeacher.assignedSections.length > 0 ? selectedTeacher.assignedSections.map(s => (
                          <Badge key={s} tone="neutral" size="sm">{s}</Badge>
                        )) : <span className="text-muted italic">None</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Administrative Actions */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-3 border-b border-border pb-2">Administrative Actions</h3>
                  <div className="flex flex-col gap-2">
                    <Button variant="outline" className="justify-start w-full" onClick={() => { setSelectedRows(new Set([selectedTeacher.id])); openAssignmentManager('subject'); }}>Assign Subject to {selectedTeacher.name.split(' ')[0]}</Button>
                    <Button variant="outline" className="justify-start w-full text-red-600 hover:bg-red-50 hover:border-red-200" onClick={() => dummyAction('Suspend Account')}>Suspend Account</Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        <AnimatePresence>
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <Toast title="Success" message={successMessage} tone="success" onClose={() => setSuccessMessage(null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function RejectedRowList({ rejected }: { rejected: readonly RejectedRosterRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-red-200 mt-3 max-h-48 overflow-y-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-red-50 sticky top-0">
          <tr>
            <th className="px-3 py-2 font-semibold text-red-800">Line</th>
            <th className="px-3 py-2 font-semibold text-red-800">Content</th>
            <th className="px-3 py-2 font-semibold text-red-800">Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-red-100">
          {rejected.map((row) => (
            <tr key={row.line}>
              <td className="px-3 py-2 text-red-900/60 font-medium">{row.line}</td>
              <td className="px-3 py-2 font-mono text-red-900">{row.raw.trim() || '(blank)'}</td>
              <td className="px-3 py-2 text-red-800">{row.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
    </svg>
  );
}
