import { memo, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TimetableEntry } from '@domain/services/timetableService';
import type { StudentMetrics } from '@domain/services/leaderboardService';

type Tone = 'neutral' | 'green' | 'amber' | 'red' | 'blue';

const toneClasses: Record<Tone, { bg: string; text: string; ring: string; soft: string }> = {
  neutral: {
    bg: 'bg-accent',
    text: 'text-accent',
    ring: 'ring-accent/15',
    soft: 'bg-accent-tint',
  },
  green: {
    bg: 'bg-status-green',
    text: 'text-status-green',
    ring: 'ring-status-green/15',
    soft: 'bg-status-green/10',
  },
  amber: {
    bg: 'bg-status-amber',
    text: 'text-status-amber',
    ring: 'ring-status-amber/15',
    soft: 'bg-status-amber/10',
  },
  red: {
    bg: 'bg-status-red',
    text: 'text-status-red',
    ring: 'ring-status-red/15',
    soft: 'bg-status-red/10',
  },
  blue: {
    bg: 'bg-status-blue',
    text: 'text-status-blue',
    ring: 'ring-status-blue/15',
    soft: 'bg-status-blue/10',
  },
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const handleChange = () => setReduced(query.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return reduced;
}

function useCountUp(value: number, durationMs = 220): number {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (prefersReducedMotion || !Number.isFinite(value)) {
      setDisplay(value);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const from = display;
    const diff = value - from;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + diff * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // The current display value is intentionally captured as the animation start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs, prefersReducedMotion, value]);

  return display;
}

export interface DashboardStatCardProps {
  readonly icon: string;
  readonly label: string;
  readonly value: number;
  readonly suffix?: string;
  readonly precision?: number;
  readonly trend?: string;
  readonly trendDirection?: 'up' | 'down' | 'flat';
  readonly tone?: Tone;
  readonly description?: string;
  readonly onClick?: () => void;
}

export const DashboardStatCard = memo(function DashboardStatCard({
  icon,
  label,
  value,
  suffix = '',
  precision = 0,
  trend,
  trendDirection = 'flat',
  tone = 'neutral',
  description,
  onClick,
}: DashboardStatCardProps) {
  const counted = useCountUp(value);
  const toneClass = toneClasses[tone];
  const formatted = counted.toLocaleString('en-IN', {
    maximumFractionDigits: precision,
    minimumFractionDigits: precision,
  });
  const Wrapper = onClick ? 'button' : 'article';
  const trendClass =
    trendDirection === 'up'
      ? 'text-status-green'
      : trendDirection === 'down'
        ? 'text-status-red'
        : 'text-muted';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={[
        'card group relative min-h-[7.5rem] overflow-hidden p-3 text-left transition-all duration-fast ease-standard sm:p-3.5',
        'hover:-translate-y-0.5 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:hover:translate-y-0',
        onClick ? 'w-full cursor-pointer' : '',
      ].join(' ')}
      aria-label={onClick ? `${label}: ${formatted}${suffix}` : undefined}
    >
      <div className={`absolute right-3 top-3 h-14 w-14 rounded-full ${toneClass.soft} opacity-60 blur-xl`} />
      <div className="relative flex h-full flex-col justify-between gap-3">
        <div className="flex items-start justify-between gap-2">
          <span className={`flex h-8 w-8 items-center justify-center rounded-button text-sm ${toneClass.soft} ${toneClass.text} ring-1 ${toneClass.ring}`}>
            {icon}
          </span>
          {trend && (
            <span className={`rounded-sm bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold leading-4 ${trendClass}`}>
              {trendDirection === 'up' ? '+' : trendDirection === 'down' ? '-' : ''}
              {trend}
            </span>
          )}
        </div>
        <div>
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold leading-none text-text">
            {formatted}
            <span className="text-sm text-soft">{suffix}</span>
          </p>
          {description && <p className="mt-1 truncate text-[11px] leading-4 text-muted">{description}</p>}
        </div>
      </div>
    </Wrapper>
  );
});

export interface EmptyStateProps {
  readonly title: string;
  readonly message: string;
  readonly actionLabel?: string;
}

export const DashboardEmptyState = memo(function DashboardEmptyState({
  title,
  message,
  actionLabel,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface-muted/60 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-tint text-accent">
        <span aria-hidden="true">--</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-text">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-muted">{message}</p>
      {actionLabel && (
        <button type="button" className="btn-secondary mt-4 min-h-0 px-3 py-1.5 text-xs">
          {actionLabel}
        </button>
      )}
    </div>
  );
});

export interface QuickAction {
  readonly label: string;
  readonly description: string;
  readonly href: string;
  readonly icon: string;
  readonly tone: Tone;
}

export const QuickActions = memo(function QuickActions({ actions }: { readonly actions: readonly QuickAction[] }) {
  const navigate = useNavigate();
  return (
    <section className="card p-5" aria-labelledby="quick-actions-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="quick-actions-title" className="text-card-title">Quick Actions</h2>
          <p className="mt-1 text-xs text-muted">Jump into the work teachers do most often.</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {actions.map((action, index) => {
          const toneClass = toneClasses[action.tone];
          return (
            <button
              key={action.href}
              type="button"
              onClick={() => navigate(action.href)}
              className="group w-full rounded-card border border-border bg-background p-3 text-left transition-all duration-fast ease-standard hover:-translate-y-0.5 hover:border-ring hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0"
              style={{ animationDelay: `${index * 35}ms` }}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-button ${toneClass.soft} ${toneClass.text}`}>
                {action.icon}
              </span>
              <p className="mt-3 text-sm font-semibold text-text">{action.label}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{action.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
});

export interface ScheduleItem {
  readonly id: string;
  readonly subject: string;
  readonly time: string;
  readonly room: string;
  readonly status: 'done' | 'next' | 'upcoming';
}

export const TodaySchedule = memo(function TodaySchedule({ classes }: { readonly classes: readonly ScheduleItem[] }) {
  return (
    <section className="card p-5" aria-labelledby="schedule-title">
      <div className="flex items-center justify-between">
        <div>
          <h2 id="schedule-title" className="text-card-title">Today's Schedule</h2>
          <p className="mt-1 text-xs text-muted">Timeline for the selected section.</p>
        </div>
        <span className="badge-neutral">{classes.length} classes</span>
      </div>
      {classes.length === 0 ? (
        <DashboardEmptyState
          title="No classes today"
          message="There are no timetable entries scheduled for today."
          actionLabel="Open timetable"
        />
      ) : (
        <ol className="mt-5 space-y-4">
          {classes.map((item) => {
            const active = item.status === 'next';
            return (
              <li key={item.id} className="relative flex gap-3">
                <span className="mt-1 flex flex-col items-center">
                  <span
                    className={[
                      'h-3 w-3 rounded-full ring-4',
                      active ? 'bg-accent ring-accent/15 animate-pulse' : item.status === 'done' ? 'bg-status-green ring-status-green/15' : 'bg-border ring-border/50',
                    ].join(' ')}
                  />
                  <span className="mt-2 h-full min-h-10 w-px bg-border" />
                </span>
                <div className={['flex-1 rounded-card border p-3', active ? 'border-accent/20 bg-accent-tint' : 'border-border bg-background'].join(' ')}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text">{item.subject}</p>
                      <p className="mt-1 text-xs text-muted">{item.time} / {item.room}</p>
                    </div>
                    <span className={active ? 'badge-neutral bg-accent text-surface' : item.status === 'done' ? 'badge-success' : 'badge-neutral'}>
                      {item.status === 'next' ? 'current' : item.status}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
});

export interface ActivityItem {
  readonly id: string;
  readonly actor: string;
  readonly action: string;
  readonly timestamp: string;
  readonly tone: Tone;
}

export const RecentActivity = memo(function RecentActivity({ items }: { readonly items: readonly ActivityItem[] }) {
  return (
    <section className="card p-5" aria-labelledby="activity-title">
      <div>
        <h2 id="activity-title" className="text-card-title">Recent Activity</h2>
        <p className="mt-1 text-xs text-muted">Auto-generated from current class signals.</p>
      </div>
      {items.length === 0 ? (
        <DashboardEmptyState
          title="No activity yet"
          message="Activity appears here after attendance, marks, quizzes, or material updates."
        />
      ) : (
        <ul className="mt-5 space-y-3">
          {items.map((item, index) => {
            const toneClass = toneClasses[item.tone];
            return (
              <li
                key={item.id}
                className="flex gap-3 rounded-card border border-border bg-background p-3 animate-foundation-slide-up"
                style={{ animationDelay: `${index * 35}ms` }}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${toneClass.soft} ${toneClass.text} text-xs font-semibold`}>
                  {item.actor.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text">{item.actor}</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted">{item.action}</p>
                </div>
                <span className="shrink-0 text-[11px] text-muted">{item.timestamp}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
});

export interface PendingTask {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly count: number;
  readonly tone: Tone;
  /** Optional route to navigate to when the task card is clicked. */
  readonly href?: string;
}

export const PendingTasks = memo(function PendingTasks({ tasks }: { readonly tasks: readonly PendingTask[] }) {
  const navigate = useNavigate();
  const activeTasks = tasks.filter((task) => task.count > 0);
  return (
    <section className="card p-5" aria-labelledby="pending-title">
      <div>
        <h2 id="pending-title" className="text-card-title">Pending Tasks</h2>
        <p className="mt-1 text-xs text-muted">Work that needs attention before the next class.</p>
      </div>
      {activeTasks.length === 0 ? (
        <DashboardEmptyState title="All caught up" message="There are no urgent dashboard tasks right now." />
      ) : (
        <div className="mt-5 space-y-3">
          {activeTasks.map((task) => {
            const toneClass = toneClasses[task.tone];
            const isClickable = Boolean(task.href);
            return (
              <div
                key={task.id}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={isClickable ? () => navigate(task.href!) : undefined}
                onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') navigate(task.href!); } : undefined}
                className={[
                  'flex items-center gap-3 rounded-card border border-border bg-background p-3',
                  isClickable ? 'cursor-pointer transition-all duration-fast ease-standard hover:-translate-y-0.5 hover:border-ring hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0' : '',
                ].join(' ')}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-button ${toneClass.soft} ${toneClass.text} text-sm font-bold`}>
                  {task.count}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">{task.label}</p>
                  <p className="text-xs text-muted">{task.detail}</p>
                </div>
                {isClickable && (
                  <span className="shrink-0 text-xs text-muted" aria-hidden="true">→</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
});

export const CalendarWidget = memo(function CalendarWidget({
  eventDays,
}: {
  readonly eventDays: readonly number[];
}) {
  const now = new Date();
  const today = now.getDate();
  const monthName = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const leading = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const cells = useMemo(() => {
    const blanks = Array.from({ length: leading }, () => null);
    const dates = Array.from({ length: daysInMonth }, (_, index) => index + 1);
    return [...blanks, ...dates];
  }, [daysInMonth, leading]);

  return (
    <section className="card p-5" aria-labelledby="calendar-title">
      <div className="flex items-center justify-between">
        <div>
          <h2 id="calendar-title" className="text-card-title">Calendar</h2>
          <p className="mt-1 text-xs text-muted">{monthName}</p>
        </div>
        <span className="badge-info">{eventDays.length} events</span>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          const isToday = day === today;
          const hasEvent = day !== null && eventDays.includes(day);
          return (
            <span
              key={`${day ?? 'blank'}-${index}`}
              className={[
                'relative flex aspect-square items-center justify-center rounded-button text-xs',
                day === null ? 'text-transparent' : isToday ? 'bg-accent text-surface' : 'bg-background text-soft',
              ].join(' ')}
              aria-current={isToday ? 'date' : undefined}
            >
              {day ?? 0}
              {hasEvent && !isToday && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-status-blue" />}
            </span>
          );
        })}
      </div>
    </section>
  );
});

export interface StudentDirectoryModalProps {
  readonly students: readonly StudentMetrics[];
  readonly filteredStudents: readonly StudentMetrics[];
  readonly searchQuery: string;
  readonly selectedSectionFilter: string;
  readonly sectionOptions: readonly string[];
  readonly onSearchChange: (value: string) => void;
  readonly onSectionChange: (value: string) => void;
  readonly onClose: () => void;
}

export const StudentDirectoryModal = memo(function StudentDirectoryModal({
  students,
  filteredStudents,
  searchQuery,
  selectedSectionFilter,
  sectionOptions,
  onSearchChange,
  onSectionChange,
  onClose,
}: StudentDirectoryModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="student-directory-title">
      <div className="flex max-h-[86vh] w-full max-w-5xl animate-foundation-scale-in flex-col overflow-hidden rounded-dialog border border-border bg-surface shadow-overlay">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="student-directory-title" className="text-lg font-semibold text-text">Student Directory</h2>
            <p className="mt-1 text-xs text-muted">Detailed class performance list for the selected context.</p>
          </div>
          <button type="button" onClick={onClose} className="icon-btn h-9 w-9" aria-label="Close student directory">
            x
          </button>
        </div>

        <div className="grid gap-3 border-b border-border bg-surface-muted/50 p-4 sm:grid-cols-[1fr_12rem]">
          <label className="field-group">
            <span className="sr-only">Search students</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search by name or enrollment number"
              className="input"
            />
          </label>
          <label className="field-group">
            <span className="sr-only">Filter by section</span>
            <select value={selectedSectionFilter} onChange={(event) => onSectionChange(event.target.value)} className="select">
              <option value="All">All Sections</option>
              {sectionOptions.map((section) => (
                <option key={section} value={section}>{section}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="sticky top-0 bg-surface text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Enrollment</th>
                <th className="px-4 py-3">Section</th>
                <th className="px-4 py-3 text-right">Attendance</th>
                <th className="px-4 py-3 text-right">Quiz</th>
                <th className="px-4 py-3 text-right">Marks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                    No students found matching the current filters.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr key={student.studentId} className="transition-colors duration-fast hover:bg-surface-muted/70">
                    <td className="px-4 py-3 font-semibold text-text">{student.name}</td>
                    <td className="px-4 py-3 text-xs text-muted">{student.enrollmentNumber || 'N/A'}</td>
                    <td className="px-4 py-3">
                      <span className="badge-neutral">{student.sectionName || 'N/A'}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-text">{student.attendancePercent.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right font-semibold text-text">{student.quizScore.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-text">{student.internalMarks.toFixed(1)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4 text-xs text-muted">
          <span>Showing {filteredStudents.length} of {students.length} students</span>
          <button type="button" onClick={onClose} className="btn-secondary min-h-0 px-4 py-1.5 text-xs">Close</button>
        </div>
      </div>
    </div>
  );
});

export function deriveActivities(students: readonly StudentMetrics[], pendingCount: number): ActivityItem[] {
  const lowAttendance = students.find((student) => student.attendancePercent > 0 && student.attendancePercent < 75);
  const topQuiz = [...students].sort((a, b) => b.quizScore - a.quizScore)[0];
  const topMarks = [...students].sort((a, b) => b.internalMarks - a.internalMarks)[0];

  return [
    ...(lowAttendance
      ? [{
          id: 'attendance-risk',
          actor: lowAttendance.name,
          action: `Attendance needs review at ${lowAttendance.attendancePercent.toFixed(1)}%.`,
          timestamp: 'Today',
          tone: 'red' as Tone,
        }]
      : []),
    ...(topQuiz
      ? [{
          id: 'quiz-signal',
          actor: topQuiz.name,
          action: `Highest quiz signal at ${topQuiz.quizScore.toFixed(1)}.`,
          timestamp: 'Recent',
          tone: 'blue' as Tone,
        }]
      : []),
    ...(topMarks
      ? [{
          id: 'marks-signal',
          actor: topMarks.name,
          action: `Internal marks are currently ${topMarks.internalMarks.toFixed(1)}.`,
          timestamp: 'Recent',
          tone: 'green' as Tone,
        }]
      : []),
    ...(pendingCount > 0
      ? [{
          id: 'pending-signal',
          actor: 'Class monitor',
          action: `${pendingCount} student${pendingCount === 1 ? '' : 's'} need follow-up this week.`,
          timestamp: 'Now',
          tone: 'amber' as Tone,
        }]
      : []),
  ].slice(0, 4);
}

export function scheduleFromEntries(
  entries: readonly TimetableEntry[],
  subjectNames: Record<string, string>,
  sectionNames: Record<string, string>,
  getStatus: (entry: TimetableEntry, index: number) => ScheduleItem['status'],
): ScheduleItem[] {
  return entries.map((entry, index) => ({
    id: entry.id,
    subject: subjectNames[entry.subjectId] ?? entry.subjectId,
    time: entry.timeSlot,
    room: sectionNames[entry.sectionId] ?? entry.sectionId,
    status: getStatus(entry, index),
  }));
}
