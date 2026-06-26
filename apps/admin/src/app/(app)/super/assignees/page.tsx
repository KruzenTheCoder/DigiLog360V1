import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isSuperUser } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { AssigneeToggleForm } from '@/components/super/assignee-toggle-form';
import type { AppRole } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function AssigneesPage() {
  const profile = await requireProfile();
  if (!isSuperUser(profile)) redirect('/dashboard');

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;

  const [{ data: rows }, { data: sites }] = await Promise.all([
    sb.from('profiles')
      .select('id, full_name, email, role, roles, job_title, site_id, is_assignable, is_active')
      .order('full_name', { ascending: true, nullsFirst: false }),
    sb.from('sites').select('id, name'),
  ]);

  const sitesMap = new Map<string, string>(((sites ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]));

  return (
    <>
      <PageHeader
        title="Assignment Allow-list"
        description='Pick which profiles appear in the "Assign To" dropdown when logging a new occurrence. Toggle anyone on or off; an empty list falls back to every eligible reviewer.'
      />
      <AssigneeToggleForm
        rows={((rows ?? []) as Profile[])}
        siteName={(siteId: string | null) => (siteId ? sitesMap.get(siteId) ?? null : null)}
      />
    </>
  );
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole;
  roles: AppRole[] | null;
  job_title: string | null;
  site_id: string | null;
  is_assignable: boolean;
  is_active: boolean;
}
