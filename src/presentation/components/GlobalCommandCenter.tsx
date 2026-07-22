import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@presentation/auth';
import { useOptionalSelectedSection } from '@presentation/context/SelectedSectionContext';
import { formatSectionLabel } from '@presentation/format/sectionLabel';
import { navGroups } from '@presentation/navigation';
import { Badge, Dialog, SearchInput } from '@presentation/components/ui';
import { cx, focusRing, type ComponentTone } from '@presentation/components/ui/utils';
import {
  applyMotionDisabledPreference,
  MOTION_PREFERENCE_EVENT,
  readMotionDisabledPreference,
  writeMotionDisabledPreference,
} from '@presentation/motion';
import { useToast } from './ToastProvider';

interface GlobalCommandCenterProps {
  readonly activePath?: string;
  readonly open: boolean;
  readonly shortcutsOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onShortcutsOpenChange: (open: boolean) => void;
  readonly onNavigate?: (path: string) => void;
}

interface RecentPage {
  readonly path: string;
  readonly label: string;
  readonly group: string;
  readonly visitedAt: number;
}

interface SavedFilterSnapshot {
  readonly semester: string | null;
  readonly sectionId: string | null;
  readonly sectionLabel: string | null;
  readonly subjectId: string | null;
  readonly subjectLabel: string | null;
  readonly teacherLabel: string | null;
  readonly savedAt: number;
}

interface CommandItem {
  readonly id: string;
  readonly group: string;
  readonly label: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly shortcut?: string;
  readonly badge?: string;
  readonly tone?: ComponentTone;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
}

const RECENT_PAGES_KEY = 'mis_recent_pages_v1';
const SAVED_FILTERS_KEY = 'mis_saved_filters_v1';
const MAX_RECENT_PAGES = 6;

const shortcuts = [
  { keys: 'Ctrl + K', action: 'Open command palette and global search.' },
  { keys: 'Ctrl + /', action: 'Show keyboard shortcuts.' },
  { keys: 'Esc', action: 'Close open dialogs.' },
  { keys: 'Ctrl + K, Motion', action: 'Enable or disable workspace animations.' },
];

function flattenNavItems() {
  return navGroups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));
}

function readRecentPages(): RecentPage[] {
  try {
    const raw = localStorage.getItem(RECENT_PAGES_KEY);
    return raw ? (JSON.parse(raw) as RecentPage[]) : [];
  } catch {
    return [];
  }
}

function writeRecentPages(pages: readonly RecentPage[]): void {
  try {
    localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(pages));
  } catch {
    // Recent pages are a convenience only.
  }
}

function readSavedFilters(): SavedFilterSnapshot | null {
  try {
    const raw = localStorage.getItem(SAVED_FILTERS_KEY);
    return raw ? (JSON.parse(raw) as SavedFilterSnapshot) : null;
  } catch {
    return null;
  }
}

