import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isSuperUser } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { OrganizationsManager } from '@/components/super/organizations-manager';
import type { Organization } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function OrganizationsPage() {
  const profile = await requireProfile();
  if (!isSuperUser(profile)) redirect('/dashboard');

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data } = await sb
    .from('organizations').select('*').order('created_at', { ascending: false });

  // Counts per org (users + sites + occurrences). Cast — new column not in generated types yet.
  const [{ data: profiles }, { data: sites }, { data: occ }] = await Promise.all([
    sb.from('profiles').select('org_id'),
    sb.from('sites').select('org_id'),
    sb.from('occurrences').select('org_id'),
  ]);

  const tally = (rows: { org_id: string | null }[] | null) => {
    const m = new Map<string, number>();
    (rows ?? []).forEach((r) => {
      if (!r.org_id) return;
      m.set(r.org_id, (m.get(r.org_id) ?? 0) + 1);
    });
    return m;
  };
  const counts = {
    users: tally(profiles as { org_id: string | null }[] | null),
    sites: tally(sites as { org_id: string | null }[] | null),
    occurrences: tally(occ as { org_id: string | null }[] | null),
  };

  return (
    <>
      <PageHeader
        title="Organisations"
        description="Cross-tenant control. Create, suspend or update any organisation."
      />
      <OrganizationsManager
        orgs={(data ?? []) as unknown as Organization[]}
        counts={{
          users: Object.fromEntries(counts.users),
          sites: Object.fromEntries(counts.sites),
          occurrences: Object.fromEntries(counts.occurrences),
        }}
      />
    </>
  );
}
