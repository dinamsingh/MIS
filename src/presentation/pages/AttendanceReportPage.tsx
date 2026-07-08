import { Fragment, useEffect, useMemo, useState } from 'react';
import { createAttendanceAccess, type AttendanceAccess, type AttendanceStatusRangeTally } from '@data/access/attendanceAccess';
import { createHeatmapAccess } from '@data/access/heatmapAccess';
import { createLocalDemoAttendanceAccess, demoNumber, isLocalDemoMode, listDemoRoster } from '@data/demo/localDemoMode';
import { supabase } from '@data/supabase';
import type { StudentAttendance } from '@domain/services/heatmapService';
import type { AttendanceStatus } from '@domain/services/attendanceService';
import { Alert, Badge, Button, Card, DatePicker, SearchInput, Select, SkeletonLoader } from '@presentation/components/ui';
import { useSelectedSection } from '@presentation/context/SelectedSectionContext';
import { loadRosterStudentsForSection, type LoadedRosterStudent } from '@presentation/loaders/rosterStudents';
import HeatmapView, { type HeatmapPersistence, type HeatmapStudent } from '@presentation/views/HeatmapView';

type PercentFilter = 'all' | 'below60' | 'below65' | 'below75' | 'above60' | 'above65' | 'above75' | 'custom';
type SortMode = 'lowest' | 'highest' | 'name' | 'absent';

interface ReportRow {
  readonly student: LoadedRosterStudent;
  readonly present: number;
  readonly absent: number;
  readonly leave: number;
  readonly notApplicable: number;
  readonly counted: number;
  readonly percent: number | null;
}

