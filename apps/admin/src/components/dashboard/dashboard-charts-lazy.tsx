'use client';

// Lazy boundary for the recharts-powered dashboard charts.
//
// recharts is ~150 kB. Importing it directly into the dashboard put it in that
// route's initial JS, so the whole landing page waited on it. These charts are
// interactive and sit below the KPI/stat rows, so we load them with
// `next/dynamic({ ssr: false })`: the dashboard shell + KPIs paint immediately,
// a light skeleton holds the chart's space, and recharts streams in as its own
// async chunk after hydration.

import dynamic from 'next/dynamic';

function ChartSkeleton() {
  return (
    <div className="h-[300px] w-full animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800/60" />
  );
}

export const MonthlyTrendChart = dynamic(
  () => import('./dashboard-charts').then((m) => m.MonthlyTrendChart),
  { ssr: false, loading: ChartSkeleton },
);

export const CategoryDonut = dynamic(
  () => import('./dashboard-charts').then((m) => m.CategoryDonut),
  { ssr: false, loading: ChartSkeleton },
);
