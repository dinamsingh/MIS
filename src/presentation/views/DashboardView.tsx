/**
 * Dashboard module view.
 *
 * Presentation-only dashboard shell. Data continues to arrive through the
 * DashboardDataProvider interface so Supabase, routing, and business logic stay
 * outside this redesign phase.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { isAtRisk, classAverage } from '@domain/services/analyticsService';
import { todaysClasses, type DayOfWeek, type TimetableEntry } from '@domain/services/timetableService';
import { combinedScore, type LeaderboardWeights, type StudentMetrics } from '@domain/services/leaderboardService';
import { DashboardSkeleton } from '@presentation/components/skeletons';
import SkeletonPulse from '@presentation/components/skeletons/SkeletonPulse';
import {
  StudentDirectoryModal,
  TodaySchedule,
  scheduleFromEntries,
} from '@presentation/components/dashboard/DashboardWidgets';

const DashboardCharts = lazy(() => import('@presentation/components/dashboard/DashboardCharts'));

export interface AttendanceTrendPoint {
  readonly date: string;
  readonly percent: number;
}

export interface DashboardSummary {
  readonly totalStudents: number;
  readonly avgAttendancePercent: number;
  readonly avgInternalMarks: number;
  readonly syllabusProgressPercent: number;
}

export interface DashboardDataProvider {
  loadSummary(): Promise<DashboardSummary>;
  loadTimetableEntries(): Promise<TimetableEntry[]>;
  loadAttendanceTrend(fromDate: string, toDate: string): Promise<AttendanceTrendPoint[]>;
  loadStudentMetrics(): Promise<StudentMetrics[]>;
  loadWeights(): Promise<LeaderboardWeights>;
}

export interface DashboardViewProps {
  dataProvider: DashboardDataProvider;
  performanceThreshold?: number;
  subjectNames?: Record<string, string>;
  sectionNames?: Record<string, string>;
}

function getDayOfWeek(): DayOfWeek {
  const days: DayOfWeek[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  return days[new Date().getDay()];
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d);
}



function chartFallback() {
  return (
    <div className="grid grid-cols-1 gap-5" aria-label="Loading dashboard charts">
      <div className="card p-5">
        <SkeletonPulse width="w-40" height="h-4" className="mb-2" />
        <SkeletonPulse width="w-56" height="h-3" className="mb-6" />
        <SkeletonPulse width="w-full" height="h-52" />
      </div>
    </div>
  );
}

export default function DashboardView({
  dataProvider,
  performanceThreshold = 60,
  subjectNames = {},
  sectionNames = {},
}: DashboardViewProps) {

  const navigate = useNavigate();


  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [trendPoints, setTrendPoints] = useState<AttendanceTrendPoint[]>([]);
  const [studentMetrics, setStudentMetrics] = useState<StudentMetrics[]>([]);
  const [weights, setWeights] = useState<LeaderboardWeights>({
    internalMarks: 1,
    quizScores: 1,
    attendance: 1,
  });
  const [showGraphModal, setShowGraphModal] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<{ date: string; percent: number; x: number; y: number } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState('All');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [loadedSummary, entries, metrics, loadedWeights] = await Promise.all([
        dataProvider.loadSummary(),
        dataProvider.loadTimetableEntries(),
        dataProvider.loadStudentMetrics(),
        dataProvider.loadWeights(),
      ]);
      setSummary(loadedSummary);
      setTimetableEntries(entries);
      setStudentMetrics(metrics);
      setWeights(loadedWeights);
    } catch {
      setSummary({
        totalStudents: 0,
        avgAttendancePercent: 0,
        avgInternalMarks: 0,
        syllabusProgressPercent: 0,
      });
      setTimetableEntries([]);
      setStudentMetrics([]);
    } finally {
      setIsLoading(false);
    }
  }, [dataProvider]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const from = daysAgo(42);
    const to = toISODate(new Date());
    dataProvider.loadAttendanceTrend(from, to).then(setTrendPoints).catch(() => setTrendPoints([]));
  }, [dataProvider]);

  const todayClasses = useMemo(
    () => todaysClasses(timetableEntries, getDayOfWeek()),
    [timetableEntries],
  );

  const needsAttention = useMemo(() => {
    if (studentMetrics.length === 0) return [];
    const scored = studentMetrics.map((metric) => ({
      ...metric,
      score: combinedScore(metric, weights),
    }));
    const atRisk = scored.filter((student) => {
      const averagePerformance = classAverage([
        student.internalMarks,
        student.quizScore,
        student.attendancePercent,
      ]);
      return isAtRisk(averagePerformance, performanceThreshold);
    });
    atRisk.sort((a, b) => a.score - b.score);
    return atRisk;
  }, [studentMetrics, weights, performanceThreshold]);

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return studentMetrics.filter((student) => {
      const matchesSearch =
        query.length === 0 ||
        student.name.toLowerCase().includes(query) ||
        (student.enrollmentNumber || '').toLowerCase().includes(query);
      const matchesSection =
        selectedSectionFilter === 'All' || student.sectionName === selectedSectionFilter;
      return matchesSearch && matchesSection;
    });
  }, [studentMetrics, searchQuery, selectedSectionFilter]);

  const sectionOptions = useMemo(
    () => Array.from(new Set(studentMetrics.map((student) => student.sectionName).filter(Boolean))).sort() as string[],
    [studentMetrics],
  );

  const getClassStatus = useCallback((entry: TimetableEntry, index: number): 'done' | 'next' | 'upcoming' => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const match = entry.timeSlot.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      const slotMinutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      if (currentMinutes > slotMinutes + 50) return 'done';
      if (currentMinutes >= slotMinutes - 10) return 'next';
    }
    if (index === 0) return 'done';
    if (index === 1) return 'next';
    return 'upcoming';
  }, []);

  const resolvedSummary = summary ?? {
    totalStudents: 0,
    avgAttendancePercent: 0,
    avgInternalMarks: 0,
    syllabusProgressPercent: 0,
  };

  const attPct = resolvedSummary.avgAttendancePercent;
  const openAttendanceReport = useCallback(() => navigate('/attendance'), [navigate]);

  // Computed data points for mini & full graph
  const displayPoints = useMemo(() => {
    return trendPoints;
  }, [trendPoints]);

  // Compute SVG line path points (normalized to 160x45)
  const lineGraphSvgPoints = useMemo(() => {
    const width = 140;
    const height = 40;
    const padding = 10;
    const miniPoints = displayPoints.slice(-7);
    const count = miniPoints.length;
    if (count === 0) return { pathString: '', areaString: '', points: [] };

    const pts = miniPoints.map((pt, i) => {
      const x = padding + (i / Math.max(1, count - 1)) * (width - 2 * padding);
      const normalizedPct = Math.max(0, Math.min(100, pt.percent));
      const y = height - (normalizedPct / 100) * (height - 10) + 5;
      return { ...pt, x, y };
    });

    const pathString = pts.reduce((acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), '');
    const firstX = pts[0]?.x ?? 0;
    const lastX = pts[pts.length - 1]?.x ?? width;
    const areaString = `${pathString} L ${lastX} ${height + 5} L ${firstX} ${height + 5} Z`;

    return { pathString, areaString, points: pts };
  }, [displayPoints]);

  const subjectCount = useMemo(
    () => new Set(timetableEntries.map((entry) => entry.subjectId)).size,
    [timetableEntries],
  );

  const averageQuizScore = useMemo(() => {
    if (studentMetrics.length === 0) return 0;
    return studentMetrics.reduce((sum, student) => sum + student.quizScore, 0) / studentMetrics.length;
  }, [studentMetrics]);

  const scheduleItems = useMemo(
    () => scheduleFromEntries(todayClasses, subjectNames, sectionNames, getClassStatus),
    [getClassStatus, sectionNames, subjectNames, todayClasses],
  );





  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full flex flex-col gap-6">


      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div 
          role="button"
          tabIndex={0}
          onClick={() => setShowStudentsModal(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowStudentsModal(true); }}
          className="bg-surface rounded-[14px] p-4 border border-border flex items-center gap-4 cursor-pointer hover:bg-surface-muted hover:border-accent/40 transition-colors shadow-sm hover:shadow-elevated group"
        >
          <div className="w-12 h-12 rounded-full bg-accent-tint flex items-center justify-center text-accent">
            <span className="material-symbols-outlined">groups</span>
          </div>
          <div>
            <p className="text-sm text-text-soft font-medium">Total Students</p>
            <p className="text-2xl font-bold text-accent">{resolvedSummary.totalStudents}</p>
          </div>
        </div>
        <div className="bg-surface rounded-[14px] p-4 border border-border flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#E0E7FF] flex items-center justify-center text-[#4338CA]">
            <span className="material-symbols-outlined">book</span>
          </div>
          <div>
            <p className="text-sm text-text-soft font-medium">Subjects</p>
            <p className="text-2xl font-bold text-accent">{subjectCount}</p>
          </div>
        </div>
        <div className="bg-surface rounded-[14px] p-4 border border-border flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#FEF3C7] flex items-center justify-center text-[#B45309]">
            <span className="material-symbols-outlined">quiz</span>
          </div>
          <div>
            <p className="text-sm text-text-soft font-medium">Quiz Avg</p>
            <p className="text-2xl font-bold text-accent">{averageQuizScore.toFixed(1)}%</p>
          </div>
        </div>
        <div className="bg-surface rounded-[14px] p-4 border border-border flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#DCFCE7] flex items-center justify-center text-[#15803D]">
            <span className="material-symbols-outlined">task_alt</span>
          </div>
          <div>
            <p className="text-sm text-text-soft font-medium">Syllabus</p>
            <p className="text-2xl font-bold text-accent">{resolvedSummary.syllabusProgressPercent}%</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="col-span-1 lg:col-span-6 bg-surface rounded-[14px] p-6 border border-border relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-status-green opacity-5 rounded-full blur-2xl"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <h3 className="font-headline font-semibold text-lg text-accent flex items-center gap-2">
                Class Attendance
                <span className={`${attPct >= 75 ? 'bg-status-green/10 text-status-green' : 'bg-status-red/10 text-status-red'} text-xs px-2 py-0.5 rounded-full font-bold`}>
                  {attPct >= 75 ? 'Excellent' : 'Needs Review'}
                </span>
              </h3>
              <p className="text-sm text-text-soft mt-1">Average for {selectedSectionFilter === 'All' ? 'All Sections' : selectedSectionFilter}</p>
            </div>
            <button className="text-text-soft hover:text-accent" onClick={openAttendanceReport}><span className="material-symbols-outlined">more_horiz</span></button>
          </div>
          <div className="mt-8 flex items-end justify-between relative z-10">
            <div>
              <div className={`text-5xl font-black ${attPct >= 75 ? 'text-status-green' : 'text-status-red'} tracking-tight`}>
                {attPct.toFixed(1)}<span className="text-2xl">%</span>
              </div>
              <p className={`text-sm ${attPct >= 75 ? 'text-status-green' : 'text-status-red'} flex items-center gap-1 mt-2 font-medium`}>
                <span className="material-symbols-outlined text-[16px]">{attPct >= 75 ? 'check_circle' : 'warning'}</span>
                {attPct >= 75 ? 'Above 75% threshold' : 'Below 75% threshold'}
              </p>
            </div>
            
            <div 
              role="button"
              tabIndex={0}
              onClick={() => setShowGraphModal(true)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowGraphModal(true); }}
              className="w-32 h-16 flex items-end gap-1 opacity-80 cursor-pointer hover:opacity-100 transition-opacity group/graph relative"
              title="Click to view interactive full trend graph"
            >
              {hoveredPoint && (
                <div className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 rounded bg-accent px-2 py-1 text-[10px] font-bold text-white shadow-elevated transition-all whitespace-nowrap">
                  {hoveredPoint.date}: {hoveredPoint.percent}%
                </div>
              )}
              <svg className="w-full h-full overflow-visible" viewBox="0 0 140 45">
                <defs>
                  <linearGradient id="miniGraphGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={attPct >= 75 ? '#27966F' : '#C2802F'} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={attPct >= 75 ? '#27966F' : '#C2802F'} stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {lineGraphSvgPoints.areaString && (
                  <path d={lineGraphSvgPoints.areaString} fill="url(#miniGraphGrad)" />
                )}
                <line x1="0" y1="15" x2="140" y2="15" stroke="#C2802F" strokeDasharray="3 3" strokeWidth="1" opacity="0.6" />
                {lineGraphSvgPoints.pathString && (
                  <path
                    d={lineGraphSvgPoints.pathString}
                    fill="none"
                    stroke={attPct >= 75 ? '#27966F' : '#C2802F'}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {lineGraphSvgPoints.points.map((pt) => (
                  <circle
                    key={pt.date}
                    cx={pt.x}
                    cy={pt.y}
                    r={hoveredPoint?.date === pt.date ? '5' : '3'}
                    className="transition-all duration-150"
                    fill={hoveredPoint?.date === pt.date ? '#ffffff' : attPct >= 75 ? '#27966F' : '#C2802F'}
                    stroke={attPct >= 75 ? '#27966F' : '#C2802F'}
                    strokeWidth="2"
                    onMouseEnter={() => setHoveredPoint(pt)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                ))}
              </svg>
            </div>
          </div>
        </div>

        <div className={`col-span-1 lg:col-span-6 bg-surface rounded-[14px] p-6 border ${needsAttention.length > 0 ? 'border-status-red/30' : 'border-border'} relative overflow-hidden flex flex-col`}>
          {needsAttention.length > 0 && <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-status-red opacity-5 rounded-full blur-2xl"></div>}
          <div className="flex justify-between items-start relative z-10">
            <div>
              <h3 className="font-headline font-semibold text-lg text-accent flex items-center gap-2">
                Needs Attention
                <span className={`${needsAttention.length > 0 ? 'bg-status-red text-white' : 'bg-status-green text-white'} text-xs px-2 py-0.5 rounded-full font-bold flex items-center justify-center min-w-[24px]`}>
                  {needsAttention.length}
                </span>
              </h3>
              <p className="text-sm text-text-soft mt-1">Students below 75% attendance</p>
            </div>
            <span className={`material-symbols-outlined ${needsAttention.length > 0 ? 'text-status-red bg-status-red/10' : 'text-status-green bg-status-green/10'} p-2 rounded-lg`}>
              {needsAttention.length > 0 ? 'warning' : 'check_circle'}
            </span>
          </div>
          <div className="mt-6 flex-1 relative z-10">
            <ul className="flex flex-col gap-3">
              {needsAttention.length > 0 ? needsAttention.slice(0, 3).map(student => {
                const initials = student.name.split(' ').map(n => n[0]).join('').substring(0, 2);
                return (
                  <li key={student.studentId} className="flex items-center justify-between bg-background/50 p-2 rounded-lg border border-border/50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent-tint flex items-center justify-center text-xs font-bold text-accent">
                        {initials}
                      </div>
                      <span className="text-sm font-medium text-accent">{student.name}</span>
                    </div>
                    <span className="text-sm font-bold text-status-red">{student.attendancePercent.toFixed(0)}%</span>
                  </li>
                );
              }) : (
                <li className="flex items-center justify-center h-full text-sm text-muted">No students currently require academic intervention.</li>
              )}
            </ul>
          </div>
          <button onClick={() => navigate('/analytics')} className="mt-4 w-full bg-white border border-border hover:bg-surface-muted text-accent font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm relative z-10 shadow-sm">
            Review Students
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </div>

        <div className="col-span-1 lg:col-span-12">
           <TodaySchedule classes={scheduleItems} />
        </div>
        
        <div className="col-span-1 lg:col-span-12 bg-surface rounded-[14px] p-6 border border-border">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-headline font-semibold text-lg text-accent">Attendance Trend</h3>
              <p className="text-sm text-text-soft">Weekly overview for {selectedSectionFilter === 'All' ? 'All Sections' : selectedSectionFilter}</p>
            </div>
            <select className="bg-background border border-border text-sm rounded-lg px-3 py-1.5 focus:ring-[#0D746A] focus:border-[#0D746A] outline-none">
              <option>This Month</option>
              <option>Last Month</option>
              <option>Semester</option>
            </select>
          </div>
          <Suspense fallback={chartFallback()}>
            <div className="-mx-2 mt-4">
              <DashboardCharts trendPoints={trendPoints} />
            </div>
          </Suspense>
        </div>
      </div>


      {showStudentsModal && (
        <StudentDirectoryModal
          students={studentMetrics}
          filteredStudents={filteredStudents}
          searchQuery={searchQuery}
          selectedSectionFilter={selectedSectionFilter}
          sectionOptions={sectionOptions}
          onSearchChange={setSearchQuery}
          onSectionChange={setSelectedSectionFilter}
          onClose={() => {
            setShowStudentsModal(false);
            setSearchQuery('');
          }}
        />
      )}

      {/* ── Attendance Trend Pop-up Modal ── */}
      {showGraphModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-accent/40 p-4 backdrop-blur-sm animate-foundation-fade-in">
          <div className="card max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6 shadow-elevated">
            <div className="flex items-start justify-between border-b border-border/70 pb-4">
              <div>
                <span className="badge-success">Interactive Graph</span>
                <h3 className="mt-1 text-xl font-bold text-text">Attendance Trend Analysis</h3>
                <p className="text-xs text-muted">Weekly average attendance for selected section</p>
              </div>
              <button
                type="button"
                onClick={() => setShowGraphModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted text-lg text-text hover:bg-border"
              >
                ✕
              </button>
            </div>

            {/* Stats Summary in Modal */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-card border border-border/70 bg-surface p-3 text-center">
                <p className="text-[11px] font-semibold text-muted">CURRENT AVERAGE</p>
                <p className={`mt-1 text-2xl font-bold ${attPct >= 75 ? 'text-status-green' : 'text-status-amber'}`}>
                  {attPct.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-card border border-border/70 bg-surface p-3 text-center">
                <p className="text-[11px] font-semibold text-muted">TARGET THRESHOLD</p>
                <p className="mt-1 text-2xl font-bold text-status-amber">75.0%</p>
              </div>
              <div className="rounded-card border border-border/70 bg-surface p-3 text-center">
                <p className="text-[11px] font-semibold text-muted">TOTAL DAYS ANALYZED</p>
                <p className="mt-1 text-2xl font-bold text-text">{displayPoints.length} Days</p>
              </div>
            </div>

            {/* Detailed Interactive SVG Chart */}
            <div className="mt-6 rounded-card border border-border/70 bg-surface p-5">
              <Suspense fallback={chartFallback()}>
                <DashboardCharts trendPoints={trendPoints} />
              </Suspense>
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex items-center justify-between border-t border-border/70 pt-4">
              <button
                type="button"
                onClick={() => setShowGraphModal(false)}
                className="btn-secondary text-xs"
              >
                Close Modal
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowGraphModal(false);
                  openAttendanceReport();
                }}
                className="btn-accent text-xs font-semibold"
              >
                Open Full Attendance Report →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
