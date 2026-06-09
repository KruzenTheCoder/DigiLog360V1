import { MapPin } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, loadMyCapabilities } from '@/lib/auth';
import { visibleSections } from '@/components/layout/nav-config';
import { MenuGrid } from '@/components/menu/menu-grid';
import { profileRoles } from '@digilog/shared';

export const dynamic = 'force-dynamic';

// The landing hub each user sees after sign-in: a role-titled banner, a KPI
// strip, and the action cards they're permitted to open. The card list comes
// straight from visibleSections(), so it honours the super-user permissions
// matrix without any extra wiring.
const ROLE_MENU_TITLE: Record<string, string> = {
  super_user: 'Super Admin Console',
  admin: 'Admin Console',
  manager: 'Manager Dashboard',
  control_room: 'Control Room Menu',
  supervisor: 'Supervisor Menu',
  guard: 'Guard Menu',
};

export default async function MenuPage() {
  const profile = await requireProfile();
  const caps = await loadMyCapabilities();
  const supabase = await createClient();

  const roles = profileRoles(profile);
  const sections = visibleSections(roles.length > 0 ? roles : profile.role, caps);

  let siteName: string | null = null;
  if (profile.site_id && profile.role !== 'admin' && profile.role !== 'super_user') {
    const { data } = await supabase.from('sites').select('name').eq('id', profile.site_id).maybeSingle();
    siteName = data?.name ?? null;
  }

  // KPI strip — RLS scopes these counts to the caller's organisation.
  const base = () => supabase.from('occurrences').select('id', { count: 'exact', head: true });
  const [{ count: total }, { count: open }, { count: closed }, { count: critical }] = await Promise.all([
    base(),
    base().not('status', 'in', '(resolved,closed)'),
    base().in('status', ['resolved', 'closed']),
    base().eq('severity', 'critical').not('status', 'in', '(resolved,closed)'),
  ]);

  const kpis = [
    { label: 'Total Occurrences', value: total ?? 0, accent: 'bg-brand' },
    { label: 'Open / Live', value: open ?? 0, accent: 'bg-amber-400' },
    { label: 'Closed / Resolved', value: closed ?? 0, accent: 'bg-emerald-400' },
    { label: 'Critical', value: critical ?? 0, accent: 'bg-red-500' },
  ];

  const title = ROLE_MENU_TITLE[profile.role] ?? 'Menu';

  return (
    <>
      {/* Banner */}
      <div className="mb-6 overflow-hidden rounded-2xl bg-brand-gradient p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-white/85">Select a dashboard or action to proceed.</p>
          </div>
          {siteName && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium backdrop-blur-sm">
              <MapPin className="h-4 w-4" />
              {siteName}
            </span>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="flex items-stretch overflow-hidden rounded-xl border bg-[hsl(var(--surface))] shadow-sm">
            <span className={`w-1.5 shrink-0 ${k.accent}`} />
            <div className="px-4 py-3">
              <p className="text-2xl font-extrabold leading-tight">{k.value}</p>
              <p className="text-xs text-[hsl(var(--muted))]">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Action cards */}
      <MenuGrid sections={sections} />
    </>
  );
}
