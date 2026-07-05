import { useState } from 'react';
import { Breadcrumb, Tabs } from '@presentation/components/ui/navigation';
import { Drawer } from '@presentation/components/ui/overlays';
import { Button, IconButton } from '@presentation/components/ui/foundation';
import { Select, DatePicker } from '@presentation/components/ui/forms';
import { ChartCard } from '@presentation/components/ui/charts';

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

  const handlePreview = (reportTitle: string) => {
    setSelectedReport(reportTitle);
    setDrawerOpen(true);
  };

  return (
    <section className="flex flex-col gap-5">
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
          <Button variant="secondary" onClick={() => {}} className="hidden sm:inline-flex">
            Refresh Data
          </Button>
          <Button variant="primary" onClick={() => handlePreview('Full Report Summary')}>
            Preview Report
          </Button>
          <div className="hidden items-center gap-2 border-l border-border pl-2 sm:flex">
            <IconButton icon="download" label="Export PDF" />
            <IconButton icon="file-text" label="Export CSV" />
            <IconButton icon="printer" label="Print" />
          </div>
        </div>
      </header>

      <div className="card p-2 sm:px-4 sm:py-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            items={REPORT_TABS}
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full lg:w-auto"
          />
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4 lg:border-t-0 lg:pt-0">
            <DatePicker aria-label="Start Date" className="h-9 w-36 text-xs" />
            <span className="text-muted text-xs">to</span>
            <DatePicker aria-label="End Date" className="h-9 w-36 text-xs" />
            <Select
              aria-label="Semester"
              options={[{ value: 'sem1', label: 'Semester 1' }, { value: 'sem2', label: 'Semester 2' }]}
              className="h-9 w-32 text-xs"
            />
            <Select
              aria-label="Section"
              options={[{ value: 'all', label: 'All Sections' }, { value: 'a', label: 'Section A' }]}
              className="h-9 w-32 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {activeTab === 'attendance' && (
          <>
            <ChartCard title="Daily Attendance Trend" description="Overall percentage for the last 30 days." action={<Button variant="ghost" size="sm" onClick={() => handlePreview('Daily Attendance')}>View</Button>}>
              <div className="flex h-56 items-end gap-2 border-b border-border pb-2 pt-8" aria-label="Mock Bar Chart">
                {[75, 80, 85, 90, 82, 88, 95].map((val, i) => (
                  <div key={i} className="flex-1 rounded-t-sm bg-accent transition-all hover:bg-accent-tint" style={{ height: `${val}%` }} title={`${val}%`} />
                ))}
              </div>
            </ChartCard>
            <ChartCard title="Section-wise Comparison" description="Attendance distribution across sections." action={<Button variant="ghost" size="sm" onClick={() => handlePreview('Section Comparison')}>View</Button>}>
              <div className="flex h-56 items-center justify-center">
                <div className="relative h-40 w-40 rounded-full border-[16px] border-accent" />
                <div className="absolute h-40 w-40 rounded-full border-[16px] border-status-amber border-t-transparent border-r-transparent rotate-45" />
              </div>
            </ChartCard>
            <ChartCard title="Monthly Averages" description="Yearly trend up to current month." action={<Button variant="ghost" size="sm" onClick={() => handlePreview('Monthly Averages')}>View</Button>}>
              <div className="flex h-56 items-end gap-3 border-b border-l border-border px-2 pb-2 pt-8">
                 <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <polyline points="0,80 20,60 40,70 60,30 80,40 100,10" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent" />
                 </svg>
              </div>
            </ChartCard>
          </>
        )}

        {activeTab === 'students' && (
          <>
            <ChartCard title="Low Attendance Risk" description="Students below 75% threshold.">
              <div className="flex h-56 flex-col justify-center gap-4">
                 {[45, 55, 65, 70].map((val, i) => (
                   <div key={i} className="flex items-center gap-3 text-xs">
                     <span className="w-16 truncate">Student {i + 1}</span>
                     <div className="h-2 flex-1 rounded-full bg-surface-muted overflow-hidden">
                       <div className="h-full bg-status-red" style={{ width: `${val}%` }} />
                     </div>
                     <span className="w-8 font-semibold">{val}%</span>
                   </div>
                 ))}
              </div>
            </ChartCard>
            <ChartCard title="Performance Trend" description="Overall class score progression.">
              <div className="flex h-56 items-end gap-2 border-b border-l border-border px-2 pb-2 pt-8">
                 <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <polyline points="0,90 20,70 40,80 60,40 80,20 100,25" fill="none" stroke="currentColor" strokeWidth="2" className="text-status-green" />
                 </svg>
              </div>
            </ChartCard>
            <ChartCard title="Assignment Completion" description="Submission rate over time.">
              <div className="flex h-56 items-end gap-2 border-b border-border pb-2 pt-8">
                {[60, 75, 80, 95, 90, 85, 100].map((val, i) => (
                  <div key={i} className="flex-1 rounded-t-sm bg-blue-500/80 transition-all hover:bg-blue-500" style={{ height: `${val}%` }} />
                ))}
              </div>
            </ChartCard>
          </>
        )}

        {activeTab === 'teachers' && (
           <div className="col-span-full">
             <ChartCard title="Teacher Workload & Activity" description="Materials uploaded and attendance submissions.">
                <div className="h-64 p-4 text-center text-sm text-soft flex items-center justify-center">
                  Mock teacher workload chart. (API endpoint not available).
                </div>
             </ChartCard>
           </div>
        )}

        {activeTab === 'subjects' && (
           <div className="col-span-full">
             <ChartCard title="Subject Performance Overview" description="Aggregate scores by subject.">
                <div className="h-64 p-4 text-center text-sm text-soft flex items-center justify-center">
                  Mock subject performance chart. (API endpoint not available).
                </div>
             </ChartCard>
           </div>
        )}

        {activeTab === 'content' && (
           <div className="col-span-full">
             <ChartCard title="Academic Content Usage" description="Study materials downloaded by students.">
                <div className="h-64 p-4 text-center text-sm text-soft flex items-center justify-center">
                  Mock content analytics chart. (API endpoint not available).
                </div>
             </ChartCard>
           </div>
        )}

        {activeTab === 'quizzes' && (
           <div className="col-span-full">
             <ChartCard title="Quiz Success Rate" description="Average score across all published quizzes.">
                <div className="h-64 p-4 text-center text-sm text-soft flex items-center justify-center">
                  Mock quiz analytics chart. (API endpoint not available).
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
              Currently viewing mock data as the underlying real-time analytics API is not connected.
            </p>
          </div>
          <div className="rounded-card bg-surface-muted p-4">
             <div className="flex items-center justify-between border-b border-border pb-2 text-xs">
                <span className="font-medium">Total Records</span>
                <span className="text-muted">1,245</span>
             </div>
             <div className="flex items-center justify-between border-b border-border py-2 text-xs">
                <span className="font-medium">Trend</span>
                <span className="text-status-green">+12.5%</span>
             </div>
             <div className="flex items-center justify-between pt-2 text-xs">
                <span className="font-medium">Last Updated</span>
                <span className="text-muted">Just now</span>
             </div>
          </div>
          <div className="flex flex-col gap-2 pt-4">
            <Button variant="primary" className="w-full justify-center">Download PDF</Button>
            <Button variant="secondary" className="w-full justify-center">Download CSV</Button>
          </div>
        </div>
      </Drawer>
    </section>
  );
}
