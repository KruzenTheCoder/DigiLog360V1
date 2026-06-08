'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2, RefreshCw, Webhook } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';

interface Row {
  id: string; name: string; url: string; events: string[];
  is_active: boolean; last_status: number | null;
  last_delivered_at: string | null; created_at: string;
}

const ALL_EVENTS = [
  { v: 'occurrence.created', label: 'Occurrence created' },
  { v: 'occurrence.updated', label: 'Occurrence status changed' },
  { v: 'sla.breach', label: 'SLA breach' },
  { v: 'manager.acknowledged', label: 'Manager acknowledged' },
  { v: 'occurrence.assigned', label: 'Occurrence assigned' },
];

function randomSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function WebhooksManager({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [hooks, setHooks] = useState<Row[]>(initial);
  const [addOpen, setAddOpen] = useState(false);

  async function remove(id: string) {
    if (!confirm('Delete this webhook? Past deliveries will be preserved.')) return;
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('org_webhooks').delete().eq('id', id);
    setHooks((prev) => prev.filter((h) => h.id !== id));
  }

  async function toggleActive(row: Row) {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('org_webhooks').update({ is_active: !row.is_active }).eq('id', row.id);
    setHooks((prev) => prev.map((h) => (h.id === row.id ? { ...h, is_active: !h.is_active } : h)));
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[hsl(var(--muted))]">
          DigiLog signs each outbound request with HMAC-SHA256 in the <code>X-DigiLog-Signature</code> header. Use the secret to verify.
        </p>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> New webhook</Button>
      </div>

      <Card>
        <CardContent className="pt-5">
          <Table>
            <THead>
              <TR><TH>Name</TH><TH>URL</TH><TH>Events</TH><TH>Last delivery</TH><TH>Status</TH><TH></TH></TR>
            </THead>
            <TBody>
              {hooks.map((h) => (
                <TR key={h.id}>
                  <TD>
                    <div className="font-medium">{h.name}</div>
                    <Badge color={h.is_active ? '#16a34a' : '#64748b'}>{h.is_active ? 'Active' : 'Disabled'}</Badge>
                  </TD>
                  <TD className="font-mono text-xs">{h.url}</TD>
                  <TD className="text-xs">{h.events.join(', ')}</TD>
                  <TD className="text-xs text-[hsl(var(--muted))]">
                    {h.last_delivered_at ? formatDateTime(h.last_delivered_at) : '—'}
                  </TD>
                  <TD>
                    {h.last_status
                      ? <Badge color={h.last_status < 400 ? '#16a34a' : '#dc2626'}>{h.last_status}</Badge>
                      : '—'}
                  </TD>
                  <TD className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(h)}>
                      {h.is_active ? 'Disable' : 'Enable'}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(h.id)} title="Delete">
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </TD>
                </TR>
              ))}
              {hooks.length === 0 && (
                <TR><TD colSpan={6} className="py-8 text-center text-[hsl(var(--muted))]">
                  <Webhook className="mx-auto mb-2 h-6 w-6" /> No webhooks yet.
                </TD></TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <WebhookDialog
        open={addOpen} onClose={() => setAddOpen(false)}
        onDone={() => { setAddOpen(false); router.refresh(); }}
      />
    </>
  );
}

function WebhookDialog({
  open, onClose, onDone,
}: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret] = useState(randomSecret());
  const [events, setEvents] = useState<string[]>(['occurrence.created', 'sla.breach']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim() || !url.trim()) { setError('Name and URL required.'); return; }
    setBusy(true); setError(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (supabase as any).from('org_webhooks').insert({
      name: name.trim(), url: url.trim(), secret, events, is_active: true,
    });
    setBusy(false);
    if (insErr) { setError(insErr.message); return; }
    onDone();
  }

  return (
    <Dialog open={open} onClose={onClose} title="New webhook">
      <div className="space-y-3">
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Slack incidents channel" /></div>
        <div><Label>URL</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.slack.com/..." /></div>
        <div>
          <Label>Signing secret</Label>
          <Input value={secret} readOnly className="font-mono text-xs" />
          <p className="mt-1 text-xs text-[hsl(var(--muted))]">
            Copy this now — store it on your receiver to validate the signature. You can rotate later by deleting & recreating.
          </p>
        </div>
        <div>
          <Label>Events</Label>
          <div className="space-y-1">
            {ALL_EVENTS.map((e) => (
              <label key={e.v} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={events.includes(e.v)}
                  onChange={(ev) => setEvents((prev) => ev.target.checked ? [...prev, e.v] : prev.filter((x) => x !== e.v))}
                />
                {e.label} <code className="text-xs text-[hsl(var(--muted))]">{e.v}</code>
              </label>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