function writeSavedFilters(snapshot: SavedFilterSnapshot): void {
  try {
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(snapshot));
  } catch {
    // Filter persistence must never block navigation.
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function matchesCommand(item: CommandItem, query: string): boolean {
  if (!query) return true;
  const haystack = [item.group, item.label, item.description, ...item.keywords].join(' ').toLowerCase();
  return haystack.includes(query);
}

function teacherLabelFromActor(actor: ReturnType<typeof useAuth>['actor']): string | null {
  if (actor.kind !== 'teacher') return null;
  const name = actor.email.split('@')[0].replace(/[._-]/g, ' ').trim();
  return name ? name.replace(/\b\w/g, (char) => char.toUpperCase()) : actor.email;
}

export const GlobalCommandCenter = memo(function GlobalCommandCenter({
  activePath,
  open,
  shortcutsOpen,
  onOpenChange,
  onShortcutsOpenChange,
  onNavigate,
}: GlobalCommandCenterProps) {
  const [query, setQuery] = useState('');
  const [recentPages, setRecentPages] = useState<RecentPage[]>(() => readRecentPages());
  const [savedFilters, setSavedFilters] = useState<SavedFilterSnapshot | null>(() => readSavedFilters());
  const [motionDisabled, setMotionDisabled] = useState(() => readMotionDisabledPreference());
  const searchRef = useRef<HTMLInputElement | null>(null);
  const { notify } = useToast();
  const { actor } = useAuth();
  // `AdminShell` renders this component (via `AppLayout`) without a
  // `SelectedSectionProvider` — fall back to an empty/inert state instead of
  // throwing (bugfix: admin-only-sign-in-redirect; see AppLayout.tsx's same
  // fallback for the rationale).
  const selectedSectionCtx = useOptionalSelectedSection();
  const {
    sections,
    selectedSection,
    selectedSectionId,
    setSelectedSectionId,
    subjects,
    selectedSubject,
    selectedSubjectId,
    setSelectedSubjectId,
  } = selectedSectionCtx ?? {
    sections: [],
    selectedSection: null,
    selectedSectionId: null,
    setSelectedSectionId: () => {},
    subjects: [],
    selectedSubject: null,
    selectedSubjectId: null,
    setSelectedSubjectId: () => {},
  };
  const navItems = useMemo(() => flattenNavItems(), []);
  const teacherLabel = teacherLabelFromActor(actor);
  const closeCommandPalette = useCallback(() => {
    setQuery('');
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    applyMotionDisabledPreference(motionDisabled);
    writeMotionDisabledPreference(motionDisabled);
  }, [motionDisabled]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'k') {
        event.preventDefault();
        onOpenChange(true);
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '/') {
        event.preventDefault();
        onShortcutsOpenChange(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange, onShortcutsOpenChange]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!activePath) return;
    const activeItem = navItems.find((item) => item.path === activePath);
    if (!activeItem) return;

    setRecentPages((current) => {
      const next = [
        {
          path: activeItem.path,
          label: activeItem.label,
          group: activeItem.group,
          visitedAt: Date.now(),
        },
        ...current.filter((item) => item.path !== activeItem.path),
      ].slice(0, MAX_RECENT_PAGES);
      writeRecentPages(next);
      return next;
    });
  }, [activePath, navItems]);

  useEffect(() => {
    const snapshot: SavedFilterSnapshot = {
      semester: selectedSection?.semester ?? null,
      sectionId: selectedSectionId,
      sectionLabel: selectedSection ? formatSectionLabel(selectedSection) : null,
      subjectId: selectedSubjectId,
      subjectLabel: selectedSubject?.name ?? null,
      teacherLabel,
      savedAt: Date.now(),
    };
    writeSavedFilters(snapshot);
    setSavedFilters(snapshot);
  }, [selectedSection, selectedSectionId, selectedSubject, selectedSubjectId, teacherLabel]);

  const navigateTo = (path: string, title?: string) => {
    closeCommandPalette();
    window.setTimeout(() => onNavigate?.(path), 0);
    if (title) {
      notify({ tone: 'info', title: 'Opened', message: title, durationMs: 2200 });
    }
  };

  const commands = useMemo<CommandItem[]>(() => {
    const navigationCommands: CommandItem[] = navItems.map((item) => ({
      id: `nav:${item.path}`,
      group: 'Quick Navigation',
      label: item.label,
      description: `${item.group} page`,
      keywords: [item.id, item.path, item.group],
      badge: item.badge,
      onSelect: () => navigateTo(item.path, item.label),
    }));

    const subjectCommands: CommandItem[] = subjects.map((subject) => ({
      id: `subject:${subject.id}`,
      group: 'Subjects',
      label: subject.name,
      description: 'Switch global subject and open syllabus.',
      keywords: ['subject', 'syllabus', subject.name],
      onSelect: () => {
        setSelectedSubjectId(subject.id);
        navigateTo('/syllabus', subject.name);
      },
    }));

    const sectionCommands: CommandItem[] = sections.map((section) => ({
      id: `section:${section.id}`,
      group: 'Saved Filters',
      label: formatSectionLabel(section),
      description: 'Switch global section.',
      keywords: ['section', 'semester', section.name, section.batch ?? '', section.department ?? ''],
      onSelect: () => {
        setSelectedSectionId(section.id);
        notify({ tone: 'success', title: 'Section selected', message: formatSectionLabel(section) });
        closeCommandPalette();
      },
    }));

    const searchCommands: CommandItem[] = [
      {
        id: 'search:students',
        group: 'Global Search',
        label: 'Students',
        description: 'Open roster to search names, roll numbers, and enrollment.',
        keywords: ['students', 'roster', 'roll', 'enrollment'],
        onSelect: () => navigateTo('/roster', 'Student roster'),
      },
      {
        id: 'search:teachers',
        group: 'Global Search',
        label: 'Teachers',
        description: 'Open teacher reporting insights.',
        keywords: ['teachers', 'faculty', 'reports'],
        onSelect: () => navigateTo('/reports', 'Teacher reports'),
      },
      {
        id: 'search:materials',
        group: 'Global Search',
        label: 'Materials',
        description: 'Open study material search surface.',
        keywords: ['materials', 'resources', 'files'],
        onSelect: () => navigateTo('/material', 'Study material'),
      },
      {
        id: 'search:assignments',
        group: 'Global Search',
        label: 'Assignments',
        description: 'Open assignment tracker.',
        keywords: ['assignments', 'lab manual', 'submissions'],
        onSelect: () => navigateTo('/assignments', 'Assignments'),
      },
      {
        id: 'search:quiz',
        group: 'Global Search',
        label: 'Quiz',
        description: 'Open quiz creation and quiz records.',
        keywords: ['quiz', 'quizzes', 'questions'],
        onSelect: () => navigateTo('/quizzes', 'Quizzes'),
      },
    ];

    const quickActions: CommandItem[] = [
      {
        id: 'action:attendance',
        group: 'Quick Actions',
        label: 'Mark Attendance',
        description: 'Jump to today attendance workflow.',
        keywords: ['attendance', 'present', 'quick mark'],
        shortcut: 'A',
        tone: 'success',
        onSelect: () => navigateTo('/attendance', 'Attendance'),
      },
      {
        id: 'action:quiz',
        group: 'Quick Actions',
        label: 'Create Quiz',
        description: 'Start a unit-wise quiz.',
        keywords: ['quiz', 'assessment', 'questions'],
        onSelect: () => navigateTo('/quizzes', 'Quizzes'),
      },
      {
        id: 'action:material',
        group: 'Quick Actions',
        label: 'Upload Material',
        description: 'Open study material manager.',
        keywords: ['material', 'upload', 'file'],
        onSelect: () => navigateTo('/material', 'Study material'),
      },
      {
        id: 'action:reports',
        group: 'Quick Actions',
        label: 'View Reports',
        description: 'Open analytics and reports center.',
        keywords: ['reports', 'analytics', 'export'],
        onSelect: () => navigateTo('/reports', 'Reports'),
      },
      {
        id: 'action:settings',
        group: 'Quick Actions',
        label: 'Settings',
        description: 'Workspace preferences are not routed yet.',
        keywords: ['settings', 'preferences', 'profile'],
        onSelect: () => {
          notify({
            tone: 'warning',
            title: 'Settings not available',
            message: 'No settings route exists yet, so routing was left unchanged.',
          });
          closeCommandPalette();
        },
      },
      {
        id: 'action:motion',
        group: 'Quick Actions',
        label: motionDisabled ? 'Enable Motion' : 'Disable Motion',
        description: motionDisabled ? 'Restore workspace transitions and micro-interactions.' : 'Turn off non-essential animations for this browser.',
        keywords: ['motion', 'animations', 'accessibility', 'reduced motion'],
        onSelect: () => {
          setMotionDisabled((current) => {
            const next = !current;
            window.dispatchEvent(new CustomEvent(MOTION_PREFERENCE_EVENT, { detail: { disabled: next } }));
            notify({
              tone: 'info',
              title: next ? 'Motion disabled' : 'Motion enabled',
              message: next ? 'Workspace animations are now minimized.' : 'Workspace animations are back on.',
            });
            return next;
          });
          closeCommandPalette();
        },
      },
    ];

    const recentCommands: CommandItem[] = recentPages.map((page) => ({
      id: `recent:${page.path}`,
      group: 'Recently Opened',
      label: page.label,
      description: page.group,
      keywords: ['recent', page.path, page.group, page.label],
      onSelect: () => navigateTo(page.path, page.label),
    }));

    const restoreFilters: CommandItem[] = savedFilters
      ? [
          {
            id: 'filters:restore',
            group: 'Saved Filters',
            label: 'Restore last saved filters',
            description: [
              savedFilters.semester ? `Semester ${savedFilters.semester}` : null,
              savedFilters.sectionLabel,
              savedFilters.subjectLabel,
              savedFilters.teacherLabel,
            ].filter(Boolean).join(' / ') || 'No saved filter details yet.',
            keywords: ['saved filters', 'semester', 'section', 'subject', 'teacher'],
            onSelect: () => {
              if (savedFilters.sectionId) {
                setSelectedSectionId(savedFilters.sectionId);
              }
              if (savedFilters.subjectId && savedFilters.sectionId === selectedSectionId) {
                setSelectedSubjectId(savedFilters.subjectId);
              }
              notify({ tone: 'success', title: 'Filters restored', message: 'Last section and subject preferences were applied.' });
              closeCommandPalette();
            },
          },
        ]
      : [];

    return [
      ...quickActions,
      ...searchCommands,
      ...subjectCommands,
      ...navigationCommands,
      ...recentCommands,
      ...restoreFilters,
      ...sectionCommands,
    ];
  }, [
    navItems,
    notify,
    motionDisabled,
    closeCommandPalette,
    onNavigate,
    recentPages,
    savedFilters,
    sections,
    selectedSectionId,
    setSelectedSectionId,
    setSelectedSubjectId,
    subjects,
  ]);

  const normalizedQuery = normalize(query);
  const filteredCommands = useMemo(
    () => commands.filter((item) => matchesCommand(item, normalizedQuery)),
    [commands, normalizedQuery],
  );
  const groupedCommands = useMemo(() => groupCommands(filteredCommands), [filteredCommands]);

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : closeCommandPalette())} title="Command Palette" description="Search pages, records, and quick actions.">
        <div className="space-y-4">
          <SearchInput
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search students, teachers, subjects, attendance, reports..."
            aria-label="Global search"
          />

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <kbd className="rounded-sm border border-border bg-secondary px-1.5 py-0.5">Ctrl K</kbd>
            <span>Search</span>
            <kbd className="rounded-sm border border-border bg-secondary px-1.5 py-0.5">Ctrl /</kbd>
            <span>Shortcuts</span>
          </div>

          <div className="max-h-[52vh] overflow-auto rounded-card border border-border bg-surface">
            {groupedCommands.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm font-semibold text-text">No matching command found.</p>
                <p className="mt-1 text-xs leading-5 text-muted">Try searching students, attendance, reports, or a subject name.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {groupedCommands.map((group) => (
                  <section key={group.label} className="p-2">
                    <p className="px-2 py-1.5 text-[11px] font-semibold text-muted">{group.label}</p>
                    <div className="space-y-1">
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={item.onSelect}
                          className={cx(
                            'flex w-full items-center justify-between gap-3 rounded-button px-3 py-2.5 text-left transition-colors duration-fast hover:bg-secondary',
                            focusRing,
                          )}
                        >
                          <span className="min-w-0">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-sm font-semibold text-text">{item.label}</span>
                              {item.badge && <Badge size="sm" tone={item.tone ?? 'neutral'}>{item.badge}</Badge>}
                            </span>
                            <span className="block truncate text-xs leading-5 text-muted">{item.description}</span>
                          </span>
                          {item.shortcut && <kbd className="shrink-0 rounded-sm border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted">{item.shortcut}</kbd>}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </Dialog>

      <Dialog open={shortcutsOpen} onOpenChange={onShortcutsOpenChange} title="Keyboard Shortcuts" description="Fast controls available across the MIS.">
        <div className="space-y-2">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.keys} className="flex items-center justify-between gap-4 rounded-control border border-border bg-surface-muted/60 px-3 py-2">
              <p className="text-sm font-medium text-text">{shortcut.action}</p>
              <kbd className="shrink-0 rounded-sm border border-border bg-surface px-2 py-1 text-xs font-semibold text-soft">{shortcut.keys}</kbd>
            </div>
          ))}
        </div>
      </Dialog>
    </>
  );
});

function groupCommands(items: readonly CommandItem[]): Array<{ label: string; items: CommandItem[] }> {
  const order = ['Quick Actions', 'Global Search', 'Subjects', 'Quick Navigation', 'Recently Opened', 'Saved Filters'];
  const groups = new Map<string, CommandItem[]>();
  for (const item of items) {
    const group = groups.get(item.group) ?? [];
    group.push(item);
    groups.set(item.group, group);
  }
  return Array.from(groups.entries())
    .sort(([left], [right]) => order.indexOf(left) - order.indexOf(right))
    .map(([label, groupItems]) => ({ label, items: groupItems.slice(0, 8) }));
}
