/**
 * Sidebar navigation model — matches the mockup structure.
 *
 * Groups: Overview, Academics, Assessments, Insights, Resources & Connect
 * AI modules are tagged with `ai: true` and `locked` when FEATURE_AI is off.
 * Items with `badge` show a small label (NEW, AI, etc.)
 */
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  locked?: boolean;
  ai?: boolean;
  badge?: string;
  children?: NavItem[];
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: '▦', path: '/dashboard' },
    ],
  },
  {
    id: 'academics',
    label: 'Academics',
    items: [
      {
        id: 'attendance',
        label: 'Attendance',
        icon: '✓',
        path: '/attendance',
        children: [
          { id: 'take-attendance', label: 'Take Attendance', icon: 'TA', path: '/attendance' },
          { id: 'attendance-report', label: 'Attendance Report', icon: 'AR', path: '/attendance/report', badge: 'NEW' },
        ],
      },
      { id: 'syllabus', label: 'Syllabus', icon: '📖', path: '/syllabus' },
      { id: 'timetable', label: 'Timetable', icon: '🕛', path: '/timetable', badge: 'NEW' },
      { id: 'my-schedule', label: 'My Schedule', icon: '📅', path: '/my-schedule', badge: 'NEW' },
    ],
  },
  {
    id: 'assessments',
    label: 'Assessments',
    items: [
      { id: 'quizzes', label: 'Quizzes', icon: '❓', path: '/quizzes' },
      {
        id: 'assignments',
        label: 'Assignments',
        icon: 'AS',
        path: '/assignments',
        children: [
          { id: 'track-assignments', label: 'Track Assignments', icon: 'TR', path: '/assignments' },
          { id: 'share-assignment', label: 'Share Assignment', icon: 'SH', path: '/assignments/share', badge: 'NEW' },
        ],
      },
      { id: 'marks', label: 'Internal Marks', icon: '🧮', path: '/marks' },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [
      { id: 'reports', label: 'Reports', icon: '📊', path: '/reports', badge: 'NEW' },
      { id: 'leaderboard', label: 'Leaderboard', icon: '🏆', path: '/leaderboard' },
      { id: 'teaching-history', label: 'Teaching History', icon: '🗂️', path: '/teaching-history', badge: 'NEW' },
    ],
  },
  {
    id: 'resources',
    label: 'Resources & Connect',
    items: [
      { id: 'material', label: 'Study Material', icon: '📁', path: '/material' },
    ],
  },
  {
    id: 'roster-management',
    label: 'Roster',
    items: [
      { id: 'roster', label: 'Roster', icon: '👥', path: '/roster', badge: 'NEW' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    items: [
      { id: 'admin-teachers', label: 'Teacher Approval', icon: '👤', path: '/admin/teachers' },
      { id: 'admin-powers', label: 'Extra Powers', icon: '🔑', path: '/admin/powers' },
      { id: 'admin-admins', label: 'Manage Admins', icon: '🛡️', path: '/admin/admins' },
      { id: 'admin-sessions', label: 'Session Creation', icon: '🗓️', path: '/admin/sessions', badge: 'NEW' },
      { id: 'admin-roster', label: 'Roster Import', icon: '📋', path: '/admin/roster', badge: 'NEW' },
    ],
  },
];
