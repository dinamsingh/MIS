import { useState, useEffect, useMemo } from 'react';
import { Breadcrumb, Tabs } from '@presentation/components/ui/navigation';
import { Drawer } from '@presentation/components/ui/overlays';
import { Button, IconButton } from '@presentation/components/ui/foundation';
import { Select, DatePicker } from '@presentation/components/ui/forms';
import { ChartCard } from '@presentation/components/ui/charts';
import { SkeletonLoader } from '@presentation/components/ui/data-display';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { isLocalDemoMode, demoNumber } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';

const REPORT_TABS = [
  { value: 'attendance', label: 'Attendance', badge: 'New' },
  { value: 'students', label: 'Students' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'subjects', label: 'Subjects' },
  { value: 'content', label: 'Academic Content' },
  { value: 'quizzes', label: 'Quiz Performance' },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('attendance');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);

  const { sections, selectedSectionId, setSelectedSectionId } = useSelectedSection();

  // Filters state
  const [selectedSemester, setSelectedSemester] = useState<string>('all');
  const [activeSectionId, setActiveSectionId] = useState<string>('all');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Reload trigger version
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Data Loading states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab Data States
  const [attendanceData, setAttendanceData] = useState<{
    dailyTrend: Array<{ date: string; percent: number }>;
    sectionComparison: Array<{ label: string; percent: number }>;
    monthlyAverages: Array<{ label: string; percent: number }>;
  }>({ dailyTrend: [], sectionComparison: [], monthlyAverages: [] });

  const [studentsData, setStudentsData] = useState<{
    lowAttendanceRisk: Array<{ name: string; roll: string; percent: number }>;
    performanceTrend: Array<{ label: string; val: number }>;
    assignmentCompletion: Array<{ label: string; val: number }>;
  }>({ lowAttendanceRisk: [], performanceTrend: [], assignmentCompletion: [] });

  const [teachersData, setTeachersData] = useState<{
    quizzesCount: number;
    materialsCount: number;
    attendanceCount: number;
  }>({ quizzesCount: 0, materialsCount: 0, attendanceCount: 0 });

  const [subjectsData, setSubjectsData] = useState<Array<{ name: string; score: number }>>([]);

  const [contentData, setContentData] = useState<{
    totalFiles: number;
    totalSizeLabel: string;
    categories: Array<{ name: string; count: number }>;
  }>({ totalFiles: 0, totalSizeLabel: '0 B', categories: [] });

  const [quizzesData, setQuizzesData] = useState<Array<{ title: string; attempts: number; avgScore: number }>>([]);

  // Extract semesters dynamically from sections
  const semestersList = useMemo(() => {
    const semSet = new Set(sections.map(s => s.semester).filter((s): s is string => Boolean(s)));
    return Array.from(semSet);
  }, [sections]);

  // Sync activeSectionId with context selectedSectionId initially
  useEffect(() => {
    if (selectedSectionId && activeSectionId === 'all') {
      setActiveSectionId(selectedSectionId);
      const matched = sections.find(s => s.id === selectedSectionId);
      if (matched?.semester) {
        setSelectedSemester(matched.semester);
      }
    }
  }, [selectedSectionId, sections]);

  // Filter sections options based on selected semester
  const filteredSectionsOptions = useMemo(() => {
    if (selectedSemester === 'all') return sections;
    return sections.filter(s => s.semester === selectedSemester);
  }, [sections, selectedSemester]);

  // Define section IDs in scope for reports aggregation
  const inScopeSectionIds = useMemo(() => {
    if (activeSectionId !== 'all') return [activeSectionId];
    return filteredSectionsOptions.map(s => s.id);
  }, [activeSectionId, filteredSectionsOptions]);

  // Fetch Report Data
  useEffect(() => {
    let cancelled = false;

    async function loadReportMetrics() {
      if (sections.length === 0) return;
      setLoading(true);
      setError(null);

      try {
        if (isLocalDemoMode()) {
          // ── LOCAL DEMO MODE DATA ──
          await new Promise(resolve => setTimeout(resolve, 350)); // artificial lag
          if (cancelled) return;

          // Attendance Tab Mock
          const mockDailyTrend = [];
          const dateStart = new Date(fromDate + 'T00:00:00');
          const dateEnd = new Date(toDate + 'T00:00:00');
          for (let d = new Date(dateStart); d <= dateEnd; d.setDate(d.getDate() + 4)) {
            const dateStr = d.toISOString().slice(0, 10);
            mockDailyTrend.push({
              date: dateStr,
              percent: Math.round(demoNumber(`att-trend-${dateStr}-${activeSectionId}`, 68, 96))
            });
          }

          const mockSectionComparison = filteredSectionsOptions.map(sec => ({
            label: sec.name,
            percent: Math.round(demoNumber(`att-comp-${sec.id}`, 74, 94))
          }));

          const mockMonthlyMap = new Map<string, { sum: number; count: number }>();
          for (const pt of mockDailyTrend) {
            const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(new Date(pt.date + 'T00:00:00'));
            const entry = mockMonthlyMap.get(monthLabel) ?? { sum: 0, count: 0 };
            entry.sum += pt.percent;
            entry.count += 1;
            mockMonthlyMap.set(monthLabel, entry);
          }
          const mockMonthlyAverages = Array.from(mockMonthlyMap.entries()).map(([label, entry]) => ({
            label,
            percent: entry.count > 0 ? Math.round(entry.sum / entry.count) : 0
          }));

          setAttendanceData({
            dailyTrend: mockDailyTrend,
            sectionComparison: mockSectionComparison,
            monthlyAverages: mockMonthlyAverages
          });

          // Students Tab Mock
          setStudentsData({
            lowAttendanceRisk: [
              { name: 'Amit Sharma', roll: '2024CS1004', percent: 62 },
              { name: 'Priya Singh', roll: '2024CS1018', percent: 67 },
              { name: 'Rohan Gupta', roll: '2024CS1032', percent: 71 },
              { name: 'Vikram Aditya', roll: '2024CS1045', percent: 59 },
            ],
            performanceTrend: [
              { label: 'Week 1', val: 72 },
              { label: 'Week 2', val: 79 },
              { label: 'Week 3', val: 84 },
              { label: 'Week 4', val: 81 },
            ],
            assignmentCompletion: [
              { label: 'Submitted', val: 82 },
              { label: 'Not Submitted', val: 18 }
            ]
          });

          // Teachers Tab Mock
          setTeachersData({
            quizzesCount: 6,
            materialsCount: 12,
            attendanceCount: 28
          });

          // Subjects Tab Mock
          setSubjectsData([
            { name: 'DBMS', score: 81 },
            { name: 'Operating Systems', score: 74 },
            { name: 'Computer Networks', score: 86 },
            { name: 'Software Engineering', score: 79 }
          ]);

          // Academic Content Mock
          setContentData({
            totalFiles: 12,
            totalSizeLabel: '38.4 MB',
            categories: [
              { name: 'DBMS Notes', count: 3 },
              { name: 'OS Lab Sheets', count: 5 },
              { name: 'CN Slides', count: 4 }
            ]
          });

          // Quizzes Tab Mock
          setQuizzesData([
            { title: 'DBMS Quiz 1', attempts: 38, avgScore: 82 },
            { title: 'OS Midterm Quiz', attempts: 34, avgScore: 71 },
            { title: 'CN Basics Quiz', attempts: 36, avgScore: 76 }
          ]);

        } else {
          // ── LIVE DATABASE MODE ──
          if (inScopeSectionIds.length === 0) {
            setLoading(false);
            return;
          }

          // 1. Attendance Queries
          const { data: attRows } = await supabase
            .from('attendance')
            .select('date, status, section_id')
            .in('section_id', inScopeSectionIds)
            .gte('date', fromDate)
            .lte('date', toDate);

          const dateMap = new Map<string, { present: number; total: number }>();
          for (const row of attRows || []) {
            if (row.status !== 'present' && row.status !== 'absent') continue;
            const entry = dateMap.get(row.date) ?? { present: 0, total: 0 };
            entry.total += 1;
            if (row.status === 'present') entry.present += 1;
            dateMap.set(row.date, entry);
          }
          const dailyTrend = Array.from(dateMap.entries()).map(([date, entry]) => ({
            date,
            percent: entry.total > 0 ? Math.round((entry.present / entry.total) * 100) : 0
          })).sort((a, b) => a.date.localeCompare(b.date));

          // Section Comparison
          const { data: compRows } = await supabase
            .from('attendance')
            .select('section_id, status')
            .in('section_id', filteredSectionsOptions.map(s => s.id))
            .gte('date', fromDate)
            .lte('date', toDate);

          const sectionMap = new Map<string, { present: number; total: number }>();
          for (const row of compRows || []) {
            if (row.status !== 'present' && row.status !== 'absent') continue;
            const entry = sectionMap.get(row.section_id) ?? { present: 0, total: 0 };
            entry.total += 1;
            if (row.status === 'present') entry.present += 1;
            sectionMap.set(row.section_id, entry);
          }
          const sectionComparison = filteredSectionsOptions.map(sec => {
            const entry = sectionMap.get(sec.id) ?? { present: 0, total: 0 };
            return {
              label: sec.name,
              percent: entry.total > 0 ? Math.round((entry.present / entry.total) * 100) : 0
            };
          });

          // Monthly Averages
          const monthlyMap = new Map<string, { sum: number; count: number }>();
          for (const pt of dailyTrend) {
            const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(new Date(pt.date + 'T00:00:00'));
            const entry = monthlyMap.get(monthLabel) ?? { sum: 0, count: 0 };
            entry.sum += pt.percent;
            entry.count += 1;
            monthlyMap.set(monthLabel, entry);
          }
          const monthlyAverages = Array.from(monthlyMap.entries()).map(([label, entry]) => ({
            label,
            percent: entry.count > 0 ? Math.round(entry.sum / entry.count) : 0
          }));

          if (cancelled) return;
          setAttendanceData({ dailyTrend, sectionComparison, monthlyAverages });

          // 2. Students & Roster Queries
          const { data: studentsList } = await supabase
            .from('students')
            .select('id, name, enrollment_number')
            .in('section_id', inScopeSectionIds);

          const studentIds = (studentsList || []).map(s => s.id);
          let lowAttendanceRisk: Array<{ name: string; roll: string; percent: number }> = [];
          let performanceTrend: Array<{ label: string; val: number }> = [];
          let assignmentCompletion: Array<{ label: string; val: number }> = [];

          if (studentIds.length > 0) {
            const { data: attOverall } = await supabase
              .from('attendance')
              .select('student_id, status')
              .in('student_id', studentIds);

            const studentAttMap = new Map<string, { present: number; total: number }>();
            for (const row of attOverall || []) {
              if (row.status !== 'present' && row.status !== 'absent') continue;
              const entry = studentAttMap.get(row.student_id) ?? { present: 0, total: 0 };
              entry.total += 1;
              if (row.status === 'present') entry.present += 1;
              studentAttMap.set(row.student_id, entry);
            }

            lowAttendanceRisk = (studentsList || []).map(student => {
              const entry = studentAttMap.get(student.id) ?? { present: 0, total: 0 };
              const percent = entry.total > 0 ? Math.round((entry.present / entry.total) * 100) : null;
              return {
                name: student.name,
                roll: student.enrollment_number ?? student.id.slice(0, 8),
                percent: percent ?? 100
              };
            })
            .filter(s => s.percent < 75)
            .sort((a, b) => a.percent - b.percent)
            .slice(0, 5);

            // Performance Trend (Quiz attempts average progression)
            const { data: attempts } = await supabase
              .from('quiz_attempts')
              .select('score, submitted_at')
              .in('student_id', studentIds)
              .not('score', 'is', null);

            const attemptsByDate = new Map<string, { sum: number; count: number }>();
            for (const row of attempts || []) {
              const dateStr = new Date(row.submitted_at).toISOString().slice(0, 10);
              const score = Number(row.score);
              const entry = attemptsByDate.get(dateStr) ?? { sum: 0, count: 0 };
              entry.sum += score;
              entry.count += 1;
              attemptsByDate.set(dateStr, entry);
            }
            performanceTrend = Array.from(attemptsByDate.entries()).map(([date, entry]) => ({
              label: new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(date + 'T00:00:00')),
              val: entry.count > 0 ? Math.round(entry.sum / entry.count) : 0
            })).sort((a, b) => a.label.localeCompare(b.label)).slice(-7);

            // Assignment Completion
            const { data: subRows } = await supabase
              .from('assignment_submissions')
              .select('status')
              .in('student_id', studentIds);

            const subMap = { submitted: 0, total: 0 };
            for (const row of subRows || []) {
              subMap.total += 1;
              if (row.status === 'submitted' || row.status === 'done') {
                subMap.submitted += 1;
              }
            }
            assignmentCompletion = [
              { label: 'Submitted', val: subMap.total > 0 ? Math.round((subMap.submitted / subMap.total) * 100) : 0 },
              { label: 'Not Submitted', val: subMap.total > 0 ? Math.round(((subMap.total - subMap.submitted) / subMap.total) * 100) : 0 }
            ];
          }

          if (cancelled) return;
          setStudentsData({ lowAttendanceRisk, performanceTrend, assignmentCompletion });

          // 3. Teachers workload
          const { count: quizzesCount } = await supabase
            .from('quizzes')
            .select('*', { count: 'exact', head: true });

          const { count: materialsCount } = await supabase
            .from('files')
            .select('*', { count: 'exact', head: true });

          const { data: attPeriods } = await supabase
            .from('attendance')
            .select('date, time_slot');
          const uniquePeriods = new Set((attPeriods || []).map(p => `${p.date}:${p.time_slot}`));

          if (cancelled) return;
          setTeachersData({
            quizzesCount: quizzesCount || 0,
            materialsCount: materialsCount || 0,
            attendanceCount: uniquePeriods.size
          });

          // 4. Subjects analytics
          const { data: subjQuizData } = await supabase
            .from('quiz_attempts')
            .select('score, quizzes!inner(unit_id, units!inner(subject_id, subjects!inner(name)))')
            .not('score', 'is', null);

          const subjMap = new Map<string, { sum: number; count: number }>();
          for (const row of subjQuizData || []) {
            const r = row as any;
            const subjName = r.quizzes.units.subjects.name;
            const score = Number(r.score);
            const entry = subjMap.get(subjName) ?? { sum: 0, count: 0 };
            entry.sum += score;
            entry.count += 1;
            subjMap.set(subjName, entry);
          }
          const subjectsData = Array.from(subjMap.entries()).map(([name, entry]) => ({
            name,
            score: entry.count > 0 ? Math.round(entry.sum / entry.count) : 0
          }));

          if (cancelled) return;
          setSubjectsData(subjectsData);

          // 5. Academic Content usage
          const { data: filesData } = await supabase
            .from('files')
            .select('category, size_bytes');

          const catMap = new Map<string, number>();
          let totalBytes = 0;
          for (const f of filesData || []) {
            totalBytes += Number(f.size_bytes || 0);
            const cat = f.category || 'General';
            catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
          }
          const fileSizeLabel = (bytes: number) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
          };

          if (cancelled) return;
          setContentData({
            totalFiles: (filesData || []).length,
            totalSizeLabel: fileSizeLabel(totalBytes),
            categories: Array.from(catMap.entries()).map(([name, count]) => ({ name, count }))
          });

          // 6. Quizzes tab
          const { data: quizStats } = await supabase
            .from('quizzes')
            .select('id, title, quiz_attempts(score)')
            .not('quiz_attempts.score', 'is', null);

          const quizzesData = (quizStats || []).map((q: any) => {
            const scores = q.quiz_attempts.map((a: any) => Number(a.score));
            const avgScore = scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;
            return {
              title: q.title,
              attempts: scores.length,
              avgScore
            };
          });

          if (cancelled) return;
          setQuizzesData(quizzesData);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError('Failed to load real-time analytics. Please try again.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadReportMetrics();

    return () => {
      cancelled = true;
    };
  }, [activeSectionId, selectedSemester, fromDate, toDate, filteredSectionsOptions, sections, refreshTrigger]);

  const handlePreview = (reportTitle: string) => {
    setSelectedReport(reportTitle);
    setDrawerOpen(true);
  };

  const handleExportCSV = () => {
    let headers: string[] = [];
    let rows: string[][] = [];
    let fileName = `${activeTab}-report.csv`;

    if (activeTab === 'attendance') {
      headers = ['Date', 'Attendance Percentage'];
      rows = attendanceData.dailyTrend.map(pt => [pt.date, `${pt.percent}%`]);
    } else if (activeTab === 'students') {
      headers = ['Student Name', 'Roll Number', 'Overall Attendance'];
      rows = studentsData.lowAttendanceRisk.map(s => [s.name, s.roll, `${s.percent}%`]);
    } else if (activeTab === 'teachers') {
      headers = ['Metric', 'Count'];
      rows = [
        ['Quizzes Created', String(teachersData.quizzesCount)],
        ['Materials Uploaded', String(teachersData.materialsCount)],
        ['Attendance Periods Marked', String(teachersData.attendanceCount)]
      ];
    } else if (activeTab === 'subjects') {
      headers = ['Subject Name', 'Average Quiz Score'];
      rows = subjectsData.map(s => [s.name, `${s.score}%`]);
    } else if (activeTab === 'content') {
      headers = ['Material Category', 'Upload Count'];
      rows = contentData.categories.map(c => [c.name, String(c.count)]);
    } else if (activeTab === 'quizzes') {
      headers = ['Quiz Title', 'Total Attempts', 'Average Success Score'];
      rows = quizzesData.map(q => [q.title, String(q.attempts), `${q.avgScore}%`]);
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(val => `"${val.split('"').join('""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSectionChange = (id: string) => {
    setActiveSectionId(id);
    if (id !== 'all' && setSelectedSectionId) {
      setSelectedSectionId(id);
    }
  };

  // Detailed dynamic preview content inside Drawer
  const renderPreviewDetail = () => {
    if (loading) {
      return (
        <div className="space-y-4">
          <SkeletonLoader className="h-6 w-full" variant="text" />
          <SkeletonLoader className="h-24 w-full" />
        </div>
      );
    }

    if (activeTab === 'attendance') {
      return (
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase text-muted tracking-widest">Daily Log Detail</h4>
          <div className="max-h-60 overflow-y-auto rounded-control border border-border bg-background">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted border-b border-border sticky top-0">
                <tr>
                  <th className="p-2 font-bold uppercase text-muted">Date</th>
                  <th className="p-2 font-bold uppercase text-muted text-right">Avg Percentage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {attendanceData.dailyTrend.map((pt, i) => (
                  <tr key={i} className="hover:bg-surface-muted/30">
                    <td className="p-2 font-medium text-text">{pt.date}</td>
                    <td className="p-2 text-right font-black text-accent">{pt.percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (activeTab === 'students') {
      return (
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase text-muted tracking-widest">Defaulter Students Log</h4>
          <div className="max-h-60 overflow-y-auto rounded-control border border-border bg-background">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted border-b border-border sticky top-0">
                <tr>
                  <th className="p-2 font-bold uppercase text-muted">Name</th>
                  <th className="p-2 font-bold uppercase text-muted">Roll</th>
                  <th className="p-2 font-bold uppercase text-muted text-right">Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {studentsData.lowAttendanceRisk.map((s, i) => (
                  <tr key={i} className="hover:bg-surface-muted/30">
                    <td className="p-2 font-medium text-text">{s.name}</td>
                    <td className="p-2 text-muted">{s.roll}</td>
                    <td className="p-2 text-right font-black text-status-red">{s.percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (activeTab === 'teachers') {
      return (
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase text-muted tracking-widest">Activity Audit Logs</h4>
          <ul className="divide-y divide-border text-xs border border-border rounded-control bg-background">
            <li className="p-2 flex justify-between">
              <span className="text-muted">Quizzes Created</span>
              <span className="font-bold text-text">{teachersData.quizzesCount}</span>
            </li>
            <li className="p-2 flex justify-between">
              <span className="text-muted">Study Materials Uploaded</span>
              <span className="font-bold text-text">{teachersData.materialsCount}</span>
            </li>
            <li className="p-2 flex justify-between">
              <span className="text-muted">Attendance Registers Marked</span>
              <span className="font-bold text-text">{teachersData.attendanceCount}</span>
            </li>
          </ul>
        </div>
      );
    }

    if (activeTab === 'subjects') {
      return (
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase text-muted tracking-widest">Subject Scores Details</h4>
          <ul className="divide-y divide-border text-xs border border-border rounded-control bg-background">
            {subjectsData.map((subj, i) => (
              <li key={i} className="p-2 flex justify-between">
                <span className="text-muted truncate max-w-xs">{subj.name}</span>
                <span className="font-bold text-accent">{subj.score}%</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    if (activeTab === 'content') {
      return (
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase text-muted tracking-widest">Materials Breakdown</h4>
          <ul className="divide-y divide-border text-xs border border-border rounded-control bg-background">
            {contentData.categories.map((cat, i) => (
              <li key={i} className="p-2 flex justify-between">
                <span className="text-muted truncate max-w-xs">{cat.name}</span>
                <span className="font-bold text-text">{cat.count} files</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    if (activeTab === 'quizzes') {
      return (
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase text-muted tracking-widest">Quiz Performance Summary</h4>
          <div className="max-h-60 overflow-y-auto rounded-control border border-border bg-background">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted border-b border-border sticky top-0">
                <tr>
                  <th className="p-2 font-bold uppercase text-muted">Quiz</th>
                  <th className="p-2 font-bold uppercase text-muted text-center">Attempts</th>
                  <th className="p-2 font-bold uppercase text-muted text-right">Avg Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {quizzesData.map((q, i) => (
                  <tr key={i} className="hover:bg-surface-muted/30">
                    <td className="p-2 font-medium text-text truncate max-w-xs">{q.title}</td>
                    <td className="p-2 text-center text-muted">{q.attempts}</td>
                    <td className="p-2 text-right font-black text-accent">{q.avgScore}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <section className="flex flex-col gap-5 animate-chart-fade">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Breadcrumb
            items={[
              { label: 'Dashboard', href: '/' },
              { label: 'Reports', current: true },
            ]}
          />
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text">Reports & Analytics Center</h1>
          <p className="mt-1 text-sm text-soft">Comprehensive insights across all academic parameters.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" onClick={() => setRefreshTrigger(prev => prev + 1)} className="hidden sm:inline-flex" disabled={loading}>
            Refresh Data
          </Button>
          <Button variant="primary" onClick={() => handlePreview(`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Report Preview`)}>
            Preview Report
          </Button>
          <div className="flex items-center gap-2 border-l border-border pl-2">
            <IconButton icon={
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.5 2C7.77614 2 8 2.22386 8 2.5V9.29289L11.1464 6.14645C11.3417 5.95118 11.6583 5.95118 11.8536 6.14645C12.0488 6.34171 12.0488 6.65829 11.8536 6.85355L7.85355 10.8536C7.65829 11.0488 7.34171 11.0488 7.14645 10.8536L3.14645 6.85355C2.95118 6.65829 2.95118 6.34171 3.14645 6.14645C3.34171 5.95118 3.65829 5.95118 3.85355 6.14645L7 9.29289V2.5C7 2.22386 7.22386 2 7.5 2ZM2 11.5C2 11.2239 2.22386 11 2.5 11H12.5C12.7761 11 13 11.2239 13 11.5C13 11.7761 12.7761 12 12.5 12H2.5C2.22386 12 2 11.7761 2 11.5Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
            } label="Export CSV" onClick={handleExportCSV} />
            <IconButton icon={
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.5C12 2.22386 11.7761 2 11.5 2H3.5C3.22386 2 3 2.22386 3 2.5V5.5C3 5.77614 3.22386 6 3.5 6H11.5C11.7761 6 12 5.77614 12 5.5V2.5ZM4 3H11V5H4V3ZM12.5 7C12.7761 7 13 7.22386 13 7.5V11.5C13 11.7761 12.7761 12 12.5 12H11.5V13.5C11.5 13.7761 11.2761 14 11 14H4C3.72386 14 3.5 13.7761 3.5 13.5V12H2.5C2.22386 12 2 11.7761 2 11.5V7.5C2 7.22386 2.22386 7 2.5 7H12.5ZM10.5 12H4.5V13H10.5V12ZM11.5 8.5C11.5 8.77614 11.2761 9 11 9C10.7239 9 10.5 8.77614 10.5 8.5C10.5 8.22386 10.7239 8 11 8C11.2761 8 11.5 8.22386 11.5 8.5Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
            } label="Print Report" onClick={() => window.print()} />
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-card border border-status-red bg-status-red/10 p-4 text-sm font-semibold text-status-red">
          {error}
        </div>
      )}

      <div className="card p-2 sm:px-4 sm:py-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            items={REPORT_TABS}
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full lg:w-auto"
          />
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4 lg:border-t-0 lg:pt-0">
            <DatePicker aria-label="Start Date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-36 text-xs" />
            <span className="text-muted text-xs">to</span>
            <DatePicker aria-label="End Date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-36 text-xs" />
            <Select
              aria-label="Semester"
              value={selectedSemester}
              onChange={(e) => {
                setSelectedSemester(e.target.value);
                setActiveSectionId('all'); // reset section filter when semester changes
              }}
              options={[
                { value: 'all', label: 'All Semesters' },
                ...semestersList.map(sem => ({ value: sem, label: sem }))
              ]}
              className="h-9 w-32 text-xs"
            />
            <Select
              aria-label="Section"
              value={activeSectionId}
              onChange={(e) => handleSectionChange(e.target.value)}
              options={[
                { value: 'all', label: 'All Sections' },
                ...filteredSectionsOptions.map(sec => ({ value: sec.id, label: sec.name }))
              ]}
              className="h-9 w-32 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {activeTab === 'attendance' && (
          <>
            <ChartCard title="Daily Attendance Trend" description="Overall percentage over the selected range." loading={loading} empty={attendanceData.dailyTrend.length === 0}>
              <div className="flex h-56 items-end gap-2 border-b border-border pb-2 pt-8">
                {attendanceData.dailyTrend.map((pt, i) => (
                  <div key={i} className="flex-1 rounded-t-sm bg-accent transition-all hover:bg-accent-strong" style={{ height: `${pt.percent}%` }} title={`${pt.date}: ${pt.percent}%`} />
                ))}
              </div>
            </ChartCard>

            <ChartCard title="Section-wise Comparison" description="Attendance distribution across sections." loading={loading} empty={attendanceData.sectionComparison.length === 0}>
              <div className="flex h-56 flex-col justify-center gap-4">
                 {attendanceData.sectionComparison.map((sec, i) => (
                   <div key={i} className="flex items-center gap-3 text-xs">
                     <span className="w-16 truncate font-medium text-text">{sec.label}</span>
                     <div className="h-2 flex-1 rounded-full bg-surface-muted overflow-hidden">
                       <div className="h-full bg-accent" style={{ width: `${sec.percent}%` }} />
                     </div>
                     <span className="w-8 font-semibold text-right">{sec.percent}%</span>
                   </div>
                 ))}
              </div>
            </ChartCard>

            <ChartCard title="Monthly Averages" description="Aggregated average percentage by month." loading={loading} empty={attendanceData.monthlyAverages.length === 0}>
              <div className="flex h-56 items-end gap-3 border-b border-l border-border px-2 pb-2 pt-8">
                {attendanceData.monthlyAverages.map((m, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1.5 h-full justify-end">
                    <div className="w-8 rounded-t-sm bg-teal-500/80 hover:bg-teal-600 transition-colors" style={{ height: `${m.percent}%` }} title={`${m.percent}%`} />
                    <span className="text-[10px] text-muted font-bold whitespace-nowrap">{m.label}</span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </>
        )}

        {activeTab === 'students' && (
          <>
            <ChartCard title="Low Attendance Risk" description="Students below 75% threshold." loading={loading} empty={studentsData.lowAttendanceRisk.length === 0}>
              <div className="flex h-56 flex-col justify-center gap-4">
                 {studentsData.lowAttendanceRisk.map((s, i) => (
                   <div key={i} className="flex items-center gap-3 text-xs">
                     <span className="w-24 truncate font-medium text-text" title={s.name}>{s.name}</span>
                     <div className="h-2 flex-1 rounded-full bg-surface-muted overflow-hidden">
                       <div className="h-full bg-status-red" style={{ width: `${s.percent}%` }} />
                     </div>
                     <span className="w-12 font-semibold text-status-red text-right">{s.percent}%</span>
                   </div>
                 ))}
              </div>
            </ChartCard>

            <ChartCard title="Performance Trend" description="Overall class score progression." loading={loading} empty={studentsData.performanceTrend.length === 0}>
              <div className="flex h-56 items-end gap-3 border-b border-l border-border px-2 pb-2 pt-8">
                {studentsData.performanceTrend.map((pt, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1.5 h-full justify-end">
                    <div className="w-8 rounded-t-sm bg-status-green/80 hover:bg-status-green transition-colors" style={{ height: `${pt.val}%` }} title={`${pt.val}%`} />
                    <span className="text-[10px] text-muted font-bold whitespace-nowrap">{pt.label}</span>
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="Assignment Completion" description="Submission rate over time." loading={loading} empty={studentsData.assignmentCompletion.length === 0}>
              <div className="flex h-56 items-end gap-4 justify-center pb-4">
                {studentsData.assignmentCompletion.map((item, i) => (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <div className="w-14 rounded-t-md bg-blue-500/80 transition-all hover:bg-blue-500" style={{ height: `${item.val * 1.5}px` }} />
                    <span className="text-[11px] font-bold text-text">{item.label}</span>
                    <span className="text-xs font-semibold text-muted">{item.val}%</span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </>
        )}

        {activeTab === 'teachers' && (
           <div className="col-span-full">
             <ChartCard title="Teacher Workload & Activity" description="Aggregated academic resources and attendance actions." loading={loading}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
                  <div className="rounded-card border border-border bg-surface-muted/30 p-5 text-center">
                    <p className="text-3xl font-black text-accent">{teachersData.quizzesCount}</p>
                    <p className="mt-2 text-sm font-semibold text-text">Quizzes Created</p>
                    <p className="text-xs text-muted mt-1">Total active evaluations</p>
                  </div>
                  <div className="rounded-card border border-border bg-surface-muted/30 p-5 text-center">
                    <p className="text-3xl font-black text-teal-600">{teachersData.materialsCount}</p>
                    <p className="mt-2 text-sm font-semibold text-text">Study Materials Uploaded</p>
                    <p className="text-xs text-muted mt-1">Total shared academic assets</p>
                  </div>
                  <div className="rounded-card border border-border bg-surface-muted/30 p-5 text-center">
                    <p className="text-3xl font-black text-status-amber">{teachersData.attendanceCount}</p>
                    <p className="mt-2 text-sm font-semibold text-text">Attendance Registers</p>
                    <p className="text-xs text-muted mt-1">Periods marked across all sections</p>
                  </div>
                </div>
             </ChartCard>
           </div>
        )}

        {activeTab === 'subjects' && (
           <div className="col-span-full">
             <ChartCard title="Subject Performance Overview" description="Aggregate evaluation averages by subject." loading={loading} empty={subjectsData.length === 0}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
                  {subjectsData.map((subj, i) => (
                    <div key={i} className="rounded-card border border-border bg-surface-muted/30 p-4 flex flex-col justify-between min-h-[110px]">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-muted">Subject</p>
                        <p className="text-sm font-black text-text mt-1 truncate" title={subj.name}>{subj.name}</p>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs font-bold text-soft">Avg Score</span>
                        <span className="text-lg font-black text-accent">{subj.score}%</span>
                      </div>
                    </div>
                  ))}
                </div>
             </ChartCard>
           </div>
        )}

        {activeTab === 'content' && (
           <div className="col-span-full">
             <ChartCard title="Academic Content Usage" description="Study materials downloaded by students." loading={loading} empty={contentData.totalFiles === 0}>
                <div className="p-5">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <p className="text-xs text-muted font-semibold">Total Materials</p>
                      <p className="text-2xl font-black text-text mt-1">{contentData.totalFiles} Files</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted font-semibold">Total Size</p>
                      <p className="text-2xl font-black text-teal-600 mt-1">{contentData.totalSizeLabel}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {contentData.categories.map((cat, i) => (
                      <div key={i} className="rounded-control border border-border bg-surface-muted/40 p-4">
                        <p className="text-[11px] font-black uppercase text-muted tracking-wide truncate" title={cat.name}>{cat.name}</p>
                        <p className="text-xl font-bold text-text mt-2">{cat.count} files</p>
                      </div>
                    ))}
                  </div>
                </div>
             </ChartCard>
           </div>
        )}

        {activeTab === 'quizzes' && (
           <div className="col-span-full">
             <ChartCard title="Quiz Success Rate" description="Average score across all published quizzes." loading={loading} empty={quizzesData.length === 0}>
                <div className="p-4 overflow-x-auto">
                  <table className="table-base w-full text-left">
                    <thead>
                      <tr>
                        <th className="table-header-cell text-xs font-bold uppercase text-muted py-2 px-4 border-b border-border">Quiz Title</th>
                        <th className="table-header-cell text-xs font-bold uppercase text-muted py-2 px-4 border-b border-border text-center">Attempts</th>
                        <th className="table-header-cell text-xs font-bold uppercase text-muted py-2 px-4 border-b border-border text-right">Avg Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {quizzesData.map((quiz, i) => (
                        <tr key={i} className="hover:bg-surface-muted/40">
                          <td className="py-2.5 px-4 text-sm font-semibold text-text truncate max-w-xs" title={quiz.title}>{quiz.title}</td>
                          <td className="py-2.5 px-4 text-sm text-soft text-center">{quiz.attempts} students</td>
                          <td className="py-2.5 px-4 text-sm font-black text-accent text-right">{quiz.avgScore}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
             </ChartCard>
           </div>
        )}
      </div>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title={selectedReport || 'Report Preview'} side="right">
        <div className="flex flex-col gap-6">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Summary Insights</h3>
            <p className="text-xs text-soft leading-relaxed">
              This report provides a detailed breakdown of the selected metric.
              Currently viewing active values from {isLocalDemoMode() ? 'local simulated demo data' : 'production database records'}.
            </p>
          </div>
          
          {/* Detailed Preview Content List */}
          <div className="border-t border-b border-border py-4">
            {renderPreviewDetail()}
          </div>

          <div className="rounded-card bg-surface-muted p-4">
             <div className="flex items-center justify-between border-b border-border pb-2 text-xs">
                <span className="font-medium">Selected Semester</span>
                <span className="text-muted font-semibold">{selectedSemester === 'all' ? 'All Semesters' : selectedSemester}</span>
             </div>
             <div className="flex items-center justify-between border-b border-border py-2 text-xs">
                <span className="font-medium">Active Section Scope</span>
                <span className="text-muted font-semibold">
                  {activeSectionId === 'all' ? 'All Sections' : sections.find(s => s.id === activeSectionId)?.name ?? 'None'}
                </span>
             </div>
             <div className="flex items-center justify-between border-b border-border py-2 text-xs">
                <span className="font-medium">Date Range</span>
                <span className="text-muted font-semibold">{fromDate} to {toDate}</span>
             </div>
             <div className="flex items-center justify-between pt-2 text-xs">
                <span className="font-medium">Data Status</span>
                <span className="text-status-green font-bold">Synced Live</span>
             </div>
          </div>
          <div className="flex flex-col gap-2 pt-4">
            <Button variant="primary" className="w-full justify-center" onClick={handleExportCSV}>Download CSV</Button>
          </div>
        </div>
      </Drawer>
    </section>
  );
}
