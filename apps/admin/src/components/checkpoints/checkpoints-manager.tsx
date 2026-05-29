'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, Plus, Pencil, QrCode, Printer, MapPin, Nfc } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { encodeCheckpointQr, type Checkpoint, type Site } from '@digilog/shared';

export function CheckpointsManager({ checkpoints, sites }: { checkpoints: Checkpoint[]; sites: Site[] }) {
  const router = useRouter();
  const [siteFilter, setSiteFilter] = useState('');
  const [edit, setEdit] = useState<Checkpoint | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [qr, setQr] = useState<Checkpoint | null>(null);

  const filtered = siteFilter ? checkpoints.filter((c) => c.site_id === siteFilter) : checkpoints;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} className="max-w-xs">
          <option value="">All sites</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Checkpoint</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-[hsl(var(--muted))]">{c.code ?? '—'}</p>
              </div>
              {c.is_active ? <Badge color="#16a34a">Active</Badge> : <Badge color="#64748b">Inactive</Badge>}
            </div>
            <div className="mt-3 space-y-1 text-xs text-[hsl(var(--muted))]">
              <p className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {c.latitude != null ? `${c.latitude.toFixed(5)}, ${c.longitude?.toFixed(5)} · ${c.geofence_radius_m}m` : 'No GPS set'}</p>
              <p className="flex items-center gap-1"><Nfc className="h-3 w-3" /> {c.nfc_tag_id ?? 'No NFC tag'}</p>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => setQr(c)}><QrCode className="h-4 w-4" /> QR</Button>
              <Button size="sm" variant="ghost" onClick={() => setEdit(c)}><Pencil className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-sm text-[hsl(var(--muted))]">No checkpoints yet.</p>}
      </div>

      <CheckpointDialog key={addOpen ? 'cp-open' : 'cp'} open={addOpen} onClose={() => setAddOpen(false)} sites={sites} onDone={() => router.refresh()} />
      <CheckpointDialog key={edit?.id ?? 'cp-edit'} open={!!edit} onClose={() => setEdit(null)} sites={sites} checkpoint={edit} onDone={() => router.refresh()} />
      <QrDialog checkpoint={qr} onClose={() => setQr(null)} />
    </>
  );
}

function QrDialog({ checkpoint, onClose }: { checkpoint: Checkpoint | null; onClose: () => void }) {
  if (!checkpoint) return null;
  return (
    <Dialog open={!!checkpoint} onClose={onClose} title={`QR — ${checkpoint.name}`}>
      <div id="qr-print" className="flex flex-col items-center gap-3 py-2">
        <QRCodeSVG value={encodeCheckpointQr(checkpoint.qr_token)} size={220} level="M" includeMargin />
        <p className="text-lg font-bold">{checkpoint.name}</p>
        <p className="text-sm text-[hsl(var(--muted))]">{checkpoint.code}</p>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Print Label</Button>
      </div>
    </Dialog>
  );
}

function CheckpointDialog({
  open, onClose, sites, checkpoint, onDone,
}: { open: boolean; onClose: () => void; sites: Site[]; checkpoint?: Checkpoint | null; onDone: () => void }) {
  const [name, setName] = useState(checkpoint?.name ?? '');
  const [code, setCode] = useState(checkpoint?.code ?? '');
  const [siteId, setSiteId] = useState(checkpoint?.site_id ?? sites[0]?.id ?? '');
  const [nfc, setNfc] = useState(checkpoint?.nfc_tag_id ?? '');
  const [lat, setLat] = useState(checkpoint?.latitude?.toString() ?? '');
  const [lng, setLng] = useState(checkpoint?.longitude?.toString() ?? '');
  const [radius, setRadius] = useState(checkpoint?.geofence_radius_m?.toString() ?? '50');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !siteId) { setError('Name and site are required.'); return; }
    setBusy(true); setError(null);
    const supabase = createClient();
    const payload = {
      site_id: siteId, name: name.trim(), code: code || null, nfc_tag_id: nfc || null,
      latitude: lat ? Number(lat) : null, longitude: lng ? Number(lng) : null,
      geofence_radius_m: Number(radius) || 50,
    };
    const { error: e } = checkpoint
      ? await supabase.from('checkpoints').update(payload).eq('id', checkpoint.id)
      : await supabase.from('checkpoints').insert(payload);
    setBusy(false);
    if (e) { setError(e.message); return; }
    onClose(); onDone();
  }

  return (
    <Dialog open={open} onClose={onClose} title={checkpoint ? 'Edit Checkpoint' : 'Add Checkpoint'}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} /></div>
        </div>
        <div><Label>Site</Label>
          <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">Select…</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div><Label>NFC Tag ID (optional)</Label><Input value={nfc} onChange={(e) => setNfc(e.target.value)} placeholder="04:A2:39:…" /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Latitude</Label><Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-26.107" /></div>
          <div><Label>Longitude</Label><Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="28.056" /></div>
          <div><Label>Radius (m)</Label><Input value={radius} onChange={(e) => setRadius(e.target.value)} /></div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button></div>
      </div>
    </Dialog>
  );
}
