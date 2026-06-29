'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Search, Download, ChevronLeft, ChevronRight, X, Bookmark,
  BookmarkPlus, Trash2, Loader2, Pin, Calendar,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input, Select, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { createClient } from '@/lib/supabase/client';
import { formatDateTime } from '@/lib/utils';
import { toCsv, downloadCsv } from '@/lib/csv';
import { BulkActionsBar } from './bulk-actions-bar';
import {
  OCCURRENCE_STATUSES, SEVERITIES, STATUS_LABELS, SEVERITY_LABELS, SEVERITY_COLORS,
  PAGE_SIZE_OPTIONS, serialiseOccurrencesFilter, isSlaBreached,
  type Occurrence, type OccurrencesFilter, type SavedView, type AppRole,
} from '@digilog/shared';

interface Assignable { id: string; full_name: string | null; email: string | null; role: AppRole }

interface ExplorerProps {
  rows: Occurrence[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  dir: 'asc' | 'desc';
  filter: OccurrencesFilter;
  sites: { id: string; name: string }[];
  types: string[];
  savedViews: SavedView[];
  currentUserId: string;
  currentUserName: string;
  assignables: Assignable[];
}

export function OccurrencesExplorer(props: ExplorerProps) {
  const { rows, total, page, pageSize, sort, dir, filter, sites, types, savedViews, currentUserId, currentUserName, assignables } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  }
  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Local copies for the search inputs (commit on blur / enter).
  const [q, setQ] = useState(filter.q ?? '');
  const [from, setFrom] = useState(filter.from ?? '');
  const [to, setTo] = useState(filter.to ?? '');

  useEffect(() => { setQ(filter.q ?? ''); }, [filter.q]);
  useEffect(() => { setFrom(filter.from ?? ''); }, [filter.from]);
  useEffect(() => { setTo(filter.to ?? ''); }, [filter.to]);

