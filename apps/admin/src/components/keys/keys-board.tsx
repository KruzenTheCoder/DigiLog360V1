'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, KeyRound, RotateCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import type { Site } from '@digilog/shared';

interface KeyRow {
  id: string; site_id: string | null; code: string; label: string;
  description: string | null; is_active: boolean;
}
interface HandoverRow {
  id: number; key_id: string; taken_by: string; taken_by_id_num: string | null;
  taken_at: string; taken_from_name: string | null;
  returned_at: string | null; returned_to_name: string | null; notes: string | null;
}

export function KeysBoard({
  sites, keys, handovers, currentUserId, currentUserName,
}: {
  sites: Site[]; keys: KeyRow[]; handovers: HandoverRow[];
  currentUserId: string; currentUserName: string;
}) {
  const router = useRouter();
  const [addKeyOpen, setAddKeyOpen] = useState(false);
  const [handoverTarget, setHandoverTarget] = useState<KeyRow | null>(null);
  const siteName = (id: string | null) => sites.find((s) => s.id === id)?.name ?? '—';

  const openByKey = useMemo(() => {
    const m = new Map<string, HandoverRow>();
    handovers.forEach((h) => {
      if (!h.returned_at && !m.has(h.key_id)) m.set(h.key_id, h);
    });
    return m;
  }, [handovers]);

  async function returnKey(h: HandoverRow) {
    if (!confirm('Mark this key as returned?')) return;
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('key_handovers').update({
      returned_at: new Date().toISOString(),
      returned_to: currentUserId,
      returned_to_name: currentUserName,
    }).eq('id', h.id);
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[hsl(var(--muted))]">
          {openByKey.size} of {keys.length} keys are currently signed out.
        </p>
        <Button onClick={() => setAddKeyOpen(true)}><Plus className="h-4 w-4" /> Add key</Button>
      </div>

      <Card className="mb-5 p-4">
        <Table>
          <THead><TR>
            <TH>Code</TH><TH>Label</TH><TH>Site</TH><TH>Status</TH><TH>Held by</TH><TH></TH>
          </TR></THead>
          <TBody>
            {keys.map((k) => {
              const out = openByKey.get(k.id);
              return (
                <TR key={k.id}>
                  <TD className="font-mono">{k.code}</TD>
                  <TD className="font-medium">{k.label}</TD>
                  <TD>{siteName(k.site_id)}</TD>
                  <TD>{out ? <Badge color="#ea580c">Out</Badge> : <Badge color="#16a34a">Available</Badge>}</TD>
                  <TD className="text-xs">{out ? `${out.taken_by} · since ${formatDateTime(out.taken_at)}` : '—'}</TD>
                  <TD className="text-right">
                    {out ? (
                      <Button size="sm" onClick={() => returnKey(out)}>
                        <RotateCw className="h-4 w-4" /> Return
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => setHandoverTarget(k)}>
                        <KeyRound className="h-4 w-4" /> Hand over
                      </Button>
                    )}
                  </TD>
                </TR>
              );
            })}
            {keys.length === 0 && (
              <TR><TD colSpan={6} className="py-8 text-center text-[hsl(var(--muted))]">
                No keys registered yet.
              </TD></TR>
            )}
          </TBody>
        </Table>
      </Card>

      <Card className="p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
          Recent handovers
        </p>
        <Table>
          <THead><TR><TH>Key</TH><TH>Taken by</TH><TH>Taken at</TH><TH>Returned</TH></TR></THead>
          <TBody>
            {handovers.slice(0, 30).map((h) => {
              const k = keys.find((kk) => kk.id === h.key_id);
              return (
                <TR key={h.id}>
                  <TD>{k ? `${k.code} · ${k.label}` : h.key_id.slice(0, 8)}</TD>
                  <TD>{h.taken_by}</TD>
                  <TD className="text-xs">{formatDateTime(h.taken_at)}</TD>
                  <TD className="text-xs">
                    {h.returned_at ? formatDateTime(h.returned_at) : <Badge color="#ea580c">Open</Badge>}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <AddKeyDialog open={addKeyOpen} onClose={() => setAddKeyOpen(false)} sites={sites} onDone={() => router.refresh()} />
      <HandoverDialog
        target={handoverTarget} onClose={() => setHandoverTarget(null)}
        currentUserId={currentUserId} currentUserName={currentUserName}
        onDone={() => { setHandoverTarget(null); router.refresh(); }}
      />
    </>
  );
}

function AddKeyDialog({
  open, onClose, sites, onDone,
}: { open: boolean; onClose: () => void; sites: Site[]; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!code.trim() || !label.trim()) { setError('Code and label required.'); return; }
    setBusy(true); setError(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (supabase as any).from('keys').insert({
      code: code.trim().toUpperCase(), label: label.trim(), site_id: siteId || null,
    });
    setBusy(false);
    if (insErr) { setError(insErr.message); return; }
    onClose(); onDone();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add key">
      <div className="space-y-3">
        <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="MG-01" /></div>
        <div><Label>Label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Main gate padlock" /></div>
        <div>
          <Label>Site</Label>
          <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">—</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Add</Button>
        </div>
      </div>
    </Dialog>
  );
}

function HandoverDialog({
  target, onClose, currentUserId, currentUserName, onDone,
}: {
  target: KeyRow | null; onClose: () => void;
  currentUserId: string; currentUserName: string; onDone: () => void;
}) {
  const [takenBy, setTakenBy] = useState('');
  const [idNum, setIdNum] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!takenBy.trim()) { setError('Recipient name required.'); return; }
    if (!target) return;
    setBusy(true); setError(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (supabase as any).from('key_handovers').insert({
      key_id: target.id,
      taken_by: takenBy.trim(),
      taken_by_id_num: idNum || null,
      taken_from: currentUserId,
      taken_from_name: currentUserName,
    });
    setBusy(false);
    if (insErr) { setError(insErr.message); return; }
    setTakenBy(''); setIdNum('');
    onClose(); onDone();
  }

  if (!target) return null;
  return (
    <Dialog open={!!target} onClose={onClose} title={`Hand over ${target.code} — ${target.label}`}>
      <div className="space-y-3">
        <div><Label>Taken by</Label><Input value={takenBy} onChange={(e) => setTakenBy(e.target.value)} /></div>
        <div><Label>ID / employee number (optional)</Label><Input value={idNum} onChange={(e) => setIdNum(e.target.value)} /></div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Hand over</Button>
        </div>
      </div>
    </Dialog>
  );
}
