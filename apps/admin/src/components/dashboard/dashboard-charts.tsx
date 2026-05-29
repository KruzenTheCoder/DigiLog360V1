'use client';

import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SEVERITY_COLORS } from '@digilog/shared';

const PALETTE = ['#667eea', '#764ba2', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6'];

export function MonthlyTrendChart({ data }: { data: { month: string; count: number; breached: number }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Incident Trend (6 months)</CardTitle></CardHeader>
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
            <Area type="monotone" dataKey="count" name="Incidents" stroke="#667eea" fill="url(#g1)" strokeWidth={2} />
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
            <Bar dataKey="count" name="Incidents" radius={[0, 6, 6, 0]}>
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
