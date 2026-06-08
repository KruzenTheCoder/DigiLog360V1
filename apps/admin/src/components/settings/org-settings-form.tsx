'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { Organization } from '@digilog/shared';

export function OrgSettingsForm({
  org, canEdit, isSuperUser,
}: { org: Organization; canEdit: boolean; isSuperUser: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(org.name);
  const [legalName, setLegalName] = useState(org.legal_name ?? '');
  const [contactEmail, setContactEmail] = useState(org.contact_email ?? '');
  const [contactPhone, setContactPhone] = useState(org.contact_phone ?? '');
  const [address, setAddress] = useState(org.address ?? '');
  const [primaryColor, setPrimaryColor] = useState(org.primary_color ?? '#667eea');
  const [logoUrl, setLogoUrl] = useState(org.logo_url ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  async function save() {
    if (!canEdit) return;
    setBusy(true); setMessage(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('organizations')
      .update({
        name,
        legal_name: legalName || null,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
        address: address || null,
        primary_color: primaryColor || null,
        logo_url: logoUrl || null,
      })
      .eq('id', org.id);
    setBusy(false);
    if (error) { setMessage({ type: 'error', text: error.message }); return; }
    setMessage({ type: 'ok', text: 'Saved.' });
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{org.name}</CardTitle>
            <div className="flex gap-2">
              <Badge color={org.is_active ? '#16a34a' : '#dc2626'}>
                {org.is_active ? 'Active' : 'Suspended'}
              </Badge>
              <Badge color="#667eea">{org.plan}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs uppercase text-[hsl(var(--muted))]">Slug</dt>
              <dd className="font-mono">{org.slug}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-[hsl(var(--muted))]">Plan limits</dt>
              <dd>{org.max_users ?? '—'} users · {org.max_sites ?? '—'} sites</dd>
            </div>
            {org.trial_ends_at && (
              <div>
                <dt className="text-xs uppercase text-[hsl(var(--muted))]">Trial ends</dt>
                <dd>{new Date(org.trial_ends_at).toLocaleDateString()}</dd>
              </div>
            )}
          </dl>
          {!isSuperUser && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              Plan, slug and limits can only be changed by the platform super user.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Branding &amp; Contact</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Display Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label>Legal Name</Label>
              <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label>Contact Email</Label>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label>Contact Phone</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} disabled={!canEdit} />
            </div>
            <div className="sm:col-span-2">
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <Label>Primary Color</Label>
              <div className="flex gap-2">
                <input
                  type="color" className="h-10 w-12 rounded border" value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)} disabled={!canEdit}
                />
                <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} disabled={!canEdit} />
              </div>
            </div>
            <div>
              <Label>Logo URL</Label>
              <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} disabled={!canEdit} placeholder="https://…/logo.png" />
            </div>
          </div>

          {message && (
            <p className={`mt-4 text-sm ${message.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
              {message.text}
            </p>
          )}

          <div className="mt-5 flex justify-end">
            <Button onClick={save} disabled={!canEdit || busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
