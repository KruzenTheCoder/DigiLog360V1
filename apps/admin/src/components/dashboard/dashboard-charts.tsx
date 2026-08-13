'use client';

import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SEVERITY_COLORS } from '@digilog/shared';

export const PALETTE = ['#667eea', '#764ba2', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6'];

export function CategoryDonut({ data }: { data: { name: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <Card className="h-full">
      <CardHeader><CardTitle>Occurrence Breakdown by Category</CardTitle></CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-6">
          {/* Large donut that scales with the container width (percentage
              radii) so it nearly fills the card. */}
          <div className="relative mx-auto aspect-square w-full max-w-[26rem]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="count" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2}>
                  {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-extrabold">{total}</span>
              <span className="text-xs uppercase tracking-wider text-[hsl(var(--muted))]">Total occurrences</span>
            </div>
          </div>
          <ul className="grid w-full grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {data.length === 0 && <li className="text-sm text-[hsl(var(--muted))]">No data yet.</li>}
            {data.map((d, i) => {
              const pct = total ? Math.round((d.count / total) * 100) : 0;
              return (
                <li key={d.name} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <span className="flex-1 truncate">{d.name}</span>
                  <span className="text-[hsl(var(--muted))]">{d.count}</span>
                  <span className="w-9 text-right font-semibold">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export function MonthlyTrendChart({ data }: { data: { month: string; count: number; breached: number }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Occurrence Trend (6 months)</CardTitle></CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: -20, right: 8 }}>
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#667eea" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#667eea" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip />
            <Area type="monotone" dataKey="count" name="Occurrences" stroke="#667eea" fill="url(#g1)" strokeWidth={2} />
            <Area type="monotone" dataKey="breached" name="SLA Breached" stroke="#ef4444" fill="none" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function TypeBreakdownChart({ data }: { data: { name: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>By Occurrence Type</CardTitle></CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 20, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
            <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" fontSize={12} width={110} tickLine={false} axisLine={false} />
            <Tooltip />
            <Bar dataKey="count" name="Occurrences" radius={[0, 6, 6, 0]}>
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function SeverityPie({ data }: { data: { name: string; value: number; key: string }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Severity Mix</CardTitle></CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
              {data.map((d) => (
                <Cell key={d.key} fill={SEVERITY_COLORS[d.key as keyof typeof SEVERITY_COLORS] ?? '#94a3b8'} />
              ))}
            </Pie>
            <Legend />
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
