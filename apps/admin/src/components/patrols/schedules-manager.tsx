'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import type { PatrolRoute, Site } from '@digilog/shared';

interface Row {
  id: string; route_id: string; site_id: string | null; name: string;
  interval_minutes: number; start_hour: number; end_hour: number;
  grace_minutes: number; is_active: boolean;
}

export function SchedulesManager({
  routes, sites, initial,
}: { routes: PatrolRoute[]; sites: Site[]; initial: Row[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Row[]>(initial);
  const [addOpen, setAddOpen] = useState(false);

  async function toggle(r: Row) {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('patrol_schedules').update({ is_active: !r.is_active }).eq('id', r.id);
    setItems((prev) => prev.map((x) => x.id === r.id ? { ...x, is_active: !x.is_active } : x));
  }

  async function remove(id: string) {
    if (!confirm('Delete this schedule?')) return;
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('patrol_schedules').delete().eq('id', id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> New schedule</Button>
      </div>
      <Card>
        <CardContent className="pt-5">
          <Table>
            <THead><TR>
              <TH>Name</TH><TH>Route</TH><TH>Site</TH><TH>Every</TH>
              <TH>Window</TH><TH>Grace</TH><TH>Status</TH><TH></TH>
            </TR></THead>
            <TBody>
              {items.map((r) => {
                const route = routes.find((x) => x.id === r.route_id);
                const site = sites.find((x) => x.id === r.site_id);
                return (
                  <TR key={r.id}>
                    <TD className="font-medium">{r.name}</TD>
                    <TD>{route?.name ?? '—'}</TD>
                    <TD>{site?.name ?? '—'}</TD>
                    <TD>{r.interval_minutes < 60
                      ? `${r.interval_minutes}m`
                      : `${(r.interval_minutes / 60).toFixed(1)}h`}</TD>
                    <TD className="text-xs">{r.start_hour.toString().padStart(2, '0')}:00–{r.end_hour.toString().padStart(2, '0')}:00</TD>
                    <TD>{r.grace_minutes}m</TD>
                    <TD>{r.is_active ? <Badge color="#16a34a">Active</Badge> : <Badge color="#64748b">Off</Badge>}</TD>
                    <TD className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => toggle(r)}>
                        {r.is_active ? 'Disable' : 'Enable'}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(r.id)} title="Delete">
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </TD>
                  </TR>
                );
              })}
              {items.length === 0 && (
                <TR><TD colSpan={8} className="py-8 text-center text-[hsl(var(--muted))]">No schedules yet.</TD></TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <NewScheduleDialog
        open={addOpen} onClose={() => setAddOpen(false)}
        routes={routes} sites={sites}
        onDone={() => { setAddOpen(false); router.refresh(); }}
      />
    </>
  );
}

function NewScheduleDialog({
  open, onClose, routes, sites, onDone,
}: { open: boolean; onClose: () => void; routes: PatrolRoute[]; sites: Site[]; onDone: () => void }) {
  const [name, setName] = useState('');
  const [routeId, setRouteId] = useState<string>(routes[0]?.id ?? '');
  const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? '');
  const [interval, setInterval] = useState(120);
  const [startHour, setStartHour] = useState(18);
  const [endHour, setEndHour] = useState(6);
  const [grace, setGrace] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim() || !routeId) { setError('Name and route required.'); return; }
    setBusy(true); setError(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (supabase as any).from('patrol_schedules').insert({
      name: name.trim(), route_id: routeId, site_id: siteId || null,
      interval_minutes: interval, start_hour: startHour, end_hour: endHour, grace_minutes: grace,
    });
    setBusy(false);
    if (insErr) { setError(insErr.message); return; }
    onDone();
  }

  return (
    <Dialog open={open} onClose={onClose} title="New patrol schedule">
      <div className="space-y-3">
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Night sweep" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Route</Label>
            <Select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              <option value="">—</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Site (optional)</Label>
            <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">—</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Every (minutes)</Label><Input type="number" value={interval} onChange={(e) => setInterval(Number(e.target.value))} /></div>
          <div><Label>Start hour</Label><Input type="number" min={0} max={23} value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} /></div>
          <div><Label>End hour</Label><Input type="number" min={1} max={24} value={endHour} onChange={(e) => setEndHour(Number(e.target.value))} /></div>
        </div>
        <div><Label>Grace (minutes before alert)</Label><Input type="number" value={grace} onChange={(e) => setGrace(Number(e.target.value))} /></div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Create</Button>
        </div>
      </div>
    </Dialog>
  );
}
