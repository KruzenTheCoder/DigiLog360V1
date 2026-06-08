'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, LogOut, Plus, Loader2, Users, Car } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import type { Site } from '@digilog/shared';

interface VisitorRow {
  id: string; full_name: string; id_number: string | null; company: string | null;
  vehicle_reg: string | null; visiting: string | null; reason: string | null;
  site_id: string | null; site_name: string | null;
  signed_in_at: string; signed_in_by_name: string | null;
  signed_out_at: string | null;
}

export function VisitorsBoard({
  initial, sites, currentUserId, currentUserName,
}: {
  initial: VisitorRow[]; sites: Site[]; currentUserId: string; currentUserName: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<VisitorRow[]>(initial);
  const [addOpen, setAddOpen] = useState(false);

  const onsite = items.filter((v) => !v.signed_out_at);
  const recent = items.filter((v) => v.signed_out_at);

  async function signOut(v: VisitorRow) {
    if (!confirm(`Sign ${v.full_name} out?`)) return;
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('visitors').update({
      signed_out_at: new Date().toISOString(),
      signed_out_by: currentUserId,
    }).eq('id', v.id);
    setItems((prev) => prev.map((p) => p.id === v.id ? { ...p, signed_out_at: new Date().toISOString() } : p));
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1 font-semibold">
            <Users className="h-4 w-4 text-brand" /> {onsite.length} on site
          </span>
          <span className="text-[hsl(var(--muted))]">{recent.length} recent</span>
        </div>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Sign in visitor</Button>
      </div>

      <Card className="mb-5 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
          On site
        </p>
        <Table>
          <THead><TR>
            <TH>Name</TH><TH>ID</TH><TH>Company</TH><TH>Vehicle</TH>
            <TH>Visiting</TH><TH>Site</TH><TH>Signed in</TH><TH></TH>
          </TR></THead>
          <TBody>
            {onsite.map((v) => (
              <TR key={v.id}>
                <TD className="font-medium">{v.full_name}</TD>
                <TD className="font-mono text-xs">{v.id_number ?? '—'}</TD>
                <TD>{v.company ?? '—'}</TD>
                <TD className="font-mono text-xs">{v.vehicle_reg ?? '—'}</TD>
                <TD>{v.visiting ?? '—'}</TD>
                <TD>{v.site_name ?? '—'}</TD>
                <TD className="whitespace-nowrap text-xs">{formatDateTime(v.signed_in_at)}</TD>
                <TD>
                  <Button size="sm" onClick={() => signOut(v)}>
                    <LogOut className="h-4 w-4" /> Out
                  </Button>
                </TD>
              </TR>
            ))}
            {onsite.length === 0 && (
              <TR><TD colSpan={8} className="py-6 text-center text-[hsl(var(--muted))]">
                No visitors currently on site.
              </TD></TR>
            )}
          </TBody>
        </Table>
      </Card>

      <Card className="p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
          Recent (signed out)
        </p>
        <Table>
          <THead><TR>
            <TH>Name</TH><TH>Company</TH><TH>Site</TH><TH>In</TH><TH>Out</TH>
          </TR></THead>
          <TBody>
            {recent.slice(0, 30).map((v) => (
              <TR key={v.id}>
                <TD>{v.full_name}</TD>
                <TD>{v.company ?? '—'}</TD>
                <TD>{v.site_name ?? '—'}</TD>
                <TD className="whitespace-nowrap text-xs">{formatDateTime(v.signed_in_at)}</TD>
                <TD className="whitespace-nowrap text-xs">{formatDateTime(v.signed_out_at)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <SignInDialog
        open={addOpen} onClose={() => setAddOpen(false)}
        sites={sites}
        currentUserId={currentUserId} currentUserName={currentUserName}
        onDone={(row) => { setItems((prev) => [row, ...prev]); setAddOpen(false); router.refresh(); }}
      />
    </>
  );
}

function SignInDialog({
  open, onClose, sites, currentUserId, currentUserName, onDone,
}: {
  open: boolean; onClose: () => void; sites: Site[];
  currentUserId: string; currentUserName: string;
  onDone: (row: VisitorRow) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [company, setCompany] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');
  const [visiting, setVisiting] = useState('');
  const [reason, setReason] = useState('');
  const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!fullName.trim()) { setError('Visitor name required.'); return; }
    setBusy(true); setError(null);
    const supabase = createClient();
    const siteName = sites.find((s) => s.id === siteId)?.name ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: insErr } = await (supabase as any).from('visitors').insert({
      full_name: fullName.trim(), id_number: idNumber || null,
      company: company || null, vehicle_reg: vehicleReg || null,
      visiting: visiting || null, reason: reason || null,
      site_id: siteId || null, site_name: siteName,
      signed_in_by: currentUserId, signed_in_by_name: currentUserName,
    }).select().single();
    setBusy(false);
    if (insErr) { setError(insErr.message); return; }
    onDone(data as VisitorRow);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Sign visitor in">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Full name *</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div><Label>ID / passport</Label><Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} /></div>
          <div><Label>Company</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} /></div>
          <div><Label>Vehicle registration</Label><Input value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value)} placeholder="GP 123 ABC" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Visiting</Label><Input value={visiting} onChange={(e) => setVisiting(e.target.value)} placeholder="Site contact" /></div>
          <div>
            <Label>Site</Label>
            <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">—</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        </div>
        <div><Label>Reason</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[60px]" /></div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} <LogIn className="h-4 w-4" /> Sign in
          </Button>
        </div>
      </div>
      <Car className="hidden" />
    </Dialog>
  );
}
