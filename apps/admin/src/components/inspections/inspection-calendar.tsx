'use client';

// Month calendar of scheduled inspections, with the selected visit opening in
// a side panel for check-in and reporting.
//
// The check-in button asks the browser for a location fix and posts it to the
// edge function, which stamps the time and computes the distance itself. The
// page never writes those values — it only supplies the raw fix.

import { useMemo, useState } from 'react';
import {
  AlertCircle, Check, ChevronLeft, ChevronRight, Clock, Loader2,
  MapPin, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label, Select, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface Visit {
  id: string; site_id: string; assigned_to: string | null;
  title: string; instructions: string | null;
  due_at: string; window_end: string; status: string;
  check_in_at: string | null; check_in_distance_m: number | null;
  check_in_within_geofence: boolean | null;
  completed_at: string | null;
  checklist: Array<{ id: string; label: string; done?: boolean; note?: string }>;
  findings: string | null; outcome: string | null;
}

const STATUS_TONE: Record<string, string> = {
  scheduled: '#3b82f6',
  checked_in: '#0891b2',
  completed: '#16a34a',
  missed: '#dc2626',
  cancelled: '#64748b',
};
const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled', checked_in: 'On site', completed: 'Completed',
  missed: 'Missed', cancelled: 'Cancelled',
};

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function InspectionCalendar({
  visits: initial, sites, people, currentUserId,
}: {
  visits: Visit[];
  sites: Array<{ id: string; name: string; latitude: number | null; longitude: number | null }>;
  people: Array<{ id: string; full_name: string | null }>;
  currentUserId: string;
}) {
  const [visits, setVisits] = useState<Visit[]>(initial);
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selected, setSelected] = useState<Visit | null>(null);

  const siteName = useMemo(
    () => new Map(sites.map((s) => [s.id, s.name])), [sites]);
  const personName = useMemo(
    () => new Map(people.map((p) => [p.id, p.full_name ?? 'Unassigned'])), [people]);

  // Monday-first grid covering the whole month.
  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Sunday(0) -> 6
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const byDay = useMemo(() => {
    const m = new Map<string, Visit[]>();
    for (const v of visits) {
      const k = new Date(v.due_at).toDateString();
      (m.get(k) ?? m.set(k, []).get(k)!).push(v);
    }
    return m;
  }, [visits]);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shift = (n: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));

  function patch(updated: Partial<Visit> & { id: string }) {
    setVisits((vs) => vs.map((v) => (v.id === updated.id ? { ...v, ...updated } : v)));
    setSelected((s) => (s && s.id === updated.id ? { ...s, ...updated } : s));
  }

  const today = new Date().toDateString();

  return (
    <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
      <Card>
        <CardContent className="py-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">{monthLabel}</h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => shift(-1)} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCursor(() => { const d = new Date(); d.setDate(1); return d; })}>
                Today
              </Button>
              <Button variant="ghost" size="sm" onClick={() => shift(1)} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-[hsl(var(--border))] text-xs">
            {DOW.map((d) => (
              <div key={d} className="bg-[hsl(var(--surface))] px-2 py-1.5 text-center font-semibold text-[hsl(var(--muted))]">
                {d}
              </div>
            ))}
            {grid.map((d) => {
              const dayVisits = byDay.get(d.toDateString()) ?? [];
              const inMonth = d.getMonth() === cursor.getMonth();
              return (
                <div
                  key={d.toISOString()}
                  className={`min-h-[5.5rem] bg-[hsl(var(--background))] p-1.5 ${inMonth ? '' : 'opacity-40'}`}
                >
                  <div className={`mb-1 text-right text-[11px] ${
                    d.toDateString() === today
                      ? 'font-bold text-[hsl(var(--brand))]'
                      : 'text-[hsl(var(--muted))]'
                  }`}>
                    {d.getDate()}
                  </div>
                  <div className="space-y-1">
                    {dayVisits.slice(0, 3).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelected(v)}
                        className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-medium text-white transition hover:opacity-85"
                        style={{ background: STATUS_TONE[v.status] ?? '#64748b' }}
                        title={`${v.title} — ${siteName.get(v.site_id) ?? ''}`}
                      >
                        {siteName.get(v.site_id) ?? v.title}
                      </button>
                    ))}
                    {dayVisits.length > 3 && (
                      <p className="px-1 text-[10px] text-[hsl(var(--muted))]">+{dayVisits.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-[hsl(var(--muted))]">
            {Object.entries(STATUS_LABEL).map(([k, label]) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_TONE[k] }} />
                {label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <VisitPanel
        visit={selected}
        siteName={selected ? siteName.get(selected.site_id) ?? '—' : ''}
        assigneeName={selected?.assigned_to ? personName.get(selected.assigned_to) ?? '—' : 'Unassigned'}
        isMine={!!selected && selected.assigned_to === currentUserId}
        siteHasCoords={
          !!selected && !!sites.find((s) => s.id === selected.site_id)?.latitude
        }
        onChange={patch}
      />
    </div>
  );
}

function VisitPanel({
  visit, siteName, assigneeName, isMine, siteHasCoords, onChange,
}: {
  visit: Visit | null;
  siteName: string;
  assigneeName: string;
  isMine: boolean;
  siteHasCoords: boolean;
  onChange: (v: Partial<Visit> & { id: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState('pass');
  const [items, setItems] = useState<Visit['checklist']>([]);
  const [lastCheckIn, setLastCheckIn] = useState<{ distance: number | null; within: boolean | null } | null>(null);

  // Re-seed the form whenever a different visit is opened.
  const [seenId, setSeenId] = useState<string | null>(null);
  if (visit && visit.id !== seenId) {
    setSeenId(visit.id);
    setItems(visit.checklist ?? []);
    setNote(visit.findings ?? '');
    setOutcome(visit.outcome ?? 'pass');
    setError(null);
    setLastCheckIn(null);
  }

  if (!visit) {
    return (
      <Card>
        <CardContent className="flex h-full min-h-[18rem] items-center justify-center py-10 text-center">
          <p className="text-sm text-[hsl(var(--muted))]">
            Select an inspection from the calendar to check in or file its report.
          </p>
        </CardContent>
      </Card>
    );
  }

  async function checkIn() {
    setError(null);
    if (!navigator.geolocation) {
      setError('This device cannot provide a location, so check-in is not possible here.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const supabase = createClient();
        const { data, error: err } = await supabase.functions.invoke('inspection-checkin', {
          body: {
            visit_id: visit!.id,
            action: 'check_in',
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy,
          },
        });
        setBusy(false);
        const d = data as {
          ok?: boolean; error?: string; checked_in_at?: string;
          distance_m?: number | null; within_geofence?: boolean | null;
        } | null;
        if (err || !d?.ok) { setError(d?.error ?? err?.message ?? 'Check-in failed.'); return; }
        setLastCheckIn({ distance: d.distance_m ?? null, within: d.within_geofence ?? null });
        onChange({
          id: visit!.id, status: 'checked_in',
          check_in_at: d.checked_in_at ?? new Date().toISOString(),
          check_in_distance_m: d.distance_m ?? null,
          check_in_within_geofence: d.within_geofence ?? null,
        });
      },
      (geoErr) => {
        setBusy(false);
        setError(
          geoErr.code === geoErr.PERMISSION_DENIED
            ? 'Location permission was denied. Check-in records where you were, so it cannot proceed without it.'
            : `Could not get a location fix: ${geoErr.message}`,
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  async function complete() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.functions.invoke('inspection-checkin', {
      body: {
        visit_id: visit!.id, action: 'complete',
        checklist: items, findings: note.trim() || null, outcome,
      },
    });
    setBusy(false);
    const d = data as { ok?: boolean; error?: string; completed_at?: string } | null;
    if (err || !d?.ok) { setError(d?.error ?? err?.message ?? 'Could not file the report.'); return; }
    onChange({
      id: visit!.id, status: 'completed',
      completed_at: d.completed_at ?? new Date().toISOString(),
      findings: note.trim() || null, outcome, checklist: items,
    });
  }

  const due = new Date(visit.due_at);
  const done = visit.status === 'completed';

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-bold">{visit.title}</h3>
            <Badge color={STATUS_TONE[visit.status] ?? '#64748b'}>
              {STATUS_LABEL[visit.status] ?? visit.status}
            </Badge>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-[hsl(var(--muted))]">
            <MapPin className="h-3.5 w-3.5" /> {siteName}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-[hsl(var(--muted))]">
            <Clock className="h-3.5 w-3.5" /> {due.toLocaleString()} · {assigneeName}
          </p>
        </div>

        {visit.instructions && (
          <p className="rounded-lg bg-[hsl(var(--surface))] px-3 py-2 text-sm">{visit.instructions}</p>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
          </div>
        )}

        {/* ── Presence ── */}
        {visit.check_in_at ? (
          <div className="rounded-lg border px-3 py-2 text-sm">
            <p className="flex items-center gap-2 font-medium">
              {visit.check_in_within_geofence === false
                ? <ShieldAlert className="h-4 w-4 text-amber-600" />
                : <ShieldCheck className="h-4 w-4 text-emerald-600" />}
              Checked in {new Date(visit.check_in_at).toLocaleTimeString()}
            </p>
            <p className="mt-1 text-xs text-[hsl(var(--muted))]">
              {visit.check_in_distance_m == null
                ? 'This site has no coordinates recorded, so the location could not be verified.'
                : `${Math.round(visit.check_in_distance_m)} m from the site centre — ${
                    visit.check_in_within_geofence ? 'inside' : 'outside'} the geofence.`}
              {lastCheckIn && lastCheckIn.within === false && ' Flagged for review.'}
            </p>
          </div>
        ) : (
          isMine && !done && (
            <div>
              <Button className="w-full" onClick={checkIn} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                {busy ? 'Getting your location…' : 'Check in at site'}
              </Button>
              <p className="mt-1.5 text-[11px] text-[hsl(var(--muted))]">
                {siteHasCoords
                  ? 'Records the time and your position as proof of attendance.'
                  : 'This site has no coordinates set, so your position will be recorded but not verified.'}
              </p>
            </div>
          )
        )}

        {/* ── Report ── */}
        {visit.check_in_at && (
          <div className="space-y-3 border-t pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
              Inspection report
            </p>

            {items.length > 0 && (
              <ul className="space-y-1.5">
                {items.map((it, i) => (
                  <li key={it.id ?? i}>
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-[hsl(var(--brand))]"
                        checked={!!it.done}
                        disabled={done}
                        onChange={() => setItems((xs) =>
                          xs.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
                      />
                      <span className={it.done ? 'text-[hsl(var(--muted))] line-through' : ''}>{it.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}

            <div>
              <Label>Findings</Label>
              <Textarea
                rows={3} value={note} disabled={done}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What did you find on site?"
              />
            </div>
            <div>
              <Label>Outcome</Label>
              <Select value={outcome} disabled={done} onChange={(e) => setOutcome(e.target.value)}>
                <option value="pass">Pass — nothing to report</option>
                <option value="issues">Issues found — needs follow-up</option>
                <option value="fail">Fail — immediate attention</option>
              </Select>
            </div>

            {done ? (
              <p className="flex items-center gap-2 text-sm text-emerald-600">
                <Check className="h-4 w-4" />
                Filed {visit.completed_at ? new Date(visit.completed_at).toLocaleString() : ''}
              </p>
            ) : (
              <Button className="w-full" onClick={complete} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} File report
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
