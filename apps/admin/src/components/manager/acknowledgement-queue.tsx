'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Loader2, ShieldCheck, AlertTriangle, XCircle, LayoutGrid, List,
  Check, X, FileCheck, Search,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Textarea, Label } from '@/components/ui/input';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { SignaturePad } from '@/components/ui/signature-pad';
import {
  MANAGER_DECISIONS, MANAGER_DECISION_LABELS, MANAGER_DECISION_COLORS,
  SEVERITIES, SEVERITY_LABELS,
  type Occurrence, type ManagerDecision, type SeverityLevel,
} from '@digilog/shared';
import { formatDateTime } from '@/lib/utils';

type ViewMode = 'grid' | 'list';
const VIEW_MODE_KEY = 'digilog.acks.view-mode';

interface Filters {
  q: string;
  severity: SeverityLevel | '';
  site: string;
  type: string;
}

export function AcknowledgementQueue({
  items, reviewerId, reviewerName, orgId,
}: {
  items: Occurrence[];
  reviewerId: string;
  reviewerName: string;
  /** Caller's org_id — needed because manager_acknowledgements, occurrence_updates
   *  and occurrence_reports all carry org_id NOT NULL and their RLS WITH CHECK
   *  insists on org_id = current_org_id(). */
  orgId: string | null;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<Occurrence | null>(null);
  const [bulkAction, setBulkAction] = useState<null | 'acknowledge' | 'close'>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [view, setView] = useState<ViewMode>('grid');
  const [filters, setFilters] = useState<Filters>({ q: '', severity: '', site: '', type: '' });

  // Hydrate the saved view mode after mount (avoids SSR/CSR mismatch).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(VIEW_MODE_KEY);
    if (saved === 'grid' || saved === 'list') setView(saved);
  }, []);
  function setViewPersisted(next: ViewMode) {
    setView(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEW_MODE_KEY, next);
    }
  }

  // Build the filter dropdown option lists from the source data so the
  // operator never sees a value that wouldn't actually match anything.
  const allSites = useMemo(
    () => Array.from(new Set(items.map((o) => o.site_name).filter(Boolean))).sort() as string[],
    [items],
  );
  const allTypes = useMemo(
    () => Array.from(new Set(items.map((o) => o.occurrence_type))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const q = filters.q.toLowerCase().trim();
    return items.filter((o) => {
      if (q) {
        const hay = `${o.ob_number ?? ''} ${o.occurrence_type} ${o.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.severity && o.severity !== filters.severity) return false;
      if (filters.site && o.site_name !== filters.site) return false;
      if (filters.type && o.occurrence_type !== filters.type) return false;
      return true;
    });
  }, [items, filters]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((o) => selected.has(o.id));

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((o) => next.delete(o.id));
      else filtered.forEach((o) => next.add(o.id));
      return next;
    });
  }
  function clearSelection() { setSelected(new Set()); }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-green-500" />
          <p className="text-lg font-semibold">All caught up</p>
          <p className="text-sm text-[hsl(var(--muted))]">No occurrences are awaiting acknowledgement.</p>
        </CardContent>
      </Card>
    );
  }

  const selectedItems = filtered.filter((o) => selected.has(o.id));

  return (
    <>
      {/* ----- Filters ----- */}
      <Card className="mb-3">
        <CardContent className="grid gap-3 py-3 md:grid-cols-4">
          <div className="md:col-span-1">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted))]" />
              <Input
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                placeholder="OB#, type, description…"
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Severity</Label>
            <Select
              value={filters.severity}
              onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value as SeverityLevel | '' }))}
            >
              <option value="">All</option>
              {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Site</Label>
            <Select
              value={filters.site}
              onChange={(e) => setFilters((f) => ({ ...f, site: e.target.value }))}
            >
              <option value="">All</option>
              {allSites.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select
              value={filters.type}
              onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="">All</option>
              {allTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ----- Toolbar (count + view toggle + select-all) ----- */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleAllFiltered}
              aria-label="Select all visible"
              className="h-4 w-4"
            />
            <span className="text-[hsl(var(--muted))]">
              {selected.size > 0
                ? `${selected.size} selected · ${filtered.length} visible`
                : `${filtered.length} of ${items.length}`}
            </span>
          </label>
        </div>
        <ViewToggle value={view} onChange={setViewPersisted} />
      </div>

      {/* ----- Items ----- */}
      {view === 'grid' ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((o) => (
            <GridCard
              key={o.id}
              occurrence={o}
              selected={selected.has(o.id)}
              onToggleSelect={() => toggleOne(o.id)}
              onReview={() => setTarget(o)}
            />
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-[hsl(var(--muted))]">
              No occurrences match these filters.
            </p>
          )}
        </div>
      ) : (
        <ListRows
          items={filtered}
          selected={selected}
          onToggleSelect={toggleOne}
          onReview={(o) => setTarget(o)}
        />
      )}

      {/* ----- Floating bulk action bar ----- */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-30 mt-4">
          <Card className="flex flex-wrap items-center gap-2 border-brand/40 bg-[hsl(var(--surface))] p-2 shadow-lg">
            <span className="px-2 text-sm font-semibold">{selected.size} selected</span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setBulkAction('acknowledge')}>
                <Check className="h-4 w-4" /> Acknowledge all
              </Button>
              <Button size="sm" onClick={() => setBulkAction('close')}>
                <FileCheck className="h-4 w-4" /> Close & auto-report
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSelection}>
                <X className="h-4 w-4" /> Clear
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ----- Single-item review dialog ----- */}
      <DecisionDialog
        key={target?.id ?? 'dec'}
        target={target} onClose={() => setTarget(null)}
        reviewerId={reviewerId} reviewerName={reviewerName} orgId={orgId}
        onDone={() => { router.refresh(); clearSelection(); }}
      />

      {/* ----- Bulk action dialog ----- */}
      <BulkActionDialog
        key={bulkAction ?? 'bulk'}
        action={bulkAction}
        items={selectedItems}
        reviewerId={reviewerId}
        reviewerName={reviewerName}
        orgId={orgId}
        onClose={() => setBulkAction(null)}
        onDone={() => { router.refresh(); clearSelection(); }}
      />
    </>
  );
}

// ===========================================================================
// Grid card
// ===========================================================================
function GridCard({
  occurrence: o, selected, onToggleSelect, onReview,
}: {
  occurrence: Occurrence;
  selected: boolean;
  onToggleSelect: () => void;
  onReview: () => void;
}) {
  return (
    <Card className={`p-4 ${selected ? 'border-brand ring-1 ring-brand/40' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${o.ob_number}`}
            className="mt-1 h-4 w-4"
          />
          <Link href={`/occurrences/${o.id}`} className="font-semibold hover:text-brand">
            {o.ob_number}
          </Link>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <SeverityBadge severity={o.severity} />
          <StatusBadge status={o.status} />
        </div>
      </div>
      <p className="mt-1 text-sm font-medium">{o.occurrence_type}</p>
      <p className="mt-0.5 line-clamp-2 text-sm text-[hsl(var(--muted))]">{o.description}</p>
      <p className="mt-2 text-xs text-[hsl(var(--muted))]">
        {o.site_name ?? '—'} · {o.logged_by_name ?? '—'}
      </p>
      <p className="mt-0.5 text-[11px] text-[hsl(var(--muted))]">{formatDateTime(o.incident_at)}</p>

      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={onReview}>Review</Button>
      </div>
    </Card>
  );
}

// ===========================================================================
// List view
// ===========================================================================
function ListRows({
  items, selected, onToggleSelect, onReview,
}: {
  items: Occurrence[];
  selected: Set<number>;
  onToggleSelect: (id: number) => void;
  onReview: (o: Occurrence) => void;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="hidden grid-cols-[36px_110px_minmax(0,1fr)_120px_140px_140px_120px] gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-alt))] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted))] md:grid">
        <span />
        <span>OB#</span>
        <span>Type / description</span>
        <span>Severity</span>
        <span>Site</span>
        <span>Logged at</span>
        <span className="text-right">Action</span>
      </div>
      <ul className="divide-y divide-[hsl(var(--border))]">
        {items.map((o) => {
          const isSel = selected.has(o.id);
          return (
            <li
              key={o.id}
              className={`grid grid-cols-1 gap-2 px-4 py-3 transition-colors md:grid-cols-[36px_110px_minmax(0,1fr)_120px_140px_140px_120px] md:items-center md:gap-3 ${
                isSel ? 'bg-brand/5' : 'hover:bg-[hsl(var(--surface-alt))]'
              }`}
            >
              <input
                type="checkbox"
                checked={isSel}
                onChange={() => onToggleSelect(o.id)}
                aria-label={`Select ${o.ob_number}`}
                className="h-4 w-4 self-start md:self-center"
              />
              <Link href={`/occurrences/${o.id}`} className="font-semibold hover:text-brand">
                {o.ob_number}
              </Link>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{o.occurrence_type}</p>
                <p className="truncate text-xs text-[hsl(var(--muted))]">{o.description}</p>
                <p className="mt-0.5 text-[11px] text-[hsl(var(--muted))] md:hidden">
                  {o.site_name ?? '—'} · {formatDateTime(o.incident_at)}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <SeverityBadge severity={o.severity} />
                <StatusBadge status={o.status} />
              </div>
              <span className="hidden truncate text-xs text-[hsl(var(--muted))] md:inline">
                {o.site_name ?? '—'}
              </span>
              <span className="hidden text-xs text-[hsl(var(--muted))] md:inline">
                {formatDateTime(o.incident_at)}
              </span>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => onReview(o)}>Review</Button>
              </div>
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-[hsl(var(--muted))]">
            No occurrences match these filters.
          </li>
        )}
      </ul>
    </Card>
  );
}

// ===========================================================================
// View toggle (mirrors the live board)
// ===========================================================================
function ViewToggle({
  value, onChange,
}: { value: ViewMode; onChange: (next: ViewMode) => void }) {
  const baseBtn = 'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors';
  const active = 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm';
  const inactive = 'text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]';
  return (
    <div
      role="radiogroup"
      aria-label="View"
      className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-alt))] p-1"
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === 'grid'}
        onClick={() => onChange('grid')}
        className={`${baseBtn} ${value === 'grid' ? active : inactive}`}
      >
        <LayoutGrid className="h-4 w-4" /> Cards
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'list'}
        onClick={() => onChange('list')}
        className={`${baseBtn} ${value === 'list' ? active : inactive}`}
      >
        <List className="h-4 w-4" /> List
      </button>
    </div>
  );
}

// ===========================================================================
// Single-item review dialog (unchanged behaviour)
// ===========================================================================
function DecisionDialog({
  target, onClose, reviewerId, reviewerName, orgId, onDone,
}: {
  target: Occurrence | null;
  onClose: () => void;
  reviewerId: string;
  reviewerName: string;
  orgId: string | null;
  onDone: () => void;
}) {
  const [decision, setDecision] = useState<ManagerDecision>('acknowledged');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!notes.trim()) { setError('Notes are required.'); return; }
    if (!target) return;
    if (!orgId) {
      setError('Your profile has no organisation assigned — contact a super-user.');
      return;
    }
    setBusy(true); setError(null);
    const supabase = createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (supabase as any).from('manager_acknowledgements').insert({
      org_id: orgId,
      occurrence_id: target.id,
      ob_number: target.ob_number,
      reviewed_by: reviewerId,
      reviewed_by_name: reviewerName,
      decision,
      manager_notes: notes.trim(),
    });

    if (insErr) { setError(insErr.message); setBusy(false); return; }

    const nextStatus = decision === 'acknowledged' ? 'acknowledged'
      : decision === 'escalated' ? 'in_progress'
      : 'open';
    await supabase.from('occurrences')
      .update({ status: nextStatus, last_sla_update_at: new Date().toISOString() })
      .eq('id', target.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('occurrence_updates').insert({
      org_id: orgId,
      occurrence_id: target.id,
      ob_number: target.ob_number,
      notes: `[Manager review] ${MANAGER_DECISION_LABELS[decision]} — ${notes.trim()}`,
      status: nextStatus,
      updated_by: reviewerId,
      updated_by_name: reviewerName,
    });

    setBusy(false);
    onClose();
    onDone();
  }

  if (!target) return null;

  return (
    <Dialog open={!!target} onClose={onClose} title={`Review ${target.ob_number}`}>
      <div className="space-y-3">
        <div className="rounded-lg border bg-slate-50 p-3 text-sm dark:bg-slate-800/40">
          <p className="font-medium">{target.occurrence_type}</p>
          <p className="mt-0.5 text-xs text-[hsl(var(--muted))]">
            {target.site_name ?? '—'} · {formatDateTime(target.incident_at)}
          </p>
          <p className="mt-2 line-clamp-3 text-sm">{target.description}</p>
        </div>

        <div>
          <Label>Decision</Label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {MANAGER_DECISIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDecision(d)}
                className={`rounded-lg border p-2 text-sm font-semibold transition ${
                  decision === d
                    ? 'border-transparent text-white'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                }`}
                style={decision === d ? { backgroundColor: MANAGER_DECISION_COLORS[d] } : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {d === 'acknowledged' && <ShieldCheck className="h-4 w-4" />}
                  {d === 'escalated' && <AlertTriangle className="h-4 w-4" />}
                  {d === 'rejected' && <XCircle className="h-4 w-4" />}
                  {MANAGER_DECISION_LABELS[d]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Notes *</Label>
          <Textarea
            value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="What did you find? What action did you take?"
            className="min-h-[100px]"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit Review
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ===========================================================================
// Bulk action dialog — acknowledge many or close many (auto-report on close).
// ===========================================================================
function BulkActionDialog({
  action, items, reviewerId, reviewerName, orgId, onClose, onDone,
}: {
  action: null | 'acknowledge' | 'close';
  items: Occurrence[];
  reviewerId: string;
  reviewerName: string;
  orgId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the affirmation + signature whenever the dialog opens for a fresh
  // batch — never carry over a stale sign-off.
  useEffect(() => {
    if (action) { setConfirmed(false); setSignature(null); setNotes(''); setError(null); }
  }, [action]);

  if (!action || items.length === 0) return null;

  const title = action === 'acknowledge'
    ? `Acknowledge ${items.length} occurrence${items.length === 1 ? '' : 's'}`
    : `Close ${items.length} occurrence${items.length === 1 ? '' : 's'} & auto-report`;

  const canSubmit = confirmed && !!signature && notes.trim().length > 0;

  // Surfaces the most useful message we can pull out of whatever supabase-js
  // (or anything else) throws. PostgrestError has the structured fields; raw
  // Error objects have .message; plain strings just pass through. Without
  // this, the bulk catch reported "Bulk action failed" with no clue why.
  function describe(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (e && typeof e === 'object') {
      const obj = e as { message?: string; details?: string; hint?: string; code?: string };
      const parts = [obj.message, obj.details, obj.hint].filter(Boolean);
      const head = parts.join(' · ');
      return head || (obj.code ? `Postgres error ${obj.code}` : JSON.stringify(e));
    }
    return String(e);
  }

  async function run() {
    if (!notes.trim()) {
      setError("Notes are required — they'll be stamped on every selected occurrence.");
      return;
    }
    if (!confirmed) {
      setError('Tick the confirmation checkbox before submitting.');
      return;
    }
    if (!signature) {
      setError('Sign in the box below before submitting.');
      return;
    }
    if (!orgId) {
      setError('Your profile has no organisation assigned — contact a super-user.');
      return;
    }
    setBusy(true); setError(null);
    const supabase = createClient();
    const cleanNotes = notes.trim();
    const nowIso = new Date().toISOString();
    // One UUID per bulk action — every per-occurrence ack row created in this
    // batch shares it. Lets the audit log group N rows into a single "bulk
    // acknowledgement" entry, and lets us join back to the signature later.
    const bulkId =
      (globalThis.crypto && 'randomUUID' in globalThis.crypto)
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      if (action === 'acknowledge') {
        // Insert one ack per occurrence (table has its own RLS / triggers).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ackPayload = items.map((o) => ({
          org_id: orgId,
          occurrence_id: o.id,
          ob_number: o.ob_number,
          reviewed_by: reviewerId,
          reviewed_by_name: reviewerName,
          decision: 'acknowledged' as ManagerDecision,
          manager_notes: cleanNotes,
          signature_data_url: signature,
          bulk_id: bulkId,
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: ackErr } = await (supabase as any).from('manager_acknowledgements').insert(ackPayload);
        if (ackErr) throw ackErr;

        await supabase.from('occurrences')
          .update({ status: 'acknowledged', last_sla_update_at: nowIso })
          .in('id', items.map((o) => o.id));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updErr } = await (supabase as any).from('occurrence_updates').insert(items.map((o) => ({
          org_id: orgId,
          occurrence_id: o.id,
          ob_number: o.ob_number,
          notes: `[Manager review · bulk] Acknowledged — ${cleanNotes}`,
          status: 'acknowledged' as const,
          updated_by: reviewerId,
          updated_by_name: reviewerName,
        })));
        if (updErr) throw updErr;
      } else {
        // action === 'close'
        // 1. Find which occurrences already have a report — only auto-generate
        //    for the ones that don't.
        const ids = items.map((o) => o.id);
        const { data: existing } = await supabase
          .from('occurrence_reports')
          .select('occurrence_id')
          .in('occurrence_id', ids);
        const haveReport = new Set((existing ?? []).map((r) => r.occurrence_id));
        const needAutoReport = items.filter((o) => !haveReport.has(o.id));

        // 2. Insert auto-stub reports for the ones missing them.
        if (needAutoReport.length > 0) {
          // Body shared between the two attempts (with/without auto_generated)
          // so the migration-not-applied path falls back gracefully.
          const baseStub = (o: Occurrence) => ({
            org_id: orgId,
            occurrence_id: o.id,
            ob_number: o.ob_number,
            severity: o.severity,
            occurrence_type: o.occurrence_type,
            incident_at: o.incident_at,
            location: o.site_name,
            reported_by: o.logged_by_name,
            description:
              `[AUTO-GENERATED ${formatDateTime(nowIso)}]\n\n` +
              `Closed in bulk by ${reviewerName}.\n\n` +
              `Manager note:\n${cleanNotes}\n\n` +
              `Original incident description:\n${o.description}`,
            immediate_actions: 'See manager note.',
            next_steps: 'None — incident closed at bulk review.',
            created_by: reviewerId,
            created_by_name: reviewerName,
            status: 'closed' as const,
          });

          const stubsWithFlag = needAutoReport.map((o) => ({
            ...baseStub(o),
            auto_generated: true,
          }));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: rptErr } = await (supabase as any).from('occurrence_reports').insert(stubsWithFlag);
          if (rptErr) {
            // Postgres 42703 = undefined_column. Happens when the migration
            // for `auto_generated` hasn't been applied yet — retry without
            // the flag so the bulk close still succeeds and we surface a
            // warning instead of failing the whole batch.
            const code = (rptErr as { code?: string }).code;
            if (code === '42703') {
              const stubsNoFlag = needAutoReport.map(baseStub);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { error: retryErr } = await (supabase as any).from('occurrence_reports').insert(stubsNoFlag);
              if (retryErr) throw retryErr;
              // eslint-disable-next-line no-console
              console.warn(
                'occurrence_reports.auto_generated column missing — reports created without the stamp. ' +
                'Apply migration 20260605000005_auto_generated_reports.sql to enable it.',
              );
            } else {
              throw rptErr;
            }
          }
        }

        // 3. Manager ack rows — all share the same bulk_id + signature so
        //    the audit log can render this as one signed bulk action.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ackPayload = items.map((o) => ({
          org_id: orgId,
          occurrence_id: o.id,
          ob_number: o.ob_number,
          reviewed_by: reviewerId,
          reviewed_by_name: reviewerName,
          decision: 'acknowledged' as ManagerDecision,
          manager_notes: cleanNotes,
          signature_data_url: signature,
          bulk_id: bulkId,
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: ackErr } = await (supabase as any).from('manager_acknowledgements').insert(ackPayload);
        if (ackErr) throw ackErr;

        // 4. Flip statuses to closed.
        await supabase.from('occurrences')
          .update({ status: 'closed', closed_at: nowIso, last_sla_update_at: nowIso })
          .in('id', ids);

        // 5. Timeline entry.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updErr } = await (supabase as any).from('occurrence_updates').insert(items.map((o) => ({
          org_id: orgId,
          occurrence_id: o.id,
          ob_number: o.ob_number,
          notes:
            `[Manager review · bulk] Closed with auto-generated report — ${cleanNotes}`,
          status: 'closed' as const,
          updated_by: reviewerId,
          updated_by_name: reviewerName,
        })));
        if (updErr) throw updErr;
      }

      setBusy(false);
      setNotes('');
      onClose();
      onDone();
    } catch (e) {
      setBusy(false);
      setError(describe(e));
    }
  }

  return (
    <Dialog open={!!action} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="rounded-lg border bg-slate-50 p-3 text-sm dark:bg-slate-800/40">
          <p className="font-semibold">{items.length} occurrence{items.length === 1 ? '' : 's'} will be updated:</p>
          <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-[hsl(var(--muted))]">
            {items.map((o) => (
              <li key={o.id} className="truncate">
                <span className="font-mono">{o.ob_number}</span> · {o.occurrence_type} · {o.site_name ?? '—'}
              </li>
            ))}
          </ul>
          {action === 'close' && (
            <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Any occurrence without a report will get an <strong>auto-generated</strong> one
              stamped with your manager note. Existing reports are left untouched.
            </p>
          )}
        </div>

        <div>
          <Label>Manager notes *</Label>
          <Textarea
            value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder={action === 'close'
              ? 'Why are these being closed? This text is stamped on every auto-generated report.'
              : 'Manager review notes…'}
            className="min-h-[100px]"
          />
        </div>

        {/* Affirmation gate — the user has to consciously confirm before
            the submit button unlocks. Mirrors the legal "I have read and
            understood" pattern on policy acceptance forms. */}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            I, <strong>{reviewerName}</strong>, acknowledge all <strong>{items.length}</strong>{' '}
            occurrence{items.length === 1 ? '' : 's'} listed above and accept manager
            responsibility for {action === 'close' ? 'closing' : 'acknowledging'} them.
          </span>
        </label>

        {/* Digital signature — drawn directly into a canvas. Captured as a
            PNG data URL and stored on every per-occurrence ack row so any
            future audit can verify the manager signed for THIS batch. */}
        <div>
          <Label>Signature *</Label>
          <SignaturePad onChange={setSignature} height={140} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={run} disabled={busy || !canSubmit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {action === 'close' ? 'Close & generate reports' : 'Acknowledge all'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
