import { Info, MapPin } from 'lucide-react';
import { MenuGrid } from './menu-grid';
import { ROLE_COLORS, ROLE_LABELS, type AppRole } from '@digilog/shared';
import type { NavSection } from '@/components/layout/nav-config';

export interface RoleMenuData {
  role: AppRole;
  title: string;
  sections: NavSection[];
}
interface Kpi { label: string; value: number; accent: string }

/**
 * The landing hub.
 *
 * Single-role users see one menu under a brand banner.
 *
 * Multi-role users (e.g. Control Room + Manager) see one stacked section per
 * role — no pill switcher, no hidden tabs — with each role getting its own
 * coloured header bar. Items are deduped upstream in /menu/page.tsx so the
 * lower-ranked role only shows its UNIQUE actions; that gives a natural
 * "low-level on top, high-level below" split (e.g. Control Room shows the
 * operational floor; Manager shows the high-level review/admin surfaces).
 */
export function RoleMenu({
  roleMenus, kpis, siteName,
}: {
  roleMenus: RoleMenuData[];
  kpis: Kpi[];
  siteName: string | null;
}) {
  const multi = roleMenus.length > 1;
  const primary = roleMenus[0];

  return (
    <>
      {/* Banner — single title for multi-role users, role-specific otherwise */}
      <div className="mb-6 overflow-hidden rounded-2xl bg-brand-gradient p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {multi ? 'My Console' : primary.title}
            </h1>
            <p className="mt-1 text-sm text-white/85">
              {multi
                ? `Your ${roleMenus.map((m) => ROLE_LABELS[m.role]).join(' + ')} actions, grouped by role.`
                : 'Select a dashboard or action to proceed.'}
            </p>
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

      {/* Single-role: just the cards. Multi-role: one stacked section per role. */}
      {!multi ? (
        primary.sections.length > 0
          ? <MenuGrid sections={primary.sections} />
          : <EmptyRoleState role={primary.role} otherRoles={[]} />
      ) : (
        <div className="space-y-7">
          {roleMenus.map((m) => (
            <RoleSection
              key={m.role}
              data={m}
              otherRoles={roleMenus.filter((x) => x.role !== m.role).map((x) => x.role)}
            />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * One role's slice of the page — a coloured header bar (role colour) followed
 * by that role's action cards.
 */
function RoleSection({ data, otherRoles }: { data: RoleMenuData; otherRoles: AppRole[] }) {
  const color = ROLE_COLORS[data.role];
  return (
    <section className="overflow-hidden rounded-2xl border bg-[hsl(var(--surface))] shadow-sm ring-1" style={{ boxShadow: `0 1px 2px ${color}22` }}>
      <header
        className="flex items-center justify-between gap-3 px-5 py-3 text-white"
        style={{ background: `linear-gradient(90deg, ${color}, ${color}dd)` }}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-white/90" />
          <h2 className="text-sm font-bold tracking-wide">{ROLE_LABELS[data.role]}</h2>
          <span className="hidden text-[11px] text-white/85 sm:inline">· {data.title}</span>
        </div>
        <span className="text-[11px] font-medium text-white/85">
          {countItems(data.sections)} action{countItems(data.sections) === 1 ? '' : 's'}
        </span>
      </header>
      <div className="p-5">
        {data.sections.length > 0 ? (
          <MenuGrid sections={data.sections} />
        ) : (
          <EmptyRoleState role={data.role} otherRoles={otherRoles} inline />
        )}
      </div>
    </section>
  );
}

function countItems(sections: NavSection[]) {
  return sections.reduce((n, s) => n + s.items.length, 0);
}

/**
 * Empty-state panel. `inline` shrinks the padding for use inside a role
 * section (vs. as the only thing on the page).
 */
function EmptyRoleState({
  role, otherRoles, inline = false,
}: { role: AppRole; otherRoles: AppRole[]; inline?: boolean }) {
  const otherNames = otherRoles.map((r) => ROLE_LABELS[r]).join(' / ');
  return (
    <div className={`rounded-xl border border-dashed bg-[hsl(var(--surface))] text-center ${inline ? 'px-4 py-6' : 'p-10 shadow-sm'}`}>
      <div
        className={`mx-auto ${inline ? 'mb-2 h-9 w-9' : 'mb-4 h-12 w-12'} flex items-center justify-center rounded-full`}
        style={{ background: `${ROLE_COLORS[role]}22`, color: ROLE_COLORS[role] }}
      >
        <Info className={inline ? 'h-4 w-4' : 'h-6 w-6'} />
      </div>
      <p className="text-sm text-[hsl(var(--muted))]">
        Nothing unique to your <strong>{ROLE_LABELS[role]}</strong> role —
        {otherNames ? <> all actions show above under <strong>{otherNames}</strong>.</> : ' nothing assigned yet.'}
      </p>
    </div>
  );
}
