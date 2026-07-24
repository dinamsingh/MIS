/**
 * Admin-only sidebar navigation model.
 *
 * Used by `AdminLayout` for pure admin identities (not teacher+admin combos).
 * Deliberately separate from `navigation.ts` which serves the teacher workspace.
 */
export interface AdminNavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  badge?: string;
}

export interface AdminNavGroup {
  id: string;
  label: string;
  items: AdminNavItem[];
}

export const adminNavGroups: AdminNavGroup[] = [
  {
    id: 'admin-overview',
    label: 'Overview',
    items: [
      { id: 'admin-dashboard', label: 'Admin Dashboard', icon: '▦', path: '/admin' },
    ],
  },
  {
    id: 'admin-management',
    label: 'Management',
    items: [
      { id: 'admin-teachers', label: 'Teacher Approval', icon: '👤', path: '/admin/teachers' },
      { id: 'admin-powers', label: 'Extra Powers', icon: '🔑', path: '/admin/powers' },
      { id: 'admin-admins', label: 'Manage Admins', icon: '🛡️', path: '/admin/admins' },
    ],
  },
  {
    id: 'admin-operations',
    label: 'Operations',
    items: [
      { id: 'admin-sessions', label: 'Session Creation', icon: '🗓️', path: '/admin/sessions', badge: 'NEW' },
      { id: 'admin-roster', label: 'Roster Import', icon: '📋', path: '/admin/roster', badge: 'NEW' },
      { id: 'admin-batches', label: 'Batch Promotion', icon: '🎓', path: '/admin/batches', badge: 'NEW' },
      { id: 'admin-syllabus-upload', label: 'Syllabus Upload', icon: '📄', path: '/admin/syllabus-upload', badge: 'NEW' },
    ],
  },
];
