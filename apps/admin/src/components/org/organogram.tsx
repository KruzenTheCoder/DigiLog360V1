'use client';

// The reporting hierarchy, as a tree plus an editor.
//
// The tree is built client-side from a flat list rather than fetched
// recursively — org_chart() already returns everyone with their depth, so one
// round trip is enough. Cycles are impossible by the time data reaches here
// (a database trigger rejects them at write time), but the builder still
// guards against orphans so a stale reports_to never hides a person entirely.

import { useMemo, useState } from 'react';
import {
  AlertCircle, Check, ChevronDown, ChevronRight, Loader2, Search, Users2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface Person {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  reports_to: string | null;
}

const ROLE_TONE: Record<string, string> = {
  super_user: '#7c3aed', admin: '#667eea', manager: '#0891b2',
  control_room: '#0ea5e9', supervisor: '#d97706', guard: '#64748b',
};
const ROLE_LABEL: Record<string, string> = {
  super_user: 'Super User', admin: 'Administrator', manager: 'Manager',
  control_room: 'Control Room', supervisor: 'Supervisor', guard: 'Officer',
};

interface Node extends Person { children: Node[] }

export function Organogram({
  people: initial, canEdit,
}: {
  people: Person[];
  chart: unknown[];
  canEdit: boolean;
}) {
  const [people, setPeople] = useState<Person[]>(initial);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const nameOf = (id: string | null) =>
    id ? (people.find((p) => p.id === id)?.full_name ?? 'Unknown') : null;

  // Flat list -> tree. Anyone whose manager isn't in the visible set is
  // treated as a root, so a person is never silently dropped.
  const roots = useMemo<Node[]>(() => {
    const byId = new Map<string, Node>(people.map((p) => [p.id, { ...p, children: [] }]));
    const top: Node[] = [];
    for (const node of byId.values()) {
      const parent = node.reports_to ? byId.get(node.reports_to) : undefined;
      if (parent && parent.id !== node.id) parent.children.push(node);
      else top.push(node);
    }
    const sort = (ns: Node[]) => {
      ns.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''));
      ns.forEach((n) => sort(n.children));
    };
    sort(top);
    return top;
  }, [people]);

  const directReports = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of people) if (p.reports_to) m.set(p.reports_to, (m.get(p.reports_to) ?? 0) + 1);
    return m;
  }, [people]);

  async function setManager(personId: string, managerId: string | null) {
    setBusyId(personId);
    setMsg(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabase;
    const { error } = await sb.from('profiles')
      .update({ reports_to: managerId }).eq('id', personId);
    setBusyId(null);
    if (error) {
      // The acyclic trigger speaks in plain language; surface it as-is.
      setMsg({ kind: 'error', text: error.message });
      return;
    }
    setPeople((ps) => ps.map((p) => (p.id === personId ? { ...p, reports_to: managerId } : p)));
    setMsg({
      kind: 'ok',
      text: managerId
        ? `${nameOf(personId)} now reports to ${nameOf(managerId)}.`
        : `${nameOf(personId)} is now at the top of their line.`,
    });
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      `${p.full_name ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q));
  }, [people, query]);

  function toggle(id: string) {
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function renderNode(n: Node, depth: number) {
    const kids = n.children.length;
    const isCollapsed = collapsed.has(n.id);
    return (
      <li key={n.id}>
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[hsl(var(--surface))]"
          style={{ marginLeft: depth * 20 }}
        >
          {kids > 0 ? (
            <button type="button" onClick={() => toggle(n.id)} className="text-[hsl(var(--muted))]">
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          ) : <span className="w-4" />}
          <span className="text-sm font-medium">{n.full_name ?? 'Unnamed'}</span>
          <Badge color={ROLE_TONE[n.role] ?? '#64748b'}>{ROLE_LABEL[n.role] ?? n.role}</Badge>
          {kids > 0 && (
            <span className="text-xs text-[hsl(var(--muted))]">
              {kids} direct report{kids === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {kids > 0 && !isCollapsed && (
          <ul className="border-l border-[hsl(var(--border))]" style={{ marginLeft: depth * 20 + 8 }}>
            {n.children.map((c) => renderNode(c, depth + 1))}
          </ul>
        )}
      </li>
    );
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

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardContent className="py-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Users2 className="h-4 w-4" /> Reporting structure
            </p>
            {roots.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted))]">No people to show.</p>
            ) : (
              <ul className="space-y-0.5">{roots.map((r) => renderNode(r, 0))}</ul>
            )}
            <p className="mt-4 text-[11px] text-[hsl(var(--muted))]">
              People at the top of the list have no one above them. An occurrence escalated
              by someone with no manager falls back to an administrator.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 py-5">
            <p className="text-sm font-semibold">
              {canEdit ? 'Set reporting lines' : 'Reporting lines'}
            </p>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted))]" />
              <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a person" />
            </div>

            <div className="max-h-[32rem] space-y-2 overflow-y-auto">
              {visible.map((p) => (
                <div key={p.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{p.full_name ?? 'Unnamed'}</span>
                    <Badge color={ROLE_TONE[p.role] ?? '#64748b'}>{ROLE_LABEL[p.role] ?? p.role}</Badge>
                    {busyId === p.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  </div>
                  <div className="mt-2">
                    <Label>Reports to</Label>
                    <Select
                      value={p.reports_to ?? ''}
                      disabled={!canEdit || busyId === p.id}
                      onChange={(e) => setManager(p.id, e.target.value || null)}
                    >
                      <option value="">— nobody (top of line) —</option>
                      {people
                        .filter((o) => o.id !== p.id)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.full_name ?? 'Unnamed'} · {ROLE_LABEL[o.role] ?? o.role}
                          </option>
                        ))}
                    </Select>
                  </div>
                  {directReports.get(p.id) && (
                    <p className="mt-1.5 text-[11px] text-[hsl(var(--muted))]">
                      {directReports.get(p.id)} person(s) report to them
                    </p>
                  )}
                </div>
              ))}
              {visible.length === 0 && (
                <p className="py-6 text-center text-sm text-[hsl(var(--muted))]">No one matches.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
