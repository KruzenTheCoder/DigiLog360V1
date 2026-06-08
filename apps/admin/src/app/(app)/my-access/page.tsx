import { requireProfile, loadMyCapabilities } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, KeySquare, Building2, MapPin } from 'lucide-react';
import {
  ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_CAPABILITIES,
  profileRoles, primaryRole,
  type AppRole, type Capability,
} from '@digilog/shared';
import { visibleSections } from '@/components/layout/nav-config';

export const dynamic = 'force-dynamic';

export default async function MyAccessPage() {
  const profile = await requireProfile();
  const myRoles = profileRoles(profile);
  const myPrimary = primaryRole(profile);

  // Live, super-user-editable capability set.
  const capsSet = await loadMyCapabilities();
  const isSuper = capsSet.has('*');
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: liveCaps } = await (supabase as any)
    .from('my_capabilities').select('key, area, label, description');
  type LiveCap = { key: string; area: string; label: string; description: string | null };
  const live: LiveCap[] = (liveCaps as LiveCap[] | null) ?? [];

  // Merge & dedupe capabilities across all held roles, keyed by area+label.
  const seen = new Set<string>();
  const merged: (Capability & { fromRole: AppRole })[] = [];
  for (const r of myRoles) {
    for (const cap of ROLE_CAPABILITIES[r] ?? []) {
      const key = `${cap.area}::${cap.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...cap, fromRole: r });
    }
  }
  // Group by area.
  const byArea = new Map<string, (Capability & { fromRole: AppRole })[]>();
  for (const c of merged) {
    if (!byArea.has(c.area)) byArea.set(c.area, []);
    byArea.get(c.area)!.push(c);
  }

  // What the user can actually see in the nav, given their roles.
  const sections = visibleSections(myRoles.length > 0 ? myRoles : profile.role);

  return (
    <>
      <PageHeader
        title="My Access"
        description="What your DigiLog account is allowed to do — broken down by role."
      />

      {/* ----- summary ----- */}
      <Card className="mb-5">
        <CardContent className="pt-5">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Roles held" value={String(myRoles.length)} icon={<ShieldCheck className="h-5 w-5 text-brand" />} />
            <Stat label="Primary role" value={myPrimary ? ROLE_LABELS[myPrimary] : '—'} icon={<KeySquare className="h-5 w-5 text-brand" />} />
            <Stat label="Organisation" value={profile.org_id ? 'Member' : 'None'} icon={<Building2 className="h-5 w-5 text-brand" />} />
            <Stat label="Site" value={profile.site_id ? 'Assigned' : 'All sites'} icon={<MapPin className="h-5 w-5 text-brand" />} />
          </div>

          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
              Your roles
            </p>
            <div className="flex flex-wrap gap-2">
              {myRoles.map((r, idx) => (
                <div key={r} className="flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm dark:bg-slate-900">
                  <Badge color={idx === 0 ? '#667eea' : '#8b5cf6'}>
                    {ROLE_LABELS[r]}
                  </Badge>
                  {idx === 0 && <span className="text-[10px] font-semibold uppercase text-brand">Primary</span>}
                </div>
              ))}
              {myRoles.length === 0 && (
                <p className="text-sm italic text-[hsl(var(--muted))]">
                  No roles assigned. Ask your administrator.
                </p>
              )}
            </div>
            {myPrimary && (
              <p className="mt-3 text-sm text-[hsl(var(--muted))]">
                {ROLE_DESCRIPTIONS[myPrimary]}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ----- capability matrix ----- */}
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        {Array.from(byArea.entries()).map(([area, caps]) => (
          <Card key={area}>
            <CardHeader><CardTitle>{area}</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {caps.map((c) => (
                  <li key={c.area + c.label} className="flex items-start gap-2">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    <div className="flex-1">
                      {c.label}
                      <Badge color="#94a3b8" className="ml-2">
                        via {ROLE_LABELS[c.fromRole]}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ----- live capabilities (super-user editable) ----- */}
      <Card className="mb-5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Live capabilities ({isSuper ? 'super user · all' : live.length})</CardTitle>
            {isSuper && (
              <a
                href="/super/permissions"
                className="text-xs text-brand hover:underline"
              >
                Edit role × capability matrix →
              </a>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isSuper ? (
            <p className="text-sm text-[hsl(var(--muted))]">
              As super user you implicitly hold every capability across every organisation.
            </p>
          ) : live.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted))]">
              No capabilities granted. Ask your administrator.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {live.map((c) => (
                <Badge key={c.key} color="#0ea5e9" className="font-mono text-[10px]">
                  {c.key}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----- pages they can reach ----- */}
      <Card>
        <CardHeader><CardTitle>Pages you can open</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((s) => (
              <div key={s.title}>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
                  {s.title}
                </p>
                <ul className="space-y-1 text-sm">
                  {s.items.map((i) => (
                    <li key={i.href}>
                      <a className="hover:text-brand hover:underline" href={i.href}>{i.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand/10">{icon}</div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-[hsl(var(--muted))]">{label}</p>
        <p className="font-semibold">{value}</p>
      </div>
    </div>
  );
}
