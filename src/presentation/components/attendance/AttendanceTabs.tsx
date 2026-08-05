

export type AttendanceTab = 'today' | 'select-date' | 'report';

interface AttendanceTabsProps {
  activeTab: AttendanceTab;
  onTabChange: (tab: AttendanceTab) => void;
}

export function AttendanceTabs({ activeTab, onTabChange }: AttendanceTabsProps) {
  const tabs: { id: AttendanceTab; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'select-date', label: 'Select Date' },
    { id: 'report', label: 'Report Mode' },
  ];

  return (
    <div className="mb-6 flex border-b border-border">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`
              relative px-4 py-3 text-sm font-medium transition-colors
              ${isActive ? 'text-teal-700' : 'text-text-soft hover:text-text'}
            `}
          >
            {tab.label}
            {isActive && (
              <span className="absolute bottom-0 left-0 h-0.5 w-full bg-teal-700 rounded-t-sm" />
            )}
          </button>
        );
      })}
    </div>
  );
}
