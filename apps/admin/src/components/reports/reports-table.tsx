'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, Printer, Search, RotateCcw, FilePlus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Label } from '@/components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import {
  SEVERITIES, SEVERITY_LABELS, SEVERITY_COLORS,
  OCCURRENCE_STATUSES, STATUS_LABELS,
  type OccurrenceReport, type SeverityLevel, type OccurrenceStatus,
} from '@digilog/shared';

export function ReportsTable({ reports }: { reports: OccurrenceReport[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [severity, setSeverity] = useState<'' | SeverityLevel>('');
  const [status, setStatus] = useState<'' | OccurrenceStatus>('');
  const [date, setDate] = useState('');

  const localDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-CA') : '';

  const filtered = useMemo(() => reports.filter((r) => {
    if (severity && r.severity !== severity) return false;
    if (status && r.status !== status) return false;
    if (date && localDate(r.created_at) !== date) return false;
    if (q) {
      const hay = `${r.ob_number ?? ''} ${r.occurrence_type ?? ''} ${r.description ?? ''} ${r.created_by_name ?? ''}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [reports, q, severity, status, date]);

  const anyFilter = !!q || !!severity || !!status || !!date;
  const reset = () => { setQ(''); setSeverity(''); setStatus(''); setDate(''); };

  return (
    <>
      {/* Top filter bar — search + filter chips + create CTA */}
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted))]" />
              <Input className="pl-9" placeholder="OB #, type, description, author…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Severity</Label>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as '' | SeverityLevel)}>
              <option value="">All</option>
              {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as '' | OccurrenceStatus)}>
              <option value="">All</option>
              {OCCURRENCE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Created on</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[hsl(var(--muted))]">
            {filtered.length} of {reports.length} reports
          </p>
          <div className="flex items-center gap-2">
            {anyFilter && (
              <Button variant="secondary" size="sm" onClick={reset}>
                <RotateCcw className="h-4 w-4" /> Clear filters
              </Button>
            )}
            <Link href="/reports/new">
              <Button size="sm"><FilePlus className="h-4 w-4" /> Create Report</Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* Results table — clickable rows + severity-tinted left rail */}
      <Card className="overflow-hidden p-0">
        <Table>
          <THead>
            <TR><TH>OB #</TH><TH>Type</TH><TH>Severity</TH><TH>Status</TH><TH>Created By</TH><TH>Created</TH><TH /></TR>
          </THead>
          <TBody>
            {filtered.map((r) => {
              const sevColor = r.severity ? SEVERITY_COLORS[r.severity] : '#94a3b8';
              return (
                <TR
                  key={r.id}
                  onClick={() => router.push(`/occurrences/${r.occurrence_id}`)}
                  className="cursor-pointer"
                  style={{
                    borderLeft: `5px solid ${sevColor}`,
                    background: `linear-gradient(90deg, ${sevColor}33 0%, ${sevColor}11 40%, transparent 70%)`,
                  }}
                >
                  <TD>
                    <Link
                      href={`/occurrences/${r.occurrence_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-brand hover:underline"
                    >
                      {r.ob_number}
                    </Link>
                  </TD>
                  <TD>{r.occurrence_type}</TD>
                  <TD>{r.severity && <SeverityBadge severity={r.severity} />}</TD>
                  <TD><StatusBadge status={r.status} /></TD>
                  <TD>{r.created_by_name ?? '—'}</TD>
                  <TD className="whitespace-nowrap text-xs text-[hsl(var(--muted))]">{formatDateTime(r.created_at)}</TD>
                  <TD>
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Link href={`/occurrences/${r.occurrence_id}`}>
                        <Button variant="ghost" size="icon" title="View"><Eye className="h-4 w-4" /></Button>
                      </Link>
                      <Link href={`/print/report/${r.ob_number}`} target="_blank">
                        <Button variant="ghost" size="icon" title="Print / PDF"><Printer className="h-4 w-4" /></Button>
                      </Link>
                    </div>
                  </TD>
                </TR>
              );
            })}
            {filtered.length === 0 && (
              <TR><TD colSpan={7} className="py-8 text-center text-[hsl(var(--muted))]">
                {reports.length === 0 ? 'No reports yet. Click Create Report to start one.' : 'No reports match these filters.'}
              </TD></TR>
            )}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
