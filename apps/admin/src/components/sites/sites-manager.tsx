'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Pencil, Search, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import type { Site } from '@digilog/shared';

export function SitesManager({ sites, isSuperUser = false }: { sites: Site[]; isSuperUser?: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Site | null>(null);
  const [deleteSite, setDeleteSite] = useState<Site | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState<'all' | 'active' | 'inactive'>('all');

  const filtered = useMemo(() => {
    const needle = q.toLowerCase().trim();
    return sites.filter((s) => {
      if (active === 'active' && !s.is_active) return false;
      if (active === 'inactive' && s.is_active) return false;
      if (needle) {
        const hay = `${s.name} ${s.code ?? ''} ${s.address ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [sites, q, active]);

  async function handleDelete() {
    if (!deleteSite) return;
    const supabase = createClient();
    const { error } = await supabase.from('sites').delete().eq('id', deleteSite.id);
    if (error) {
      alert('Failed to delete site: ' + error.message);
    } else {
      setDeleteSite(null);
      router.refresh();
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted))]" />
            <Input className="w-64 pl-9" placeholder="Search name, code, address…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div role="tablist" className="inline-flex items-center gap-1 rounded-lg border bg-[hsl(var(--surface-alt))] p-1">
            {[
              { k: 'all', label: 'All' },
              { k: 'active', label: 'Active' },
              { k: 'inactive', label: 'Inactive' },
            ].map((t) => {
              const on = active === t.k;
              return (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setActive(t.k as 'all' | 'active' | 'inactive')}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition ${on ? 'bg-[hsl(var(--surface))] shadow-sm' : 'text-[hsl(var(--muted))]'}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <span className="text-xs text-[hsl(var(--muted))]">{filtered.length} of {sites.length}</span>
        </div>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Site</Button>
      </div>
      <Card className="p-4">
        <Table>
          <THead><TR><TH>Name</TH><TH>Code</TH><TH>Address</TH><TH>Status</TH><TH></TH></TR></THead>
          <TBody>
            {filtered.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.name}</TD>
                <TD>{s.code ?? '—'}</TD>
                <TD>{s.address ?? '—'}</TD>
                <TD>{s.is_active ? <Badge color="#16a34a">Active</Badge> : <Badge color="#64748b">Inactive</Badge>}</TD>
                <TD className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEdit(s)}><Pencil className="h-4 w-4" /></Button>
                    {isSuperUser && (
                      <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => setDeleteSite(s)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <SiteDialog key={addOpen ? 'site-open' : 'site'} open={addOpen} onClose={() => setAddOpen(false)} onDone={() => router.refresh()} />
      <SiteDialog key={edit?.id ?? 'site-edit'} open={!!edit} onClose={() => setEdit(null)} site={edit} onDone={() => router.refresh()} />
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteSite} onClose={() => setDeleteSite(null)} title="Delete Site">
        <div className="space-y-4">
          <p className="text-sm text-[hsl(var(--muted))]">
            Are you sure you want to delete <strong>{deleteSite?.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteSite(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Dialog>
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
