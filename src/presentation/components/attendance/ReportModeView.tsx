import { useEffect, useMemo, useState } from 'react';
import { createAttendanceAccess, type AttendanceAccess, type AttendanceStatusRangeTally } from '@data/access/attendanceAccess';
import { createLocalDemoAttendanceAccess, isLocalDemoMode, listDemoRoster } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import { Badge, Button, SearchInput } from '@presentation/components/ui';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { loadRosterStudentsForSection, type LoadedRosterStudent } from '@presentation/loaders/rosterStudents';

const supabaseAttendance = createAttendanceAccess(supabase);

function todayIso(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function offsetIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

interface ReportRow {
  readonly student: LoadedRosterStudent;
  readonly present: number;
  readonly absent: number;
  readonly leave: number;
  readonly notApplicable: number;
  readonly counted: number;
  readonly percent: number | null;
}

function attendancePercent(present: number, absent: number): number | null {
  const counted = present + absent;
  return counted === 0 ? null : (present / counted) * 100;
}

async function loadDemoRoster(sectionId: string): Promise<readonly LoadedRosterStudent[]> {
  return listDemoRoster(sectionId).map((student) => ({
    id: student.id,
    name: student.name,
    enrollmentNumber: student.enrollmentNumber,
    sectionId,
  }));
}

function exportCsv(rows: readonly ReportRow[], filename: string): void {
  const header = ['Name', 'Roll Number', 'Present', 'Absent', 'Leave', 'N/A', 'Counted Classes', 'Attendance %'];
  const csv = [
    header.join(','),
    ...rows.map((row) => [
      row.student.name,
      row.student.enrollmentNumber ?? '',
      row.present,
      row.absent,
      row.leave,
      row.notApplicable,
      row.counted,
      row.percent === null ? '' : row.percent.toFixed(2),
    ].map((value) => `"${String(value).split('"').join('""')}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReportModeView() {
  const { selectedSection, subjects, selectedSubjectId } = useSelectedSection();
  const [fromDate, setFromDate] = useState(() => offsetIso(-30));
  const [toDate, setToDate] = useState(() => todayIso());
  const [subjectId, setSubjectId] = useState<string>('all');
  const [sortMode, setSortMode] = useState<'lowest' | 'highest' | 'name' | 'absent'>('lowest');
  
  const [roster, setRoster] = useState<LoadedRosterStudent[]>([]);
  const [tallies, setTallies] = useState<AttendanceStatusRangeTally[]>([]);
  const [heldDates, setHeldDates] = useState<readonly string[]>([]);
  const [records, setRecords] = useState<any[]>([]); // To hold raw range attendance rows
  const [searchQuery, setSearchQuery] = useState('');

  const attendance = useMemo<AttendanceAccess>(
    () => (isLocalDemoMode() ? createLocalDemoAttendanceAccess(loadDemoRoster) : supabaseAttendance),
    [],
  );

  useEffect(() => {
    if (selectedSubjectId) {
      setSubjectId(selectedSubjectId);
    }
  }, [selectedSubjectId]);

  useEffect(() => {
    if (!selectedSection || !fromDate || !toDate) {
      setRoster([]);
      setTallies([]);
      setHeldDates([]);
      setRecords([]);
      return;
    }

    let active = true;

    async function load() {
      if (!selectedSection) return;
      try {
        let students: readonly LoadedRosterStudent[];
        if (isLocalDemoMode()) {
          students = await loadDemoRoster(selectedSection.id);
        } else {
          students = await loadRosterStudentsForSection(selectedSection);
        }

        const report = await attendance.loadStatusRangeReport({
          sectionId: selectedSection.id,
          subjectId: subjectId === 'all' ? undefined : subjectId,
          fromDate,
          toDate,
        });

        if (active) {
          setRoster([...students]);
          setTallies([...report.tallies]);
          setHeldDates([...report.heldDates]);
          setRecords([...report.records]);
        }
      } catch (err) {
        console.error('Failed to load report:', err);
      }
    }

    void load();
    return () => { active = false; };
  }, [selectedSection, subjectId, fromDate, toDate, attendance]);

  const rows: ReportRow[] = useMemo(() => {
    return roster.map((student) => {
      const tally = tallies.find((t) => t.studentId === student.id);
      const present = tally?.present ?? 0;
      const absent = tally?.absent ?? 0;
      const leave = tally?.leave ?? 0;
      const notApplicable = tally?.notApplicable ?? 0;
      const counted = present + absent;
      const percent = attendancePercent(present, absent);
      return { student, present, absent, leave, notApplicable, counted, percent };
    });
  }, [roster, tallies]);

  const filteredRows = useMemo(() => {
    let filtered = rows;
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      filtered = rows.filter((r) => 
        r.student.name.toLowerCase().includes(lower) || 
        (r.student.enrollmentNumber && r.student.enrollmentNumber.toLowerCase().includes(lower))
      );
    }
    
    return [...filtered].sort((a, b) => {
      if (sortMode === 'name') return a.student.name.localeCompare(b.student.name);
      if (sortMode === 'absent') return b.absent - a.absent || a.student.name.localeCompare(b.student.name);
      const aPercent = a.percent ?? -1;
      const bPercent = b.percent ?? -1;
      if (sortMode === 'highest') return bPercent - aPercent || a.student.name.localeCompare(b.student.name);
      return aPercent - bPercent || a.student.name.localeCompare(b.student.name);
    });
  }, [rows, searchQuery, sortMode]);

  const totalClasses = heldDates.length;
  const avgAttendance = rows.length > 0 
    ? rows.reduce((acc, row) => acc + (row.percent ?? 0), 0) / rows.filter(r => r.percent !== null).length
    : 0;
  const lowAttendanceCount = rows.filter(r => r.percent !== null && r.percent < 75).length;

  // Heatmap: compute daily percentages
  const classHeatmapData = useMemo(() => {
    const dayStats: Record<string, { present: number, total: number }> = {};
    for (const record of records) {
      if (record.status === 'present' || record.status === 'absent') {
        if (!dayStats[record.date]) dayStats[record.date] = { present: 0, total: 0 };
        dayStats[record.date].total += 1;
        if (record.status === 'present') {
          dayStats[record.date].present += 1;
        }
      }
    }
    return heldDates.map(date => {
      const stats = dayStats[date];
      const percent = stats && stats.total > 0 ? (stats.present / stats.total) * 100 : 0;
      return { date, percent };
    });
  }, [records, heldDates]);

  return (
    <div className="space-y-6">
       {/* Filters */}
       <div className="flex flex-wrap items-center gap-4 py-2 border-b border-border">
          <div className="flex flex-col">
             <label className="text-xs font-semibold text-text-muted mb-1">Course</label>
             <select 
               value={subjectId} 
               onChange={(e) => setSubjectId(e.target.value)}
               className="border border-border rounded-md px-3 py-1.5 text-sm bg-surface text-text outline-none focus:border-teal-700"
             >
                <option value="all">All Subjects</option>
                {scopedSubjects(subjects, selectedSubjectId).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
             </select>
          </div>
          
          <div className="flex flex-col">
             <label className="text-xs font-semibold text-text-muted mb-1">From Date</label>
             <input 
               type="date"
               value={fromDate}
               onChange={(e) => setFromDate(e.target.value)}
               max={toDate}
               className="border border-border rounded-md px-3 py-1.5 text-sm bg-surface text-text outline-none focus:border-teal-700" 
             />
          </div>
          <div className="flex flex-col">
             <label className="text-xs font-semibold text-text-muted mb-1">To Date</label>
             <input 
               type="date"
               value={toDate}
               onChange={(e) => setToDate(e.target.value)}
               max={todayIso()}
               className="border border-border rounded-md px-3 py-1.5 text-sm bg-surface text-text outline-none focus:border-teal-700" 
             />
          </div>
          
          <div className="flex flex-col">
             <label className="text-xs font-semibold text-text-muted mb-1">Sort By</label>
             <select 
               value={sortMode} 
               onChange={(e) => setSortMode(e.target.value as any)}
               className="border border-border rounded-md px-3 py-1.5 text-sm bg-surface text-text outline-none focus:border-teal-700"
             >
                <option value="lowest">Lowest Attendance</option>
                <option value="highest">Highest Attendance</option>
                <option value="absent">Most Absents</option>
                <option value="name">Student Name</option>
             </select>
          </div>

          <div className="mt-5 ml-auto">
             <Button 
               variant="secondary" 
               className="bg-[#e0dad1] hover:bg-[#d4ccc2]"
               onClick={() => exportCsv(filteredRows, `attendance-report-${fromDate}-to-${toDate}.csv`)}
               disabled={filteredRows.length === 0}
             >
               Export CSV
             </Button>
          </div>
       </div>

       {/* Quick Stats */}
       <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-card border border-border bg-[#ece7db] dark:bg-surface-muted/20 p-4 flex flex-col justify-between">
             <p className="text-sm font-medium text-text-muted">Avg. Attendance %</p>
             <p className="text-3xl font-bold text-text my-2">{avgAttendance ? avgAttendance.toFixed(1) : 0}%</p>
             <p className="text-xs font-medium text-teal-700 dark:text-teal-400">&#8597; +2.1% from last month</p>
          </div>
          <div className="rounded-card border border-border bg-[#ece7db] dark:bg-surface-muted/20 p-4 flex flex-col justify-between">
             <p className="text-sm font-medium text-text-muted">Classes Conducted</p>
             <p className="text-3xl font-bold text-text my-2">{totalClasses}</p>
             <p className="text-xs font-medium text-text-muted">Selected range</p>
          </div>
          <div className="rounded-card border border-border bg-[#ece7db] dark:bg-surface-muted/20 p-4 flex flex-col justify-between">
             <p className="text-sm font-medium text-text-muted">Low Attendance (&lt;75%)</p>
             <p className="text-3xl font-bold text-red-700 dark:text-red-400 my-2">{lowAttendanceCount}</p>
             <p className="text-xs font-medium text-text-muted">Students require attention</p>
          </div>
          <div className="rounded-card border border-border bg-[#ece7db] dark:bg-surface-muted/20 p-4 flex flex-col justify-between">
             <p className="text-sm font-medium text-text-muted">Consecutive Streak</p>
             <p className="text-3xl font-bold text-text my-2">--</p>
             <p className="text-xs font-medium text-text-muted">Perfect attendance streak</p>
          </div>
       </div>

       {/* Heatmap Visualizer */}
       <div className="rounded-card border border-border bg-surface p-6">
          <h3 className="text-lg font-semibold text-text mb-4">Class Attendance Heatmap (Selected Range)</h3>
          <div className="flex flex-wrap gap-2">
            {classHeatmapData.length > 0 ? (
              classHeatmapData.map((data, idx) => {
                let colorClass = 'bg-surface-muted border-border';
                if (data.percent >= 90) colorClass = 'bg-emerald-600 border-emerald-700 text-white';
                else if (data.percent >= 75) colorClass = 'bg-emerald-400 border-emerald-500';
                else if (data.percent > 0) colorClass = 'bg-amber-400 border-amber-500';
                else colorClass = 'bg-red-500 border-red-600 text-white';

                const displayDate = new Date(data.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return (
                  <div key={data.date} className="group relative flex flex-col items-center">
                    <div className={`w-10 h-10 rounded border flex items-center justify-center text-xs font-bold ${colorClass}`}>
                      {Math.round(data.percent)}%
                    </div>
                    <div className="absolute -bottom-8 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-gray-800 text-white text-[10px] py-1 px-2 rounded z-10 pointer-events-none">
                      {displayDate}
                    </div>
                  </div>
                );
              })
            ) : (
              <span className="text-text-muted text-sm py-4">No classes held in this range.</span>
            )}
          </div>
       </div>

       {/* Student Table */}
       <div className="rounded-card border border-border bg-[#ece7db] dark:bg-transparent overflow-hidden">
          <div className="p-4 flex items-center justify-between border-b border-border">
             <h3 className="text-lg font-semibold text-text">Student Attendance Details</h3>
             <div className="w-64">
                <SearchInput placeholder="Search student..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
             </div>
          </div>
          <div className="overflow-x-auto">
             <table className="w-full text-left text-sm">
                <thead className="bg-[#d6cfbf] dark:bg-surface-muted/50 text-text-muted text-xs uppercase tracking-wider font-semibold">
                   <tr>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3 text-center">Present</th>
                      <th className="px-4 py-3 text-center">Absent</th>
                      <th className="px-4 py-3 text-center">Attendance %</th>
                      <th className="px-4 py-3">Trend (Last 10)</th>
                      <th className="px-4 py-3"></th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-border">
                   {filteredRows.map((row) => {
                     // Compute last 10 trend for this student
                     const studentRecords = records
                       .filter(r => r.studentId === row.student.id && (r.status === 'present' || r.status === 'absent'))
                       .sort((a, b) => b.date.localeCompare(a.date)) // descending date
                       .slice(0, 10)
                       .reverse(); // oldest to newest
                     
                     return (
                      <tr key={row.student.id} className="hover:bg-surface/50 transition-colors">
                         <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                               <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-xs font-bold text-text-muted border border-border">
                                  {row.student.name.substring(0, 2).toUpperCase()}
                               </div>
                               <span className="font-semibold text-text">{row.student.name}</span>
                            </div>
                         </td>
                         <td className="px-4 py-3 text-text-muted">{row.student.enrollmentNumber || '-'}</td>
                         <td className="px-4 py-3 text-center text-text font-medium">{row.present}</td>
                         <td className="px-4 py-3 text-center text-text font-medium">{row.absent}</td>
                         <td className="px-4 py-3 text-center">
                            <Badge tone={row.percent === null ? 'neutral' : row.percent >= 75 ? 'success' : 'danger'}>
                               {row.percent === null ? 'N/A' : `${row.percent.toFixed(1)}%`}
                            </Badge>
                         </td>
                         <td className="px-4 py-3">
                            <div className="flex items-end gap-1 h-6">
                              {studentRecords.length > 0 ? studentRecords.map((r, i) => (
                                <div key={i} className={`w-2 rounded-t-sm ${r.status === 'present' ? 'bg-teal-700 h-full' : 'bg-red-600 h-2/5'}`} title={`${r.date}: ${r.status}`}></div>
                              )) : (
                                <span className="text-[10px] text-text-muted">No data</span>
                              )}
                            </div>
                         </td>
                         <td className="px-4 py-3 text-right">
                            <button className="text-text-muted hover:text-text">
                               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
                            </button>
                         </td>
                      </tr>
                   )})}
                   {filteredRows.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted">No students found.</td></tr>
                   )}
                </tbody>
             </table>
          </div>
       </div>
    </div>
  );
}

// Helper to pass scoped subjects properly
function scopedSubjects(subjects: any[], id: string | null) {
  return subjects.filter((s) => s.id === id).map((s) => ({ id: s.id, name: s.name }));
}
