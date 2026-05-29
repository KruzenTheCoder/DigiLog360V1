'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus, Pencil, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { APP_ROLES, ROLE_LABELS, type AppRole, type Profile, type Site } from '@digilog/shared';

type Row = Profile & { sites: { name: string } | null };

export function UsersManager({ users, sites }: { users: Row[]; sites: Site[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);

  const filtered = users.filter((u) => {
    if (!q) return true;
    const hay = `${u.email} ${u.full_name} ${u.sites?.name ?? ''} ${ROLE_LABELS[u.role]}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted))]" />
          <Input className="pl-9" placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" /> Add User</Button>
      </div>

      <Card className="p-4">
        <Table>
          <THead><TR><TH>Name</TH><TH>Email</TH><TH>Role</TH><TH>Site</TH><TH>Status</TH><TH></TH></TR></THead>
          <TBody>
            {filtered.map((u) => (
              <TR key={u.id}>
                <TD className="font-medium">{u.full_name ?? '—'}</TD>
                <TD>{u.email}</TD>
                <TD><Badge color="#667eea">{ROLE_LABELS[u.role]}</Badge></TD>
                <TD>{u.sites?.name ?? '—'}</TD>
                <TD>{u.is_active
                  ? <Badge color="#16a34a">Active</Badge>
                  : <Badge color="#64748b">Inactive</Badge>}</TD>
                <TD className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => setEdit(u)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                </TD>
              </TR>
            ))}
            {filtered.length === 0 && <TR><TD colSpan={6} className="py-8 text-center text-[hsl(var(--muted))]">No users found.</TD></TR>}
          </TBody>
        </Table>
      </Card>

      <UserDialog key={addOpen ? 'create-open' : 'create'} mode="create" open={addOpen} onClose={() => setAddOpen(false)} sites={sites} onDone={() => router.refresh()} />
      <UserDialog key={edit?.id ?? 'edit'} mode="edit" open={!!edit} onClose={() => setEdit(null)} sites={sites} user={edit} onDone={() => router.refresh()} />
    </>
  );
}

function UserDialog({
  mode, open, onClose, sites, user, onDone,
}: {
  mode: 'create' | 'edit';
  open: boolean;
  onClose: () => void;
  sites: Site[];
  user?: Row | null;
  onDone: () => void;
}) {
  const [email, setEmail] = useState(user?.email ?? '');
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AppRole>(user?.role ?? 'guard');
  const [siteId, setSiteId] = useState(user?.site_id ?? '');
  const [active, setActive] = useState(user?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setError(null);
    const supabase = createClient();
    const fn = mode === 'create' ? 'admin-create-user' : 'admin-update-user';
    const body = mode === 'create'
      ? { email, password, full_name: fullName, role, site_id: siteId || null }
      : { user_id: user!.id, full_name: fullName, role, site_id: siteId || null, is_active: active, ...(password ? { password } : {}) };

    const { error: fnErr } = await supabase.functions.invoke(fn, { body });
    setBusy(false);
    if (fnErr) { setError(fnErr.message); return; }
    onClose();
    onDone();
  }

  return (
    <Dialog open={open} onClose={onClose} title={mode === 'create' ? 'Add User' : 'Edit User'}>
      <div className="space-y-3">
        <div>
          <Label>Email</Label>
          <Input type="email" value={email} disabled={mode === 'edit'} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label>Full Name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <Label>{mode === 'create' ? 'Password' : 'New Password (leave blank to keep)'}</Label>
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Role</Label>
            <Select value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
              {APP_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </div>
          <div>
            <Label>Site</Label>
            <Select value={siteId ?? ''} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Unassigned</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        </div>
        {mode === 'edit' && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active (can sign in)
          </label>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {mode === 'create' ? 'Create' : 'Save'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
