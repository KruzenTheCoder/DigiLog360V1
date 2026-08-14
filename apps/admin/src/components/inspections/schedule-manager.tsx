'use client';

// Recurring inspection rules.
//
// Creating a rule generates nothing on its own — it calls
// generate_inspection_visits() straight afterwards so the calendar fills in
// immediately rather than waiting for the nightly roll-forward. The nightly
// job then keeps the horizon topped up.

import { useState } from 'react';
import { AlertCircle, Check, CalendarClock, Loader2, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface Schedule {
  id: string;
  site_id: string;
  title: string;
  instructions: string | null;
  assignee_ids: string[];
  frequency: string;
  interval_n: number;
  days_of_week: number[];
  day_of_month: number | null;
  due_time: string;
  window_minutes: number;
  checklist: Array<{ id: string; label: string }>;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
}

const DOW = [
  { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' }, { v: 4, l: 'Thu' },
  { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }, { v: 0, l: 'Sun' },
];

export function ScheduleManager({
  initial, sites, people,
}: {
  initial: Schedule[];
  sites: Array<{ id: string; name: string; latitude: number | null }>;
  people: Array<{ id: string; full_name: string | null; role: string }>;
}) {
  const [rules, setRules] = useState<Schedule[]>(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // form
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [title, setTitle] = useState('Weekly site inspection');
  const [instructions, setInstructions] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [frequency, setFrequency] = useState('weekly');
  const [intervalN, setIntervalN] = useState(1);
  const [days, setDays] = useState<number[]>([1]);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [dueTime, setDueTime] = useState('09:00');
  const [windowMinutes, setWindowMinutes] = useState(240);
  const [checklistText, setChecklistText] = useState(
    'Perimeter fence intact\nLighting operational\nAccess control working\nFire equipment in date',
  );

  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? '—';
  const personName = (id: string) => people.find((p) => p.id === id)?.full_name ?? 'Unknown';

  function describe(r: Schedule) {
    const every = r.interval_n > 1 ? `every ${r.interval_n} ` : 'every ';
    if (r.frequency === 'daily') return `${every}${r.interval_n > 1 ? 'days' : 'day'} at ${r.due_time.slice(0, 5)}`;
    if (r.frequency === 'weekly') {
      const names = (r.days_of_week ?? []).map((d) => DOW.find((x) => x.v === d)?.l).filter(Boolean).join(', ');
      return `${every}${r.interval_n > 1 ? 'weeks' : 'week'} on ${names || '—'} at ${r.due_time.slice(0, 5)}`;
    }
    return `${every}${r.interval_n > 1 ? 'months' : 'month'} on day ${r.day_of_month} at ${r.due_time.slice(0, 5)}`;
  }

  async function create() {
    if (!siteId || assignees.length === 0) {
      setMsg({ kind: 'error', text: 'Pick a site and at least one person to carry out the inspection.' });
      return;
    }
    if (frequency === 'weekly' && days.length === 0) {
      setMsg({ kind: 'error', text: 'Choose at least one day of the week.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabase;
    const checklist = checklistText.split('\n').map((l) => l.trim()).filter(Boolean)
      .map((label, i) => ({ id: `c${i + 1}`, label }));

    const { data, error } = await sb.from('inspection_schedules').insert({
      site_id: siteId, title: title.trim() || 'Site inspection',
      instructions: instructions.trim() || null,
      assignee_ids: assignees,
      frequency, interval_n: intervalN,
      days_of_week: frequency === 'weekly' ? days : [],
      day_of_month: frequency === 'monthly' ? dayOfMonth : null,
      due_time: dueTime, window_minutes: windowMinutes,
      checklist,
      starts_on: new Date().toISOString().slice(0, 10),
    }).select().single();

    if (error) {
      setBusy(false);
      setMsg({ kind: 'error', text: error.message });
      return;
    }

    // Fill the calendar now rather than at midnight.
    const { data: made } = await sb.rpc('generate_inspection_visits', { horizon_days: 60 });
    setBusy(false);
    setRules((r) => [data as Schedule, ...r]);
    setOpen(false);
    setMsg({ kind: 'ok', text: `Schedule created — ${made ?? 0} inspection${made === 1 ? '' : 's'} added to the calendar.` });
  }

  async function remove(id: string) {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabase;
    const { error } = await sb.from('inspection_schedules').delete().eq('id', id);
    if (error) { setMsg({ kind: 'error', text: error.message }); return; }
    setRules((r) => r.filter((x) => x.id !== id));
    setMsg({ kind: 'ok', text: 'Schedule removed. Its future visits were removed with it.' });
  }

  async function toggle(r: Schedule) {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabase;
    await sb.from('inspection_schedules').update({ is_active: !r.is_active }).eq('id', r.id);
    setRules((rs) => rs.map((x) => (x.id === r.id ? { ...x, is_active: !x.is_active } : x)));
  }

  return (
    <div className="space-y-5">
      {msg && (
        <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
          msg.kind === 'ok'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
            : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200'
        }`}>
          {msg.kind === 'ok' ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {!open && (
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New schedule</Button>
      )}

      {open && (
        <Card>
          <CardContent className="space-y-4 py-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <Label>Site</Label>
                <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.latitude == null ? ' (no coordinates)' : ''}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label>Due time</Label>
                <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
              </div>
              <div>
                <Label>Repeats</Label>
                <Select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </Select>
              </div>
              <div>
                <Label>Every</Label>
                <Select value={String(intervalN)} onChange={(e) => setIntervalN(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n} {frequency === 'daily' ? 'day' : frequency === 'weekly' ? 'week' : 'month'}{n > 1 ? 's' : ''}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Must be done within</Label>
                <Select value={String(windowMinutes)} onChange={(e) => setWindowMinutes(Number(e.target.value))}>
                  <option value="120">2 hours</option>
                  <option value="240">4 hours</option>
                  <option value="480">8 hours</option>
                  <option value="1440">24 hours</option>
                </Select>
              </div>
            </div>

            {frequency === 'weekly' && (
              <div>
                <Label>On these days</Label>
                <div className="flex flex-wrap gap-2">
                  {DOW.map((d) => (
                    <button
                      key={d.v}
                      type="button"
                      onClick={() => setDays((ds) => ds.includes(d.v) ? ds.filter((x) => x !== d.v) : [...ds, d.v])}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                        days.includes(d.v)
                          ? 'border-[hsl(var(--brand))] bg-[hsl(var(--brand))] text-white'
                          : 'border-[hsl(var(--border))] hover:border-[hsl(var(--brand))]'
                      }`}
                    >{d.l}</button>
                  ))}
                </div>
              </div>
            )}

            {frequency === 'monthly' && (
              <div className="max-w-[12rem]">
                <Label>Day of month</Label>
                <Input type="number" min={1} max={31} value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Number(e.target.value))} />
              </div>
            )}

            <div>
              <Label>Who carries it out</Label>
              <div className="max-h-44 overflow-y-auto rounded-lg border p-2">
                {people.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 px-1 py-1 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[hsl(var(--brand))]"
                      checked={assignees.includes(p.id)}
                      onChange={() => setAssignees((a) =>
                        a.includes(p.id) ? a.filter((x) => x !== p.id) : [...a, p.id])}
                    />
                    <span>{p.full_name ?? 'Unnamed'}</span>
                    <span className="text-xs text-[hsl(var(--muted))]">{p.role}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-[hsl(var(--muted))]">
                Each person gets their own inspection to check into, so attendance is tracked individually.
              </p>
            </div>

            <div>
              <Label>Checklist — one item per line</Label>
              <Textarea rows={4} value={checklistText} onChange={(e) => setChecklistText(e.target.value)} />
            </div>

            <div>
              <Label>Instructions (optional)</Label>
              <Textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)}
                placeholder="Anything the inspector should know before arriving." />
            </div>

            <div className="flex gap-2">
              <Button onClick={create} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create schedule
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {rules.length === 0 && (
          <Card><CardContent className="py-8 text-center text-sm text-[hsl(var(--muted))]">
            No inspection schedules yet.
          </CardContent></Card>
        )}
        {rules.map((r) => (
          <Card key={r.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{r.title}</p>
                  <Badge color={r.is_active ? '#16a34a' : '#64748b'}>{r.is_active ? 'Active' : 'Paused'}</Badge>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-[hsl(var(--muted))]">
                  <CalendarClock className="h-3.5 w-3.5" /> {siteName(r.site_id)} · {describe(r)}
                </p>
                <p className="mt-1 text-xs text-[hsl(var(--muted))]">
                  {(r.assignee_ids ?? []).map(personName).join(', ') || 'Nobody assigned'}
                  {r.checklist?.length ? ` · ${r.checklist.length} checklist items` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => toggle(r)}>
                  {r.is_active ? 'Pause' : 'Resume'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(r.id)} title="Delete">
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
