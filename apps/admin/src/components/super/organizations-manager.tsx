'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Pencil, Building2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import type { Organization } from '@digilog/shared';

type Counts = {
  users: Record<string, number>;
  sites: Record<string, number>;
  occurrences: Record<string, number>;
};

export function OrganizationsManager({ orgs, counts }: { orgs: Organization[]; counts: Counts }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [edit, setEdit] = useState<Organization | null>(null);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-[hsl(var(--muted))]">{orgs.length} organisation(s)</div>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> New Organisation</Button>
      </div>

      <Card className="p-4">
        <Table>
          <THead>
            <TR>
              <TH>Name</TH><TH>Slug</TH><TH>Plan</TH>
              <TH>Users</TH><TH>Sites</TH><TH>Occurrences</TH>
              <TH>Status</TH><TH></TH>
            </TR>
          </THead>
          <TBody>
            {orgs.map((o) => (
              <TR key={o.id}>
                <TD className="font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-brand" /> {o.name}
                </TD>
                <TD className="font-mono text-xs">{o.slug}</TD>
                <TD><Badge color="#667eea">{o.plan}</Badge></TD>
                <TD>{counts.users[o.id] ?? 0}</TD>
                <TD>{counts.sites[o.id] ?? 0}</TD>
                <TD>{counts.occurrences[o.id] ?? 0}</TD>
                <TD>{o.is_active ? <Badge color="#16a34a">Active</Badge> : <Badge color="#dc2626">Suspended</Badge>}</TD>
                <TD className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => setEdit(o)} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TD>
              </TR>
            ))}
            {orgs.length === 0 && (
              <TR><TD colSpan={8} className="py-8 text-center text-[hsl(var(--muted))]">No organisations yet.</TD></TR>
            )}
          </TBody>
        </Table>
      </Card>

      <OrgDialog
        key={addOpen ? 'org-open' : 'org'}
        mode="create" open={addOpen} onClose={() => setAddOpen(false)}
        onDone={() => router.refresh()}
      />
      <OrgDialog
        key={edit?.id ?? 'org-edit'}
        mode="edit" open={!!edit} onClose={() => setEdit(null)} org={edit}
        onDone={() => router.refresh()}
      />
    </>
  );
}

function OrgDialog({
  mode, open, onClose, org, onDone,
}: {
  mode: 'create' | 'edit';
  open: boolean;
  onClose: () => void;
  org?: Organization | null;
  onDone: () => void;
}) {
  const [name, setName] = useState(org?.name ?? '');
  const [slug, setSlug] = useState(org?.slug ?? '');
  const [plan, setPlan] = useState(org?.plan ?? 'standard');
  const [contactEmail, setContactEmail] = useState(org?.contact_email ?? '');
  const [contactPhone, setContactPhone] = useState(org?.contact_phone ?? '');
  const [address, setAddress] = useState(org?.address ?? '');
  const [maxUsers, setMaxUsers] = useState(org?.max_users?.toString() ?? '');
  const [maxSites, setMaxSites] = useState(org?.max_sites?.toString() ?? '');
  const [trialEnds, setTrialEnds] = useState(org?.trial_ends_at?.slice(0, 10) ?? '');
  const [isActive, setIsActive] = useState(org?.is_active ?? true);

  // First-admin fields (create only)
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminName, setAdminName] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !slug.trim()) { setError('Name and slug are required.'); return; }
    setBusy(true); setError(null);
    const supabase = createClient();

    if (mode === 'create') {
      const body: Record<string, unknown> = {
        org: {
          name: name.trim(), slug: slug.trim().toLowerCase(),
          plan, contact_email: contactEmail || null,
          contact_phone: contactPhone || null, address: address || null,
          max_users: maxUsers ? Number(maxUsers) : null,
          max_sites: maxSites ? Number(maxSites) : null,
          trial_ends_at: trialEnds || null,
        },
      };
      if (adminEmail && adminPassword) {
        body.first_admin = {
          email: adminEmail.trim().toLowerCase(),
          password: adminPassword,
          full_name: adminName || null,
        };
      }
      const { error: fnErr } = await supabase.functions.invoke('admin-create-org', { body });
      setBusy(false);
      if (fnErr) { setError(fnErr.message); return; }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e } = await (supabase as any).from('organizations').update({
        name: name.trim(), plan,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
        address: address || null,
        max_users: maxUsers ? Number(maxUsers) : null,
        max_sites: maxSites ? Number(maxSites) : null,
        trial_ends_at: trialEnds || null,
        is_active: isActive,
      }).eq('id', org!.id);
      setBusy(false);
      if (e) { setError(e.message); return; }
    }
    onClose();
    onDone();
  }

  return (
    <Dialog open={open} onClose={onClose} title={mode === 'create' ? 'New Organisation' : 'Edit Organisation'}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Slug *</Label>
            <Input
              value={slug} disabled={mode === 'edit'}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="acme-security"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Plan</Label>
            <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="standard">Standard</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </Select>
          </div>
          <div>
            <Label>Max Users</Label>
            <Input type="number" value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} />
          </div>
          <div>
            <Label>Max Sites</Label>
            <Input type="number" value={maxSites} onChange={(e) => setMaxSites(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Contact Email</Label>
            <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
          <div>
            <Label>Contact Phone</Label>
            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Address</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div>
          <Label>Trial Ends</Label>
          <Input type="date" value={trialEnds} onChange={(e) => setTrialEnds(e.target.value)} />
        </div>

        {mode === 'edit' && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active (users can sign in)
          </label>
        )}

        {mode === 'create' && (
          <div className="rounded-lg border bg-brand/5 p-3">
            <p className="mb-2 text-xs font-semibold text-brand">FIRST ADMIN (optional)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
              </div>
              <div>
                <Label>Password</Label>
                <Input type="text" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
              </div>
              <div>
                <Label>Full Name</Label>
                <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {mode === 'create' ? 'Create' : 'Save'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
