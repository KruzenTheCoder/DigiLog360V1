'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Search, Trash2, CheckSquare, Square } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { APP_ROLES, ROLE_LABELS, type AppRole } from '@digilog/shared';

interface Capability { key: string; area: string; label: string; description: string | null; is_system: boolean }
interface Grant { org_id: string; role: AppRole; capability_key: string }
interface Org { id: string; name: string; slug: string }

const VISIBLE_ROLES: AppRole[] = APP_ROLES.filter((r) => r !== 'super_user');

export function PermissionsMatrix({
  orgs, capabilities, grants, selectedOrgId,
}: {
  orgs: Org[]; capabilities: Capability[]; grants: Grant[]; selectedOrgId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  // Build a quick-lookup set of "role::capability" strings.
  const [granted, setGranted] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const g of grants) s.add(`${g.role}::${g.capability_key}`);
    return s;
  });

  function key(role: AppRole, cap: string) { return `${role}::${cap}`; }
  function isGranted(role: AppRole, cap: string) { return granted.has(key(role, cap)); }
  function isPending(role: AppRole, cap: string) { return pending.has(key(role, cap)); }

  async function toggle(role: AppRole, cap: string) {
    const k = key(role, cap);
    const hadIt = granted.has(k);
    setPending((prev) => new Set(prev).add(k));
    // Optimistic update
    setGranted((prev) => {
      const next = new Set(prev);
      if (hadIt) next.delete(k); else next.add(k);
      return next;
    });

    const supabase = createClient();
    const { error } = await supabase.functions.invoke('admin-role-capability', {
      body: {
        mode: hadIt ? 'revoke' : 'grant',
        org_id: selectedOrgId,
        role,
        capability_key: cap,
      },
    });

    setPending((prev) => {
      const next = new Set(prev);
      next.delete(k);
      return next;
    });

    if (error) {
      // Roll back
      setGranted((prev) => {
        const next = new Set(prev);
        if (hadIt) next.add(k); else next.delete(k);
        return next;
      });
      alert(error.message);
    }
  }

  async function bulkColumn(role: AppRole, action: 'grant' | 'revoke') {
    const visibleKeys = filtered.map((c) => c.key);
    if (!confirm(`${action === 'grant' ? 'Grant' : 'Revoke'} ${visibleKeys.length} visible capabilities for ${ROLE_LABELS[role]}?`)) return;

    setPending((prev) => {
      const next = new Set(prev);
      for (const k of visibleKeys) next.add(`${role}::${k}`);
      return next;
    });
    setGranted((prev) => {
      const next = new Set(prev);
      for (const k of visibleKeys) {
        const id = `${role}::${k}`;
        if (action === 'grant') next.add(id); else next.delete(id);
      }
      return next;
    });

    const supabase = createClient();
    await supabase.functions.invoke('admin-role-capability', {
      body: {
        mode: 'bulk', org_id: selectedOrgId, role, action, capability_keys: visibleKeys,
      },
    });

    setPending(new Set());
    startTransition(() => router.refresh());
  }

  async function removeCapability(cap: Capability) {
    if (cap.is_system) { alert('Built-in capabilities cannot be deleted.'); return; }
    if (!confirm(`Permanently delete capability "${cap.key}"?`)) return;
    const supabase = createClient();
    const { error } = await supabase.functions.invoke('admin-role-capability', {
      body: { mode: 'remove_capability', key: cap.key },
    });
    if (error) { alert(error.message); return; }
    router.refresh();
  }

  // Filter rows by area / key / label substring.
  const filtered = useMemo(() => {
    if (!filter) return capabilities;
    const needle = filter.toLowerCase();
    return capabilities.filter((c) =>
      c.key.toLowerCase().includes(needle)
      || c.area.toLowerCase().includes(needle)
      || c.label.toLowerCase().includes(needle)
      || (c.description ?? '').toLowerCase().includes(needle));
  }, [capabilities, filter]);

  const byArea = useMemo(() => {
    const m = new Map<string, Capability[]>();
    for (const c of filtered) {
      if (!m.has(c.area)) m.set(c.area, []);
      m.get(c.area)!.push(c);
    }
    return Array.from(m.entries());
  }, [filtered]);

  function changeOrg(id: string) {
    startTransition(() => router.push(`/super/permissions?org=${id}`));
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Organisation</Label>
            <Select value={selectedOrgId} onChange={(e) => changeOrg(e.target.value)}>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted))]" />
            <Input className="pl-9 w-72" placeholder="Filter capabilities…"
              value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add capability
        </Button>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50/60 dark:bg-slate-900/60">
              <th className="sticky left-0 z-10 bg-inherit p-3 text-left font-semibold w-[420px]">Capability</th>
              {VISIBLE_ROLES.map((r) => (
                <th key={r} className="p-2 text-center font-semibold">
                  <div>{ROLE_LABELS[r]}</div>
                  <div className="mt-1 flex justify-center gap-1">
                    <button
                      title={`Grant all visible to ${ROLE_LABELS[r]}`}
                      className="rounded p-1 text-[10px] text-green-700 hover:bg-green-100 dark:hover:bg-green-950/40"
                      onClick={() => bulkColumn(r, 'grant')}
                    ><CheckSquare className="h-3 w-3" /></button>
                    <button
                      title={`Revoke all visible from ${ROLE_LABELS[r]}`}
                      className="rounded p-1 text-[10px] text-red-700 hover:bg-red-100 dark:hover:bg-red-950/40"
                      onClick={() => bulkColumn(r, 'revoke')}
                    ><Square className="h-3 w-3" /></button>
                  </div>
                </th>
              ))}
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {byArea.map(([area, caps]) => (
              <Section key={area} area={area} count={caps.length}>
                {caps.map((c) => (
                  <tr key={c.key} className="border-b">
                    <td className="sticky left-0 z-10 bg-white p-3 align-top dark:bg-slate-950">
                      <div className="font-medium">{c.label}</div>
                      <div className="font-mono text-[11px] text-[hsl(var(--muted))]">{c.key}</div>
                      {c.description && (
                        <div className="mt-1 text-xs text-[hsl(var(--muted))]">{c.description}</div>
                      )}
                      {!c.is_system && <Badge color="#8b5cf6" className="mt-1">custom</Badge>}
                    </td>
                    {VISIBLE_ROLES.map((r) => {
                      const on = isGranted(r, c.key);
                      const busy = isPending(r, c.key);
                      return (
                        <td key={r} className="p-2 text-center align-middle">
                          <button
                            onClick={() => toggle(r, c.key)}
                            disabled={busy}
                            className={`flex h-7 w-7 items-center justify-center rounded-md border transition mx-auto ${
                              on
                                ? 'border-green-500 bg-green-500 text-white'
                                : 'border-slate-300 text-transparent hover:border-slate-400 dark:border-slate-700'
                            }`}
                            aria-label={`${on ? 'Revoke' : 'Grant'} ${c.key} for ${r}`}
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin text-current" /> : on ? '✓' : ''}
                          </button>
                        </td>
                      );
                    })}
                    <td className="p-2 align-middle text-right">
                      {!c.is_system && (
                        <Button size="icon" variant="ghost" onClick={() => removeCapability(c)} title="Delete capability">
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </Section>
            ))}
          </tbody>
        </table>
      </Card>

      <AddCapabilityDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        existingKeys={new Set(capabilities.map((c) => c.key))}
        onDone={() => { setAddOpen(false); router.refresh(); }}
      />
    </>
  );
}

function Section({ area, count, children }: { area: string; count: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-brand/5">
        <td colSpan={VISIBLE_ROLES.length + 2} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-brand">
          {area} · {count}
        </td>
      </tr>
      {children}
    </>
  );
}

function AddCapabilityDialog({
  open, onClose, existingKeys, onDone,
}: {
  open: boolean; onClose: () => void;
  existingKeys: Set<string>; onDone: () => void;
}) {
  const [key, setKey] = useState('');
  const [area, setArea] = useState('Custom');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!key || !label) { setError('Key and label are required.'); return; }
    if (existingKeys.has(key)) { setError('That key already exists.'); return; }
    if (!/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(key)) {
      setError('Key must be lowercase, dotted, snake-case (e.g. ops.view_secret).');
      return;
    }
    setBusy(true); setError(null);
    const supabase = createClient();
    const { error: fnErr } = await supabase.functions.invoke('admin-role-capability', {
      body: {
        mode: 'add_capability',
        key, area, label, description: description || undefined,
      },
    });
    setBusy(false);
    if (fnErr) { setError(fnErr.message); return; }
    setKey(''); setLabel(''); setDescription('');
    onDone();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add custom capability">
      <div className="space-y-3">
        <p className="text-xs text-[hsl(var(--muted))]">
          Custom capabilities show up in the matrix like built-ins, but you can also delete them.
          For new capabilities to gate UI/features, the app code has to reference the key — adding
          a row here just registers the identifier.
        </p>
        <div>
          <Label>Key</Label>
          <Input value={key} onChange={(e) => setKey(e.target.value.toLowerCase().replace(/\s+/g, '_'))} placeholder="ops.view_secret" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Area</Label>
            <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Custom" />
          </div>
          <div>
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="View secret operations" />
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
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
