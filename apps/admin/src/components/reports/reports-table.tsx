'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, Printer, Search, RotateCcw, FilePlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Label } from '@/components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { GradientSection } from '@/components/ui/gradient-section';
import { usePagedRows, Pager } from '@/components/ui/pager';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import {
  SEVERITIES, SEVERITY_LABELS, SEVERITY_COLORS,
  OCCURRENCE_STATUSES, STATUS_LABELS,
  type OccurrenceReport, type SeverityLevel, type OccurrenceStatus,
} from '@digilog/shared';

interface PickerOcc {
  id: number;
  ob_number: string | null;
  occurrence_type: string;
  severity: SeverityLevel | null;
  status: OccurrenceStatus;
  created_at: string;
  site_name: string | null;
}

export function ReportsTable({ reports }: { reports: OccurrenceReport[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [severity, setSeverity] = useState<'' | SeverityLevel>('');
  const [status, setStatus] = useState<'' | OccurrenceStatus>('');
  const [date, setDate] = useState('');

  // "Create Report" occurrence picker. A report is 1-per-occurrence, so the
  // report form needs an occurrence id (/reports/new?occurrence=<id>). The old
  // button linked to a bare /reports/new, which the page immediately redirected
  // back to /reports — the "glitch". Now we let the user pick an occurrence.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [occs, setOccs] = useState<PickerOcc[] | null>(null);

  useEffect(() => {
    if (!pickerOpen || occs !== null) return;
    const sb = createClient();
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any)
        .from('occurrences')
        .select('id, ob_number, occurrence_type, severity, status, created_at, site_name')
        .order('created_at', { ascending: false })
        .limit(300);
      setOccs((data ?? []) as PickerOcc[]);
    })();
  }, [pickerOpen, occs]);

  // Occurrences that don't yet have a report — the candidates for a NEW report.
  const reportedIds = useMemo(() => new Set(reports.map((r) => r.occurrence_id)), [reports]);
  const pickerRows = useMemo(() => {
    const list = (occs ?? []).filter((o) => !reportedIds.has(o.id));
    const needle = pickerSearch.toLowerCase().trim();
    if (!needle) return list;
    return list.filter((o) =>
      `${o.ob_number ?? ''} ${o.occurrence_type ?? ''} ${o.site_name ?? ''}`.toLowerCase().includes(needle),
    );
  }, [occs, reportedIds, pickerSearch]);

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

  const pg = usePagedRows(filtered, 50);
  useEffect(() => {
    pg.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, severity, status, date]);

  return (
    <>
      {/* Top filter bar — search + filter chips + create CTA */}
      <GradientSection title="Filters" icon="SlidersHorizontal" tone="slate" className="mb-4">
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
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <FilePlus className="h-4 w-4" /> Create Report
            </Button>
          </div>
        </div>
      </GradientSection>

      {/* Results table — clickable rows + severity-tinted left rail */}
      <GradientSection title="Occurrence Reports" subtitle="View, filter or export to PDF" icon="FileText" tone="brand">
        <Table>
          <THead>
            <TR><TH>OB #</TH><TH>Type</TH><TH>Severity</TH><TH>Status</TH><TH>Created By</TH><TH>Created</TH><TH /></TR>
          </THead>
          <TBody>
            {pg.pageRows.map((r) => {
              const sevColor = r.severity ? SEVERITY_COLORS[r.severity] : '#94a3b8';
              return (
                <TR
                  key={r.id}
                  onClick={() => router.push(`/occurrences/${r.occurrence_id}`)}
                  className="cursor-pointer"
                  style={{
                    borderLeft: `5px solid ${sevColor}`,
                    background: `linear-gradient(90deg, ${sevColor}33 0%, ${sevColor}14 100%)`,
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
        <Pager {...pg} />
      </GradientSection>

      {/* Create-report occurrence picker */}
      <Dialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Create report — choose an occurrence"
        className="max-w-xl"
      >
        <p className="mb-3 text-sm text-[hsl(var(--muted))]">
          A report attaches to an occurrence. Pick the one you want to write a report for.
        </p>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted))]" />
          <Input
            className="pl-9"
            placeholder="Search OB #, type, site…"
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {occs === null ? (
            <p className="py-6 text-center text-sm text-[hsl(var(--muted))]">Loading occurrences…</p>
          ) : pickerRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-[hsl(var(--muted))]">
              {occs.length === 0
                ? 'No occurrences available.'
                : 'Every occurrence already has a report — open it from the table to view or edit.'}
            </p>
          ) : (
            pickerRows.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => router.push(`/reports/new?occurrence=${o.id}`)}
                className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"
                style={{ borderLeft: `4px solid ${o.severity ? SEVERITY_COLORS[o.severity] : '#94a3b8'}` }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {o.ob_number ?? `Occurrence ${o.id}`} · {o.occurrence_type}
                  </p>
                  <p className="truncate text-xs text-[hsl(var(--muted))]">
                    {o.site_name ?? '—'} · {formatDateTime(o.created_at)}
                  </p>
                </div>
                {o.severity && <SeverityBadge severity={o.severity} />}
              </button>
            ))
          )}
        </div>
      </Dialog>
    </>
  );
}
