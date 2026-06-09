'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
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
 * The landing hub. When the user holds more than one role (e.g. Control Room +
 * Manager) it shows a pill switcher and swaps the banner title + action cards
 * for the selected role — mirroring the legacy role tabs, on the new theme.
 * A single-role user simply sees their one menu with no switcher.
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
                style={
                  on
                    ? { background: color, borderColor: color, color: '#fff' }
                    : { borderColor: `${color}55`, color }
                }
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: on ? '#fff' : color }}
                />
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

      <MenuGrid sections={current.sections} />
    </>
  );
}
