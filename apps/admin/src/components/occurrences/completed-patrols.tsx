'use client';

import { useMemo, useState } from 'react';
import { Search, RotateCcw } from 'lucide-react';
import { GradientSection } from '@/components/ui/gradient-section';
import { Input, Select, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import type { PatrolDetailed } from '@digilog/shared';

/**
 * Self-contained Completed Patrols card with its own search + filters,
 * wrapped in a tonal GradientSection so it visually separates from the
 * Closed Occurrences block above. The parent page anchors `#completed-patrols`
 * here for the jump-to-patrols button at the top of /occurrences/history.
 */
export function CompletedPatrols({ patrols }: { patrols: PatrolDetailed[] }) {
  const [q, setQ] = useState('');
  const [site, setSite] = useState('all');
  const [route, setRoute] = useState('all');
  const [date, setDate] = useState('');

  const sites = useMemo(
    () => [...new Set(patrols.map((p) => p.site_name).filter(Boolean) as string[])].sort(),
    [patrols],
  );
  const routes = useMemo(
    () => [...new Set(patrols.map((p) => p.route_name).filter(Boolean) as string[])].sort(),
    [patrols],
  );

  const localDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-CA') : '';

  const filtered = useMemo(() => patrols.filter((p) => {
    if (site !== 'all' && (p.site_name ?? '') !== site) return false;
    if (route !== 'all' && (p.route_name ?? '') !== route) return false;
    if (date && localDate(p.ended_at) !== date) return false;
    if (q) {
      const hay = `${p.guard_name ?? ''} ${p.route_name ?? ''} ${p.site_name ?? ''}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [patrols, q, site, route, date]);

  const anyFilter = !!q || site !== 'all' || route !== 'all' || !!date;
  const reset = () => { setQ(''); setSite('all'); setRoute('all'); setDate(''); };

  return (
    <div id="completed-patrols" className="scroll-mt-20">
      <GradientSection
        title={`Completed Patrols (${filtered.length})`}
        subtitle="Search and filter every closed patrol"
        icon="Footprints"
        tone="green"
      >
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Label className="text-xs">Search</Label>
            <Search className="absolute left-3 top-1/2 mt-2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted))]" />
            <Input className="pl-9" placeholder="Guard, route, site…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Site</Label>
            <Select value={site} onChange={(e) => setSite(e.target.value)}>
              <option value="all">All sites</option>
              {sites.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Route</Label>
            <Select value={route} onChange={(e) => setRoute(e.target.value)}>
              <option value="all">All routes</option>
              {routes.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Ended on</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {anyFilter && (
          <div className="mb-3">
            <Button variant="secondary" size="sm" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Clear filters
            </Button>
          </div>
        )}

        <Table>
          <THead>
            <TR><TH>Guard</TH><TH>Route</TH><TH>Site</TH><TH>Checkpoints</TH><TH>Duration</TH><TH>Ended</TH></TR>
          </THead>
          <TBody>
            {filtered.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium">{p.guard_name}</TD>
                <TD>{p.route_name ?? '—'}</TD>
                <TD>{p.site_name ?? '—'}</TD>
                <TD>{p.scan_count}{p.checkpoints_total ? ` / ${p.checkpoints_total}` : ''}</TD>
                <TD>{p.duration_minutes != null ? `${p.duration_minutes} min` : '—'}</TD>
                <TD className="whitespace-nowrap text-xs text-[hsl(var(--muted))]">{formatDateTime(p.ended_at)}</TD>
              </TR>
            ))}
            {filtered.length === 0 && (
              <TR><TD colSpan={6} className="py-6 text-center text-[hsl(var(--muted))]">
                {patrols.length === 0 ? 'No completed patrols yet.' : 'No patrols match these filters.'}
              </TD></TR>
            )}
          </TBody>
        </Table>
      </GradientSection>
    </div>
  );
}
