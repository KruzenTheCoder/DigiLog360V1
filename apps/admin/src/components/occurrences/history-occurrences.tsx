'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { usePagedRows, Pager } from '@/components/ui/pager';
import { SEVERITIES, SEVERITY_COLORS, SEVERITY_LABELS, type OccurrenceStatus, type SeverityLevel } from '@digilog/shared';

export interface HistoryRow {
  id: number;
  ob_number: string | null;
  occurrence_type: string;
  severity: SeverityLevel;
  status: OccurrenceStatus;
  site_name: string | null;
  logged_by_name: string | null;
  incident_at: string;
  closed_at: string | null;
  description: string | null;
}

const localDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA'); // yyyy-mm-dd
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export function HistoryOccurrences({ rows }: { rows: HistoryRow[] }) {
  const router = useRouter();
  const [date, setDate] = useState('');
  const [guard, setGuard] = useState('all');
  const [site, setSite] = useState('all');
  const [type, setType] = useState('all');
  const [severity, setSeverity] = useState('all');

  const guardOptions = useMemo(
    () => [...new Set(rows.map((r) => r.logged_by_name).filter(Boolean) as string[])].sort(),
    [rows],
  );
  const siteOptions = useMemo(
    () => [...new Set(rows.map((r) => r.site_name).filter(Boolean) as string[])].sort(),
    [rows],
  );
  const typeOptions = useMemo(
    () => [...new Set(rows.map((r) => r.occurrence_type).filter(Boolean) as string[])].sort(),
    [rows],
  );

  const filtered = rows.filter((r) => {
    if (date && localDate(r.incident_at) !== date) return false;
    if (guard !== 'all' && (r.logged_by_name ?? '') !== guard) return false;
    if (site !== 'all' && (r.site_name ?? '') !== site) return false;
    if (type !== 'all' && r.occurrence_type !== type) return false;
    if (severity !== 'all' && r.severity !== severity) return false;
    return true;
  });

  const anyFilter = !!date || guard !== 'all' || site !== 'all' || type !== 'all' || severity !== 'all';
  const reset = () => { setDate(''); setGuard('all'); setSite('all'); setType('all'); setSeverity('all'); };

  const pg = usePagedRows(filtered, 50);
  useEffect(() => {
    pg.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, guard, site, type, severity]);

  return (
    <>
      <Card className="mb-5 p-4">
        <p className="mb-3 text-sm font-semibold">Filter Closed Occurrences</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">Logged date</label>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="h-10 w-full rounded-lg border bg-[hsl(var(--surface))] px-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/40"
            />
          </div>
          <Select label="Filter by Guard" value={guard} onChange={setGuard} options={guardOptions} />
          <Select label="Filter by Site" value={site} onChange={setSite} options={siteOptions} />
          <Select label="Filter by Type" value={type} onChange={setType} options={typeOptions} />
          <Select label="Filter by Severity" value={severity} onChange={setSeverity}
            options={SEVERITIES.map((s) => s)} labels={SEVERITY_LABELS} />
          <div className="flex items-end">
            <Button variant="secondary" className="w-full" onClick={reset} disabled={!anyFilter}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="px-4 py-3 text-sm font-semibold">
          Closed / Resolved Occurrences <span className="text-[hsl(var(--muted))]">({filtered.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="bg-brand-gradient text-left text-[11px] font-semibold uppercase tracking-wide text-white">
                <th className="px-4 py-2.5">OB No.</th>
                <th className="px-4 py-2.5">Logged Date</th>
                <th className="px-4 py-2.5">Closed Date</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Severity</th>
                <th className="px-4 py-2.5">Guard / Site</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))]">
              {pg.pageRows.map((r) => {
                const railColor = SEVERITY_COLORS[r.severity];
                return (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/occurrences/${r.id}`)}
                  className="cursor-pointer transition hover:brightness-[0.99]"
                  style={{
                    borderLeft: `5px solid ${railColor}`,
                    background: `linear-gradient(90deg, ${railColor}33 0%, ${railColor}14 100%)`,
                  }}
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link
                      href={`/occurrences/${r.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold text-brand hover:underline"
                    >
                      {r.ob_number ?? '—'}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-[hsl(var(--muted))]">{fmt(r.incident_at)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-[hsl(var(--muted))]">{fmt(r.closed_at)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{r.occurrence_type}</td>
                  <td className="px-4 py-3"><SeverityBadge severity={r.severity} /></td>
                  <td className="px-4 py-3 text-xs">
                    <span className="text-[hsl(var(--foreground))]">{r.logged_by_name ?? '—'}</span>
                    <span className="text-[hsl(var(--muted))]"> / {r.site_name ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="max-w-[320px] truncate px-4 py-3 text-[hsl(var(--muted))]" title={r.description ?? ''}>
                    {r.description ?? '—'}
                  </td>
                </tr>
              );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[hsl(var(--muted))]">
                    {rows.length === 0 ? 'No closed occurrences.' : 'No occurrences match the current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-3">
          <Pager {...pg} />
        </div>
      </Card>
    </>
  );
}

function Select({
  label, value, onChange, options, labels,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: Record<string, string>;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border bg-[hsl(var(--surface))] px-2 text-sm capitalize outline-none focus:border-brand focus:ring-2 focus:ring-brand/40"
      >
        <option value="all">All</option>
        {options.map((o) => (
          <option key={o} value={o} className="capitalize">{labels ? labels[o] ?? o : o}</option>
        ))}
      </select>
    </div>
  );
}
