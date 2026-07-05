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
      { id: 'attendance', label: 'Attendance', icon: '✓', path: '/attendance' },
      { id: 'syllabus', label: 'Syllabus', icon: '📖', path: '/syllabus' },
      { id: 'timetable', label: 'Timetable', icon: '🕛', path: '/timetable', badge: 'NEW' },
    ],
  },
  {
    id: 'assessments',
    label: 'Assessments',
    items: [
      { id: 'quizzes', label: 'Quizzes', icon: '❓', path: '/quizzes' },
      { id: 'assignments', label: 'Assignments', icon: '📝', path: '/assignments' },
      { id: 'marks', label: 'Internal Marks', icon: '🧮', path: '/marks' },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [
      { id: 'reports', label: 'Reports', icon: '📊', path: '/reports', badge: 'NEW' },
      { id: 'heatmap', label: 'Heatmap', icon: '🗓️', path: '/heatmap' },
      { id: 'leaderboard', label: 'Leaderboard', icon: '🏆', path: '/leaderboard' },
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
];