const supabaseAttendance = createAttendanceAccess(supabase);
const supabaseHeatmap = createHeatmapAccess(supabase);

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

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${iso}T00:00:00`));
}

function percentLabel(value: number | null): string {
  return value === null ? 'No counted class' : `${value.toFixed(1)}%`;
}

function attendancePercent(present: number, absent: number): number | null {
  const counted = present + absent;
  return counted === 0 ? null : (present / counted) * 100;
}

function statusLabel(status: AttendanceStatus): string {
  if (status === 'not-applicable') return 'N/A';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function riskTone(percent: number | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (percent === null) return 'neutral';
  if (percent < 60) return 'danger';
  if (percent < 75) return 'warning';
  return 'success';
}

function riskLabel(percent: number | null): string {
  if (percent === null) return 'No data';
  if (percent < 60) return 'Critical';
  if (percent < 75) return 'Watch';
  return 'Healthy';
}

function tallyForStudent(tally?: AttendanceStatusRangeTally): Omit<ReportRow, 'student' | 'counted' | 'percent'> {
  return {
    present: tally?.present ?? 0,
    absent: tally?.absent ?? 0,
    leave: tally?.leave ?? 0,
    notApplicable: tally?.notApplicable ?? 0,
  };
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
    ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function loadDemoRoster(sectionId: string): Promise<readonly LoadedRosterStudent[]> {
  return listDemoRoster(sectionId).map((student) => ({
    id: student.id,
    name: student.name,
    enrollmentNumber: student.enrollmentNumber,
    sectionId,
  }));
}

function createReportLocalHeatmap(loadStudentsForSection: (sectionId: string) => Promise<HeatmapStudent[]>): HeatmapPersistence {
  async function loadStudentAttendance(sectionId: string): Promise<StudentAttendance[]> {
    const students = await loadStudentsForSection(sectionId);
    return students.map((student) => {
      const totalHeldPeriods = 48;
      const attendance = demoNumber(`${sectionId}:${student.id}:report-heatmap-attendance`, 58, 98);
      return {
        studentId: student.id,
        attendedPeriods: Math.round((attendance / 100) * totalHeldPeriods),
        totalHeldPeriods,
      };
    });
  }

  return {
    loadStudentAttendance,
    async loadDefaulters(sectionId) {
      const attendance = await loadStudentAttendance(sectionId);
      return attendance
        .filter((student) => (student.attendedPeriods / student.totalHeldPeriods) * 100 < 75)
        .map((student) => student.studentId);
    },
    async loadDayHeatLevels(sectionId) {
      const levels: Record<string, number> = {};
      const today = new Date();
      for (let offset = -45; offset <= 0; offset += 1) {
        const date = new Date(today);
        date.setDate(today.getDate() + offset);
        const iso = date.toISOString().slice(0, 10);
        levels[iso] = Math.round(demoNumber(`${sectionId}:${iso}:report-heat`, 42, 96));
      }
      return levels;
    },
  };
}

export default function AttendanceReportPage() {
  const { selectedSection, subjects, selectedSubjectId, isLoading, isSubjectsLoading } = useSelectedSection();
  const [fromDate, setFromDate] = useState(() => offsetIso(-30));
  const [toDate, setToDate] = useState(() => todayIso());
  const [subjectId, setSubjectId] = useState<string>('all');
  const [percentFilter, setPercentFilter] = useState<PercentFilter>('all');
  const [customMin, setCustomMin] = useState('');
  const [customMax, setCustomMax] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('lowest');
  const [query, setQuery] = useState('');
  const [roster, setRoster] = useState<LoadedRosterStudent[]>([]);
  const [tallies, setTallies] = useState<AttendanceStatusRangeTally[]>([]);
  const [records, setRecords] = useState<Array<{ studentId: string; date: string; status: AttendanceStatus }>>([]);
  const [heldDates, setHeldDates] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [profileStudentId, setProfileStudentId] = useState<string | null>(null);

  const attendance = useMemo<AttendanceAccess>(
    () => (isLocalDemoMode() ? createLocalDemoAttendanceAccess(loadDemoRoster) : supabaseAttendance),
    [],
  );

  const heatmapStudentsLoader = useMemo(
    () => async (sectionId: string): Promise<HeatmapStudent[]> => {
      if (!selectedSection || selectedSection.id !== sectionId) {
        return [];
      }
      const loadedRoster = await loadRosterStudentsForSection(selectedSection);
      return loadedRoster.map((student) => ({
        id: student.id,
        name: student.name,
        enrollmentNumber: student.enrollmentNumber,
      }));
    },
    [selectedSection],
  );

  const heatmap = useMemo<HeatmapPersistence>(
    () => (isLocalDemoMode() ? createReportLocalHeatmap(heatmapStudentsLoader) : supabaseHeatmap),
    [heatmapStudentsLoader],
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
      setRecords([]);
      setHeldDates([]);
      return;
    }

    let active = true;
    setLoading(true);
    setLoadError(false);

    const subjectScope = subjectId === 'all' ? undefined : subjectId;
    void Promise.all([
      loadRosterStudentsForSection(selectedSection),
      attendance.loadStatusRangeReport({
        sectionId: selectedSection.id,
        subjectId: subjectScope,
        fromDate,
        toDate,
      }),
    ])
      .then(([loadedRoster, report]) => {
        if (!active) return;
        setRoster(loadedRoster);
        setTallies(report.tallies);
        setRecords(report.records);
        setHeldDates(report.heldDates);
      })
      .catch(() => {
        if (!active) return;
        setRoster([]);
        setTallies([]);
        setRecords([]);
        setHeldDates([]);
        setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attendance, fromDate, selectedSection, subjectId, toDate]);

  const rows = useMemo<ReportRow[]>(() => {
    const tallyById = new Map(tallies.map((tally) => [tally.studentId, tally]));
    return roster.map((student) => {
      const counts = tallyForStudent(tallyById.get(student.id));
      const percent = attendancePercent(counts.present, counts.absent);
      return {
        student,
        ...counts,
        counted: counts.present + counts.absent,
        percent,
      };
    });
  }, [roster, tallies]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const min = customMin.trim() === '' ? null : Number(customMin);
    const max = customMax.trim() === '' ? null : Number(customMax);

    const filtered = rows.filter((row) => {
      if (normalized) {
        const haystack = `${row.student.name} ${row.student.enrollmentNumber ?? ''}`.toLowerCase();
        if (!haystack.includes(normalized)) return false;
      }

      const percent = row.percent;
      if (percentFilter === 'below60') return percent !== null && percent < 60;
      if (percentFilter === 'below65') return percent !== null && percent < 65;
      if (percentFilter === 'below75') return percent !== null && percent < 75;
      if (percentFilter === 'above60') return percent !== null && percent >= 60;
      if (percentFilter === 'above65') return percent !== null && percent >= 65;
      if (percentFilter === 'above75') return percent !== null && percent >= 75;
      if (percentFilter === 'custom') {
        if (percent === null) return false;
        if (min !== null && !Number.isNaN(min) && percent < min) return false;
        if (max !== null && !Number.isNaN(max) && percent > max) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === 'name') return a.student.name.localeCompare(b.student.name);
      if (sortMode === 'absent') return b.absent - a.absent || a.student.name.localeCompare(b.student.name);
      const aPercent = a.percent ?? -1;
      const bPercent = b.percent ?? -1;
      if (sortMode === 'highest') return bPercent - aPercent || a.student.name.localeCompare(b.student.name);
      return aPercent - bPercent || a.student.name.localeCompare(b.student.name);
    });
  }, [customMax, customMin, percentFilter, query, rows, sortMode]);

  const summary = useMemo(() => {
    const countedRows = rows.filter((row) => row.percent !== null);
    const totalPresent = rows.reduce((sum, row) => sum + row.present, 0);
    const totalAbsent = rows.reduce((sum, row) => sum + row.absent, 0);
    return {
      heldClasses: heldDates.length,
      average: countedRows.length === 0 ? null : countedRows.reduce((sum, row) => sum + (row.percent ?? 0), 0) / countedRows.length,
      below60: rows.filter((row) => row.percent !== null && row.percent < 60).length,
      below65: rows.filter((row) => row.percent !== null && row.percent < 65).length,
      below75: rows.filter((row) => row.percent !== null && row.percent < 75).length,
      countedMarks: totalPresent + totalAbsent,
      leave: rows.reduce((sum, row) => sum + row.leave, 0),
      notApplicable: rows.reduce((sum, row) => sum + row.notApplicable, 0),
    };
  }, [heldDates.length, rows]);

  const recordsByStudent = useMemo(() => {
    const map = new Map<string, Array<{ date: string; status: AttendanceStatus }>>();
    for (const record of records) {
      const list = map.get(record.studentId) ?? [];
      list.push({ date: record.date, status: record.status });
      map.set(record.studentId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.date.localeCompare(b.date));
    }
    return map;
  }, [records]);

  const subjectName = subjectId === 'all'
    ? 'All subjects'
    : subjects.find((subject) => subject.id === subjectId)?.name ?? 'Selected subject';
  const busy = loading || isLoading || isSubjectsLoading;
  const profileRow = profileStudentId ? rows.find((row) => row.student.id === profileStudentId) ?? null : null;
  const profileRecords = profileStudentId ? recordsByStudent.get(profileStudentId) ?? [] : [];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 pb-16">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-muted">Attendance Intelligence</p>
            <h1 className="text-2xl font-semibold text-text">Attendance Report</h1>
            <p className="mt-1 text-sm text-muted">
              Leave aur N/A percentage ko down nahi karte. Formula: Present / (Present + Absent).
            </p>
          </div>
          <Button
            variant="outline"
            disabled={filteredRows.length === 0}
            onClick={() => exportCsv(filteredRows, `attendance-report-${fromDate}-to-${toDate}.csv`)}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {loadError && (
        <Alert tone="danger" title="Unable to load report">
          Attendance report load nahi ho paayi. Migration/status column aur network check karo.
        </Alert>
      )}

      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <SearchInput
            placeholder="Search student or roll..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            options={[
              { label: 'All subjects', value: 'all' },
              ...subjects.map((subject) => ({ label: subject.name, value: subject.id })),
            ]}
          />
          <DatePicker value={fromDate} max={toDate} onChange={(event) => setFromDate(event.target.value)} />
          <DatePicker value={toDate} min={fromDate} max={todayIso()} onChange={(event) => setToDate(event.target.value)} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            value={percentFilter}
            onChange={(event) => setPercentFilter(event.target.value as PercentFilter)}
            className="min-w-[11rem]"
            options={[
              { label: 'All percentages', value: 'all' },
              { label: 'Below 60%', value: 'below60' },
              { label: 'Below 65%', value: 'below65' },
              { label: 'Below 75%', value: 'below75' },
              { label: 'Above 60%', value: 'above60' },
              { label: 'Above 65%', value: 'above65' },
              { label: 'Above 75%', value: 'above75' },
              { label: 'Custom range', value: 'custom' },
            ]}
          />
          {percentFilter === 'custom' && (
            <>
              <input
                type="number"
                min="0"
                max="100"
                placeholder="Min %"
                value={customMin}
                onChange={(event) => setCustomMin(event.target.value)}
                className="h-10 w-24 rounded-control border border-border bg-surface px-3 text-sm text-text outline-none focus:border-accent"
              />
              <input
                type="number"
                min="0"
                max="100"
                placeholder="Max %"
                value={customMax}
                onChange={(event) => setCustomMax(event.target.value)}
                className="h-10 w-24 rounded-control border border-border bg-surface px-3 text-sm text-text outline-none focus:border-accent"
              />
            </>
          )}
          <Select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="min-w-[10rem]"
            options={[
              { label: 'Lowest first', value: 'lowest' },
              { label: 'Highest first', value: 'highest' },
              { label: 'Most absent', value: 'absent' },
              { label: 'Name A-Z', value: 'name' },
            ]}
          />
          <div className="ml-auto flex flex-wrap gap-2 text-xs font-semibold text-muted">
            <span className="rounded-full bg-secondary px-2 py-1">{selectedSection?.name ?? 'No section'}</span>
            <span className="rounded-full bg-secondary px-2 py-1">{subjectName}</span>
            <span className="rounded-full bg-secondary px-2 py-1">{formatDate(fromDate)} - {formatDate(toDate)}</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <ReportStat label="Classes held" value={summary.heldClasses} />
        <ReportStat label="Average" value={percentLabel(summary.average)} tone={summary.average !== null && summary.average < 75 ? 'warning' : 'success'} />
        <ReportStat label="Below 75%" value={summary.below75} tone={summary.below75 > 0 ? 'warning' : 'success'} />
        <ReportStat label="Below 65%" value={summary.below65} tone={summary.below65 > 0 ? 'danger' : 'success'} />
        <ReportStat label="Below 60%" value={summary.below60} tone={summary.below60 > 0 ? 'danger' : 'success'} />
        <ReportStat label="Leave / N/A" value={`${summary.leave} / ${summary.notApplicable}`} />
      </div>

      <Card padded={false} className="overflow-hidden border-emerald-200/70 bg-[linear-gradient(135deg,rgba(236,253,245,0.92),rgba(255,255,255,0.97)_42%,rgba(240,249,255,0.8))]">
        <div className="border-b border-emerald-100/80 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">Visual attendance pattern</p>
              <h2 className="text-base font-semibold text-text">Heatmap and defaulters</h2>
            </div>
            <Badge tone="success" size="sm">
              Inside report
            </Badge>
          </div>
        </div>
        <div className="p-3">
          <HeatmapView
            key={selectedSection?.id ?? 'none'}
            sections={selectedSection ? [selectedSection] : []}
            loadStudents={heatmapStudentsLoader}
            heatmap={heatmap}
            compact
          />
        </div>
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-text">Student-wise attendance</h2>
              <p className="text-xs text-muted">{filteredRows.length} of {rows.length} students visible. Counted marks: {summary.countedMarks}</p>
            </div>
            <Badge tone="info" size="sm">Leave excluded from percentage</Badge>
          </div>
        </div>

        {busy ? (
          <div className="space-y-3 p-4">
            <SkeletonLoader variant="block" className="h-12 w-full" />
            <SkeletonLoader variant="block" className="h-12 w-full" />
            <SkeletonLoader variant="block" className="h-12 w-full" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-muted">
            No students match this report filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="bg-surface-muted/70 text-[11px] uppercase text-muted">
                <tr>
                  <th className="px-4 py-3 font-bold">Student</th>
                  <th className="px-4 py-3 font-bold">Roll</th>
                  <th className="px-4 py-3 text-right font-bold">Present</th>
                  <th className="px-4 py-3 text-right font-bold">Absent</th>
                  <th className="px-4 py-3 text-right font-bold">Leave</th>
                  <th className="px-4 py-3 text-right font-bold">N/A</th>
                  <th className="px-4 py-3 text-right font-bold">Counted</th>
                  <th className="px-4 py-3 text-right font-bold">Attendance</th>
                  <th className="px-4 py-3 text-right font-bold">Risk</th>
                  <th className="px-4 py-3 text-right font-bold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.map((row) => {
                  return (
                    <Fragment key={row.student.id}>
                      <tr className="bg-surface hover:bg-surface-muted/45">
                        <td className="px-4 py-3 font-semibold text-text">{row.student.name}</td>
                        <td className="px-4 py-3 text-muted">{row.student.enrollmentNumber ?? '-'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">{row.present}</td>
                        <td className="px-4 py-3 text-right font-semibold text-red-700">{row.absent}</td>
                        <td className="px-4 py-3 text-right font-semibold text-amber-700">{row.leave}</td>
                        <td className="px-4 py-3 text-right font-semibold text-sky-700">{row.notApplicable}</td>
                        <td className="px-4 py-3 text-right text-text">{row.counted}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold text-text">{percentLabel(row.percent)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Badge tone={riskTone(row.percent)} size="sm">{riskLabel(row.percent)}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setProfileStudentId(row.student.id)}
                          >
                            Profile
                          </Button>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {profileRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setProfileStudentId(null)}
        >
          <div
            className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-card border border-border bg-surface shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase text-muted">Student attendance profile</p>
                  <h2 className="text-xl font-semibold text-text">{profileRow.student.name}</h2>
                  <p className="text-sm text-muted">{profileRow.student.enrollmentNumber ?? 'No roll number'} • {subjectName}</p>
                </div>
                <button
                  type="button"
                  className="rounded-button border border-border bg-background px-3 py-1.5 text-sm font-semibold text-muted hover:text-text"
                  onClick={() => setProfileStudentId(null)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <MiniStat label="Present" value={profileRow.present} tone="present" />
                <MiniStat label="Absent" value={profileRow.absent} tone="absent" />
                <MiniStat label="Leave" value={profileRow.leave} tone="leave" />
                <MiniStat label="N/A" value={profileRow.notApplicable} tone="na" />
                <MiniStat label="Counted" value={profileRow.counted} tone="neutral" />
                <MiniStat label="Attendance" value={percentLabel(profileRow.percent)} tone={profileRow.percent !== null && profileRow.percent < 75 ? 'absent' : 'present'} />
              </div>

              <div className="mt-4 rounded-control border border-border bg-surface-muted/50 p-3">
                <p className="text-xs font-semibold text-muted">
                  Percentage rule: Leave aur N/A count display hote hain, par denominator me sirf Present + Absent aata hai.
                </p>
              </div>

              <div className="mt-4">
                <h3 className="text-sm font-semibold text-text">Date-wise records</h3>
                {profileRecords.length === 0 ? (
                  <p className="mt-3 rounded-control border border-border bg-background px-3 py-4 text-sm text-muted">
                    No attendance record in this range.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {profileRecords.map((record) => (
                      <span
                        key={`${profileRow.student.id}-${record.date}-${record.status}`}
                        className={[
                          'rounded-full px-2 py-1 text-xs font-semibold',
                          record.status === 'present' ? 'bg-emerald-50 text-emerald-700' :
                          record.status === 'absent' ? 'bg-red-50 text-red-700' :
                          record.status === 'leave' ? 'bg-amber-50 text-amber-700' :
                          'bg-sky-50 text-sky-700',
                        ].join(' ')}
                      >
                        {formatDate(record.date)} - {statusLabel(record.status)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly tone: 'present' | 'absent' | 'leave' | 'na' | 'neutral';
}) {
  const toneClass = {
    present: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    absent: 'border-red-200 bg-red-50 text-red-800',
    leave: 'border-amber-200 bg-amber-50 text-amber-800',
    na: 'border-sky-200 bg-sky-50 text-sky-800',
    neutral: 'border-border bg-background text-text',
  }[tone];
  return (
    <div className={`rounded-control border px-3 py-2 ${toneClass}`}>
      <p className="text-[10px] font-bold uppercase opacity-70">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function ReportStat({
  label,
  value,
  tone = 'neutral',
}: {
  readonly label: string;
  readonly value: string | number;
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const toneClass = {
    neutral: 'border-border bg-surface text-text',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-900',
  }[tone];

  return (
    <Card className={`min-h-[5.5rem] px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-bold uppercase opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </Card>
  );
}
