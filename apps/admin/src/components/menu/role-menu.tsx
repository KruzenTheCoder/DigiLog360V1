'use client';

import { useState } from 'react';
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
 * Single-role: one banner + the user's cards.
 *
 * Multi-role (e.g. Control Room + Manager): a pill switcher at the top, the
 * banner reflects the active role, and the cards swap to that role's view.
 * Items are deduped upstream so each shortcut only appears in the highest-
 * ranked role's view; lower-ranked roles still keep their pill clickable,
 * showing an empty-state hint if everything was absorbed above.
 */
export function RoleMenu({
  roleMenus, kpis, siteName,
}: {
  roleMenus: RoleMenuData[];
  kpis: Kpi[];
  siteName: string | null;
}) {
  const [active, setActive] = useState<AppRole>(roleMenus[0]?.role);
  const current = roleMenus.find((m) => m.role === active) ?? roleMenus[0];
  const multi = roleMenus.length > 1;

  return (
    <>
      {multi && (
        <div className="mb-4 flex flex-wrap gap-2">
          {roleMenus.map((m) => {
            const on = m.role === active;
            const color = ROLE_COLORS[m.role];
            return (
              <button
                key={m.role}
                type="button"
                onClick={() => setActive(m.role)}
                className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition"
                style={on
                  ? { background: color, borderColor: color, color: '#fff', boxShadow: `0 4px 14px ${color}55` }
                  : { borderColor: `${color}55`, color }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: on ? '#fff' : color }} />
                {ROLE_LABELS[m.role]}
              </button>
            );
          })}
        </div>
      )}

      {/* Banner */}
      <div className="mb-6 overflow-hidden rounded-2xl bg-brand-gradient p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{current.title}</h1>
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

      {current.sections.length > 0 ? (
        <MenuGrid sections={current.sections} />
      ) : (
        <EmptyRoleState
          role={current.role}
          otherRoles={roleMenus.filter((m) => m.role !== current.role).map((m) => m.role)}
        />
      )}
    </>
  );
}

/**
 * Shown when every nav item for this role has been deduped into a
 * higher-ranked role's tab (e.g. a Control Room + Manager user clicks the
 * Control Room pill — all the shared items live under Manager). The pill is
 * intentionally kept clickable so the user knows the role is active.
 */
function EmptyRoleState({ role, otherRoles }: { role: AppRole; otherRoles: AppRole[] }) {
  const otherNames = otherRoles.map((r) => ROLE_LABELS[r]).join(' / ');
  return (
    <div className="rounded-2xl border bg-[hsl(var(--surface))] p-10 text-center shadow-sm">
      <div
        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
        style={{ background: `${ROLE_COLORS[role]}22`, color: ROLE_COLORS[role] }}
      >
        <Info className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold">{ROLE_LABELS[role]} role active</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-[hsl(var(--muted))]">
        Every action available to your {ROLE_LABELS[role]} role is already on display under your{' '}
        <strong>{otherNames || 'other'}</strong> tab — we don&apos;t duplicate the same shortcut twice.
        Switch back above to use them.
      </p>
    </div>
  );
}
