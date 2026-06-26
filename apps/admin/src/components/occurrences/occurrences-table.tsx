'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import { toCsv, downloadCsv } from '@/lib/csv';
import {
  OCCURRENCE_STATUSES, SEVERITIES, STATUS_LABELS, SEVERITY_LABELS, SEVERITY_COLORS,
  isSlaBreached, type Occurrence,
} from '@digilog/shared';

export function OccurrencesTable({ rows }: { rows: Occurrence[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [site, setSite] = useState('');

  const sites = useMemo(
    () => [...new Set(rows.map((r) => r.site_name).filter(Boolean))] as string[],
    [rows],
  );

  const filtered = useMemo(() => rows.filter((r) => {
    if (status && r.status !== status) return false;
    if (severity && r.severity !== severity) return false;
    if (site && r.site_name !== site) return false;
    if (q) {
      const hay = `${r.ob_number} ${r.occurrence_type} ${r.description} ${r.logged_by_name}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [rows, q, status, severity, site]);

  return (
    <Card className="p-4">
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted))]" />
          <Input className="pl-9" placeholder="Search OB, type, description…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {OCCURRENCE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </Select>
        <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">All severities</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
        </Select>
        <Select value={site} onChange={(e) => setSite(e.target.value)}>
          <option value="">All sites</option>
          {sites.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-[hsl(var(--muted))]">{filtered.length} of {rows.length} occurrences</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const csv = toCsv(filtered, [
              { key: 'ob_number', header: 'OB #' },
              { key: 'occurrence_type', header: 'Type' },
              { key: 'severity', header: 'Severity' },
              { key: 'status', header: 'Status' },
              { key: 'site_name', header: 'Site' },
              { key: 'logged_by_name', header: 'Logged By' },
              { key: 'incident_at', header: 'Incident', format: (v) => v ? new Date(String(v)).toISOString() : '' },
              { key: 'created_at', header: 'Logged', format: (v) => v ? new Date(String(v)).toISOString() : '' },
              { key: 'description', header: 'Description' },
            ]);
            downloadCsv(`occurrences-${new Date().toISOString().slice(0, 10)}.csv`, csv);
          }}
        >
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>OB #</TH><TH>Type</TH><TH>Severity</TH><TH>Status</TH>
            <TH>Site</TH><TH>Logged By</TH><TH>Incident</TH>
          </TR>
        </THead>
        <TBody>
          {filtered.map((r) => {
            // Breached open rows go red and override the severity colour, so
            // "needs attention" jumps out. Resolved/closed rows never breach.
            const breached = isSlaBreached(r);
            const railColor = breached ? '#dc2626' : SEVERITY_COLORS[r.severity];
            return (
              <TR
                key={r.id}
                onClick={() => router.push(`/occurrences/${r.id}`)}
                className="cursor-pointer"
                // Coloured left rail + tonal row wash. Reads at a glance, doesn't
                // fight the rest of the page. Hover layer still applies on top.
                style={{
                  borderLeft: `5px solid ${railColor}`,
                  background: `linear-gradient(90deg, ${railColor}${breached ? '38' : '33'} 0%, ${railColor}11 40%, transparent 70%)`,
                }}
              >
                <TD>
                  {/* Keep the explicit OB link too so right-click → open-in-new-tab
                      keeps working. Stop propagation so we don't double-fire the
                      row click navigation. */}
                  <Link
                    href={`/occurrences/${r.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-brand hover:underline"
                  >
                    {r.ob_number}
                  </Link>
                </TD>
                <TD>{r.occurrence_type}</TD>
                <TD><SeverityBadge severity={r.severity} /></TD>
                <TD><StatusBadge status={r.status} /></TD>
                <TD>{r.site_name ?? '—'}</TD>
                <TD>{r.logged_by_name ?? '—'}</TD>
                <TD className="whitespace-nowrap text-xs text-[hsl(var(--muted))]">{formatDateTime(r.incident_at)}</TD>
              </TR>
            );
          })}
          {filtered.length === 0 && (
            <TR><TD colSpan={7} className="py-8 text-center text-[hsl(var(--muted))]">No matching occurrences.</TD></TR>
          )}
        </TBody>
      </Table>
    </Card>
  );
}
