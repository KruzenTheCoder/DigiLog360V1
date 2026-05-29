'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Pencil } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import type { Site } from '@digilog/shared';

export function SitesManager({ sites }: { sites: Site[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Site | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Site</Button>
      </div>
      <Card className="p-4">
        <Table>
          <THead><TR><TH>Name</TH><TH>Code</TH><TH>Address</TH><TH>Status</TH><TH></TH></TR></THead>
          <TBody>
            {sites.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.name}</TD>
                <TD>{s.code ?? '—'}</TD>
                <TD>{s.address ?? '—'}</TD>
                <TD>{s.is_active ? <Badge color="#16a34a">Active</Badge> : <Badge color="#64748b">Inactive</Badge>}</TD>
                <TD className="text-right"><Button variant="ghost" size="icon" onClick={() => setEdit(s)}><Pencil className="h-4 w-4" /></Button></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <SiteDialog key={addOpen ? 'site-open' : 'site'} open={addOpen} onClose={() => setAddOpen(false)} onDone={() => router.refresh()} />
      <SiteDialog key={edit?.id ?? 'site-edit'} open={!!edit} onClose={() => setEdit(null)} site={edit} onDone={() => router.refresh()} />
    </>
  );
}

function SiteDialog({ open, onClose, site, onDone }: { open: boolean; onClose: () => void; site?: Site | null; onDone: () => void }) {
  const [name, setName] = useState(site?.name ?? '');
  const [code, setCode] = useState(site?.code ?? '');
  const [address, setAddress] = useState(site?.address ?? '');
  const [active, setActive] = useState(site?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setError('Name is required.'); return; }
    setBusy(true); setError(null);
    const supabase = createClient();
    const payload = { name: name.trim(), code: code || null, address: address || null, is_active: active };
    const { error: e } = site
      ? await supabase.from('sites').update(payload).eq('id', site.id)
      : await supabase.from('sites').insert(payload);
    setBusy(false);
    if (e) { setError(e.message); return; }
    onClose(); onDone();
  }

  return (
    <Dialog open={open} onClose={onClose} title={site ? 'Edit Site' : 'Add Site'}>
      <div className="space-y-3">
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SAN" /></div>
        <div><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button></div>
      </div>
    </Dialog>
  );
}
