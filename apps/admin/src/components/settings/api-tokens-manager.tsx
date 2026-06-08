'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2, Key, Copy, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';

interface Row {
  id: string; name: string; prefix: string;
  scopes: string[]; expires_at: string | null; last_used_at: string | null;
  created_at: string; revoked_at: string | null;
}

const ALL_SCOPES = [
  { v: 'read:occurrences', label: 'Read occurrences' },
  { v: 'write:occurrences', label: 'Create / update occurrences' },
  { v: 'read:patrols', label: 'Read patrols' },
  { v: 'read:reports', label: 'Read incident reports' },
];

export function ApiTokensManager({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Row[]>(initial);
  const [addOpen, setAddOpen] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function revoke(id: string) {
    if (!confirm('Revoke this token? Any caller using it will start getting 401.')) return;
    const supabase = createClient();
    await supabase.functions.invoke('admin-api-token', { body: { mode: 'revoke', id } });
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[hsl(var(--muted))]">
          Tokens are scoped to your organisation. Pass them as <code>Authorization: Bearer dl_live_...</code>.
        </p>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> New token</Button>
      </div>

      <Card>
        <CardContent className="pt-5">
          <Table>
            <THead>
              <TR><TH>Name</TH><TH>Prefix</TH><TH>Scopes</TH><TH>Last used</TH><TH>Status</TH><TH></TH></TR>
            </THead>
            <TBody>
              {items.map((t) => (
                <TR key={t.id}>
                  <TD className="font-medium">{t.name}</TD>
                  <TD className="font-mono text-xs">{t.prefix}…</TD>
                  <TD className="text-xs">{t.scopes.join(', ')}</TD>
                  <TD className="text-xs text-[hsl(var(--muted))]">
                    {t.last_used_at ? formatDateTime(t.last_used_at) : 'never'}
                  </TD>
                  <TD>
                    {t.revoked_at
                      ? <Badge color="#dc2626">Revoked</Badge>
                      : t.expires_at && new Date(t.expires_at) < new Date()
                      ? <Badge color="#ea580c">Expired</Badge>
                      : <Badge color="#16a34a">Active</Badge>}
                  </TD>
                  <TD className="text-right">
                    {!t.revoked_at && (
                      <Button size="icon" variant="ghost" onClick={() => revoke(t.id)} title="Revoke">
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
              {items.length === 0 && (
                <TR><TD colSpan={6} className="py-8 text-center text-[hsl(var(--muted))]">
                  <Key className="mx-auto mb-2 h-6 w-6" /> No tokens yet.
                </TD></TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {/* create dialog */}
      <CreateTokenDialog
        open={addOpen} onClose={() => setAddOpen(false)}
        onCreated={(token) => { setAddOpen(false); setNewToken(token); router.refresh(); }}
      />

      {/* show-once dialog */}
      <Dialog
        open={!!newToken} onClose={() => { setNewToken(null); setCopied(false); }}
        title="Token created — copy it now"
      >
        <p className="mb-3 text-sm text-[hsl(var(--muted))]">
          This is the only time you'll see this token. Store it in your secret manager.
        </p>
        <div className="flex gap-2">
          <Input readOnly value={newToken ?? ''} className="font-mono text-xs" />
          <Button onClick={() => { if (newToken) { navigator.clipboard.writeText(newToken); setCopied(true); } }}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => { setNewToken(null); setCopied(false); }}>Done</Button>
        </div>
      </Dialog>
    </>
  );
}

function CreateTokenDialog({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (token: string) => void }) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read:occurrences']);
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) { setError('Name required.'); return; }
    setBusy(true); setError(null);
    const supabase = createClient();
    const { data, error: fnErr } = await supabase.functions.invoke('admin-api-token', {
      body: {
        mode: 'create', name: name.trim(), scopes,
        expires_at: expires ? new Date(expires).toISOString() : undefined,
      },
    });
    setBusy(false);
    if (fnErr) { setError(fnErr.message); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tk = (data as any)?.token as string | undefined;
    if (tk) onCreated(tk);
  }

  return (
    <Dialog open={open} onClose={onClose} title="New API token">
      <div className="space-y-3">
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Slack bot · read-only" /></div>
        <div>
          <Label>Scopes</Label>
          <div className="space-y-1">
            {ALL_SCOPES.map((s) => (
              <label key={s.v} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox" checked={scopes.includes(s.v)}
                  onChange={(e) => setScopes((prev) => e.target.checked ? [...prev, s.v] : prev.filter((x) => x !== s.v))}
                />
                {s.label} <code className="text-xs text-[hsl(var(--muted))]">{s.v}</code>
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label>Expires (optional)</Label>
          <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={create} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