  // ----- URL transitions -----
  // We accept a loose Record because every URL value is ultimately a string;
  // the typed Filter shape is for the parsed result, not the writer.
  function navigate(next: Record<string, string | number | undefined | null>) {
    const current = Object.fromEntries(searchParams.entries());
    const merged: Record<string, string> = { ...current };
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === null || v === '') delete merged[k];
      else merged[k] = String(v);
    }
    if (!('page' in next)) delete merged.page;
    const qs = new URLSearchParams(merged).toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  function clearAll() {
    startTransition(() => router.push(pathname));
  }

  // ----- pagination math -----
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from1 = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to1 = Math.min(page * pageSize, total);

  // ----- CSV: export only the visible filtered slice, not every row. -----
  // (Operators who need the full set can chain page=1&pageSize=200 etc.)
  function exportCsv() {
    const csv = toCsv(rows, [
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
  }

  // ----- saved views -----
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const activeViewId = useMemo(() => {
    return savedViews.find((v) => {
      const a = serialiseOccurrencesFilter(v.filters).toString();
      const b = serialiseOccurrencesFilter(filter).toString();
      return a === b;
    })?.id;
  }, [savedViews, filter]);

  return (
    <>
      {/* ---------------- saved views row ---------------- */}
      {savedViews.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Bookmark className="h-4 w-4 text-[hsl(var(--muted))]" />
          {savedViews.map((v) => {
            const target = `${pathname}?${serialiseOccurrencesFilter(v.filters).toString()}`;
            const active = activeViewId === v.id;
            return (
              <Link
                key={v.id}
                href={target}
                className={`group inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
                  active ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {v.is_pinned && <Pin className="h-3 w-3" />}
                {v.name}
                {v.is_shared && <Badge color="#8b5cf6">shared</Badge>}
              </Link>
            );
          })}
        </div>
      )}

      {/* ---------------- filter bar ---------------- */}
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <div className="relative xl:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted))]" />
            <Input
              className="pl-9"
              placeholder="OB#, type, description, logger…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => navigate({ q })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
              }}
            />
          </div>

          <Select
            value={filter.status ?? ''}
            onChange={(e) => navigate({ status: e.target.value })}
          >
            <option value="">All statuses</option>
            {OCCURRENCE_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </Select>

          <Select
            value={filter.severity ?? ''}
            onChange={(e) => navigate({ severity: e.target.value })}
          >
            <option value="">All severities</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
            ))}
          </Select>

          <Select
            value={filter.site_id ?? ''}
            onChange={(e) => navigate({ site_id: e.target.value, site_name: '' })}
          >
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>

          <Select
            value={filter.type ?? ''}
            onChange={(e) => navigate({ type: e.target.value })}
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <Label className="flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3" /> From (incident date)
            </Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              onBlur={() => navigate({ from })}
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <Label className="flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3" /> To (incident date)
            </Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onBlur={() => navigate({ to })}
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <Label className="text-xs">Patrols</Label>
            <Select
              value={filter.is_patrol ?? ''}
              onChange={(e) => navigate({ is_patrol: e.target.value })}
            >
              <option value="">Include all</option>
              <option value="false">Hide patrols</option>
              <option value="true">Only patrols</option>
            </Select>
          </div>
          <Button variant="secondary" onClick={clearAll}>
            <X className="h-4 w-4" /> Clear
          </Button>
          <Button variant="secondary" onClick={() => setSavePromptOpen(true)}>
            <BookmarkPlus className="h-4 w-4" /> Save view
          </Button>
        </div>
      </Card>

      {/* ---------------- results count + actions ---------------- */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[hsl(var(--muted))]">
          {isPending ? 'Loading…' : (
            total === 0 ? 'No matching occurrences'
              : `Showing ${from1.toLocaleString()}–${to1.toLocaleString()} of ${total.toLocaleString()}`
          )}
        </p>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Sort</Label>
          <Select
            className="w-auto"
            value={`${sort}:${dir}`}
            onChange={(e) => {
              const [s, d] = e.target.value.split(':');
              navigate({ sort: s, dir: d });
            }}
          >
            <option value="incident_at:desc">Incident · newest</option>
            <option value="incident_at:asc">Incident · oldest</option>
            <option value="created_at:desc">Logged · newest</option>
            <option value="created_at:asc">Logged · oldest</option>
            <option value="ob_number:desc">OB # · highest</option>
            <option value="ob_number:asc">OB # · lowest</option>
            <option value="severity:asc">Severity</option>
          </Select>

          <Label className="ml-3 text-xs">Per page</Label>
          <Select
            className="w-auto"
            value={String(pageSize)}
            onChange={(e) => navigate({ pageSize: Number(e.target.value), page: 1 })}
          >
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>

          <Button variant="secondary" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export page
          </Button>
        </div>
      </div>

      {/* ---------------- table ---------------- */}
      <Card className="p-4">
        <Table>
          <THead>
            <TR>
              <TH className="w-8">
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  checked={allOnPageSelected}
                  onChange={toggleAll}
                />
              </TH>
              <TH>OB #</TH><TH>Type</TH><TH>Severity</TH><TH>Status</TH>
              <TH>Site</TH><TH>Logged By</TH><TH>Incident</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => {
              // Coloured left rail + tonal row wash, matching the Live board and
              // other occurrence tables. Breached open rows override the
              // severity colour with red so "needs attention" jumps out.
              const breached = isSlaBreached(r);
              const railColor = breached ? '#dc2626' : SEVERITY_COLORS[r.severity];
              return (
                <TR
                  key={r.id}
                  onClick={() => router.push(`/occurrences/${r.id}`)}
                  className="cursor-pointer"
                  style={{
                    borderLeft: `5px solid ${railColor}`,
                    background: `linear-gradient(90deg, ${railColor}${breached ? '38' : '33'} 0%, ${railColor}11 40%, transparent 70%)`,
                  }}
                >
                  {/* Checkbox cell must not trigger the row's navigation. */}
                  <TD className="w-8" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.ob_number}`}
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                    />
                  </TD>
                  <TD>
                    {/* Explicit link kept so right-click → open-in-new-tab works;
                        stop propagation so we don't double-fire navigation. */}
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
                  <TD className="whitespace-nowrap text-xs text-[hsl(var(--muted))]">
                    {formatDateTime(r.incident_at)}
                  </TD>
                </TR>
              );
            })}
            {rows.length === 0 && (
              <TR><TD colSpan={8} className="py-8 text-center text-[hsl(var(--muted))]">
                No matching occurrences.
              </TD></TR>
            )}
          </TBody>
        </Table>
      </Card>

      {/* ---------------- pagination ---------------- */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1 || isPending}
          onClick={() => navigate({ page: page - 1 })}
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted))]">
          {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Page {page.toLocaleString()} of {totalPages.toLocaleString()}
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages || isPending}
          onClick={() => navigate({ page: page + 1 })}
        >
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <BulkActionsBar
        selectedIds={Array.from(selected)}
        onClear={() => setSelected(new Set())}
        authorId={currentUserId}
        authorName={currentUserName}
        assignables={assignables}
      />

      <SaveViewDialog
        open={savePromptOpen}
        onClose={() => setSavePromptOpen(false)}
        filter={filter}
        currentUserId={currentUserId}
        existingViews={savedViews.filter((v) => v.user_id === currentUserId)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Save / delete view dialog
// ---------------------------------------------------------------------------
function SaveViewDialog({
  open, onClose, filter, currentUserId, existingViews,
}: {
  open: boolean;
  onClose: () => void;
  filter: OccurrencesFilter;
  currentUserId: string;
  existingViews: SavedView[];
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setName(''); setError(null); } }, [open]);

  async function save() {
    if (!name.trim()) { setError('Give the view a name.'); return; }
    setBusy(true); setError(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (supabase as any).from('saved_views').insert({
      user_id: currentUserId,
      scope: 'occurrences',
      name: name.trim(),
      filters: filter,
      is_pinned: pinned,
      is_shared: shared,
    });
    setBusy(false);
    if (insErr) { setError(insErr.message); return; }
    onClose();
    router.refresh();
  }

  async function remove(id: string) {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('saved_views').delete().eq('id', id);
    router.refresh();
  }

  async function togglePin(view: SavedView) {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('saved_views')
      .update({ is_pinned: !view.is_pinned })
      .eq('id', view.id);
    router.refresh();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Saved views">
      <div className="space-y-4">
        {/* save form */}
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-[hsl(var(--muted))]">Save current filters</p>
          <div className="space-y-2">
            <Input
              placeholder="View name — e.g. ‘Open critical incidents’"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              Pin to the top
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
              Share with my organisation (other admins can use it)
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={save} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </Button>
            </div>
          </div>
        </div>

        {/* manage existing */}
        {existingViews.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-[hsl(var(--muted))]">Your saved views</p>
            <div className="space-y-1">
              {existingViews.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    {v.is_pinned && <Pin className="h-3 w-3 text-brand" />}
                    {v.name}
                    {v.is_shared && <Badge color="#8b5cf6">shared</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => togglePin(v)} title="Toggle pin">
                      <Pin className={`h-4 w-4 ${v.is_pinned ? 'text-brand' : ''}`} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(v.id)} title="Delete">
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
