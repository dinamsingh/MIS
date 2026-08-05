import { useState, useMemo, memo } from 'react';
import type { AttendanceTrendPoint } from '@presentation/views/DashboardView';
import { DashboardEmptyState } from './DashboardWidgets';

type ChartType = 'Line' | 'Area' | 'Bar' | 'Scatter' | 'Pie';

const AttendanceSVGChart = memo(function AttendanceSVGChart({
  points,
  type,
}: {
  readonly points: readonly AttendanceTrendPoint[];
  readonly type: ChartType;
}) {
  const data = useMemo(() => {
    if (points.length === 0) return [];
    const bucketSize = Math.max(1, Math.ceil(points.length / 8));
    const result: { label: string; percent: number }[] = [];
    for (let i = 0; i < points.length; i += bucketSize) {
      const bucket = points.slice(i, i + bucketSize);
      const average = bucket.reduce((sum, point) => sum + point.percent, 0) / bucket.length;
      result.push({ label: bucket[0].date.slice(5), percent: Math.max(0, Math.min(100, average)) });
    }
    return result;
  }, [points]);

  if (data.length === 0 || points.length === 0) {
    return (
      <DashboardEmptyState
        title="No attendance data"
        message="Not enough attendance data is available yet to draw a chart."
      />
    );
  }

  const height = 260;
  const width = 800; // SVG viewBox width, scales responsively
  const paddingX = 50;
  const paddingY = 40;

  if (type === 'Pie') {
    let excellent = 0, good = 0, poor = 0;
    points.forEach((p) => {
      if (p.percent >= 90) excellent++;
      else if (p.percent >= 75) good++;
      else poor++;
    });
    const total = points.length;
    const radius = Math.min(width, height) / 2.5;
    const circumference = 2 * Math.PI * radius;

    const pE = (excellent / total) * circumference;
    const pG = (good / total) * circumference;
    const pP = (poor / total) * circumference;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible py-4" role="img" aria-label="Pie Chart">
        <circle cx={width / 2} cy={height / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth="40" />

        <circle
          cx={width / 2}
          cy={height / 2}
          r={radius}
          fill="none"
          stroke="#0D746A"
          strokeWidth="40"
          strokeDasharray={`${pE} ${circumference}`}
          transform={`rotate(-90 ${width / 2} ${height / 2})`}
        />

        <circle
          cx={width / 2}
          cy={height / 2}
          r={radius}
          fill="none"
          stroke="#3B82F6"
          strokeWidth="40"
          strokeDasharray={`${pG} ${circumference}`}
          transform={`rotate(${-90 + (excellent / total) * 360} ${width / 2} ${height / 2})`}
        />

        <circle
          cx={width / 2}
          cy={height / 2}
          r={radius}
          fill="none"
          stroke="#EF4444"
          strokeWidth="40"
          strokeDasharray={`${pP} ${circumference}`}
          transform={`rotate(${-90 + ((excellent + good) / total) * 360} ${width / 2} ${height / 2})`}
        />

        <text x={width / 2} y={height / 2 - 10} textAnchor="middle" fontSize="14" fill="#6B7280" fontWeight="600">Total</text>
        <text x={width / 2} y={height / 2 + 15} textAnchor="middle" fontSize="24" fill="#111827" fontWeight="bold">{total}</text>

        {/* Legend */}
        <g transform={`translate(${width - 200}, ${height / 2 - 30})`}>
          <circle cx="0" cy="0" r="6" fill="#0D746A" />
          <text x="15" y="4" fontSize="14" fill="#4B5563">Excellent (&ge;90%)</text>

          <circle cx="0" cy="25" r="6" fill="#3B82F6" />
          <text x="15" y="29" fontSize="14" fill="#4B5563">Good (75-89%)</text>

          <circle cx="0" cy="50" r="6" fill="#EF4444" />
          <text x="15" y="54" fontSize="14" fill="#4B5563">Needs Review (&lt;75%)</text>
        </g>
      </svg>
    );
  }

  // Helpers for Line/Area/Bar/Scatter
  const getX = (index: number) => paddingX + (index * (width - 2 * paddingX)) / Math.max(1, data.length - 1);
  const getY = (val: number) => height - paddingY - (val / 100) * (height - 2 * paddingY);

  const pathString = data.reduce((acc, p, i) => (i === 0 ? `M ${getX(i)} ${getY(p.percent)}` : `${acc} L ${getX(i)} ${getY(p.percent)}`), '');
  const areaString = `${pathString} L ${getX(data.length - 1)} ${height - paddingY} L ${getX(0)} ${height - paddingY} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible py-4" role="img" aria-label={`${type} Chart`}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0D746A" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#0D746A" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map(val => (
        <g key={val}>
          <line x1={paddingX} y1={getY(val)} x2={width - paddingX} y2={getY(val)} stroke="#e5e7eb" strokeDasharray="4 4" />
          <text x={paddingX - 10} y={getY(val) + 4} fontSize="12" fill="#9ca3af" textAnchor="end">{val}%</text>
        </g>
      ))}

      {/* X Axis labels */}
      {data.map((d, i) => (
        <text key={d.label} x={getX(i)} y={height - paddingY + 20} fontSize="12" fill="#9ca3af" textAnchor="middle">
          {d.label}
        </text>
      ))}

      {type === 'Area' && (
        <path d={areaString} fill="url(#areaGrad)" />
      )}

      {(type === 'Line' || type === 'Area') && (
        <path d={pathString} fill="none" stroke="#0D746A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      )}

      {type === 'Bar' && data.map((d, i) => {
        const barWidth = Math.max(12, (width - 2 * paddingX) / data.length * 0.4);
        const barHeight = height - paddingY - getY(d.percent);
        return (
          <rect key={i} x={getX(i) - barWidth / 2} y={getY(d.percent)} width={barWidth} height={barHeight} fill="#0D746A" rx="4" className="hover:opacity-80 transition-opacity cursor-pointer" />
        );
      })}

      {(type === 'Scatter' || type === 'Line' || type === 'Area') && data.map((d, i) => (
        <g key={i} className="group cursor-pointer">
          <circle cx={getX(i)} cy={getY(d.percent)} r={type === 'Scatter' ? '7' : '5'} fill="#ffffff" stroke="#0D746A" strokeWidth="2.5" className="transition-all group-hover:r-[7px] group-hover:stroke-[3px]" />
          <text x={getX(i)} y={getY(d.percent) - 15} fontSize="14" fill="#111827" fontWeight="bold" textAnchor="middle" className="opacity-0 group-hover:opacity-100 transition-opacity">
            {d.percent.toFixed(0)}%
          </text>
        </g>
      ))}
    </svg>
  );
});

export default function DashboardCharts({
  trendPoints,
}: {
  readonly trendPoints: readonly AttendanceTrendPoint[];
}) {
  const [chartType, setChartType] = useState<ChartType>('Line');

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex justify-end border-b border-border/50 pb-4 mb-2">
        <div className="relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-[18px] text-accent pointer-events-none">bar_chart</span>
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value as ChartType)}
            className="appearance-none bg-background hover:bg-surface-muted pl-9 pr-10 py-2 rounded-lg border border-border text-sm font-semibold transition-colors cursor-pointer outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 text-accent"
          >
            <option value="Line">Line Chart</option>
            <option value="Area">Area Chart</option>
            <option value="Bar">Bar Chart</option>
            <option value="Scatter">Scatter Plot</option>
            <option value="Pie">Pie Chart (Distribution)</option>
          </select>
          <span className="material-symbols-outlined absolute right-3 text-[18px] pointer-events-none text-text-soft">arrow_drop_down</span>
        </div>
      </div>
      <div className="w-full overflow-hidden">
        <AttendanceSVGChart points={trendPoints} type={chartType} />
      </div>
    </div>
  );
}
