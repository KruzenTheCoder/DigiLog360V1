import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS, type AppRole } from '@digilog/shared';

export interface RolePerfRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  site_name: string | null;
  total: number;             // total occurrences logged in window
  today: number;             // logged today
  week: number;              // logged this week
  sla_breach_pct: number;    // 0-100
  // For manager-style tables:
  assigned?: number;
  closed?: number;
  response_rate?: number;    // 0-100 (assigned with at least one update)
  acks?: number;             // manager acknowledgements made in window
}

function performanceBadge(pct: number) {
  // SLA-derived performance label, matching the legacy buckets.
  if (pct === 0) return { label: 'Excellent', color: '#16a34a' };
  if (pct < 5)   return { label: 'Excellent', color: '#16a34a' };
  if (pct < 15)  return { label: 'Good', color: '#0ea5e9' };
  if (pct < 30)  return { label: 'Needs Improvement', color: '#f59e0b' };
  return { label: 'Critical', color: '#dc2626' };
}

function responseBar(pct: number) {
  const color = pct >= 80 ? '#16a34a' : pct >= 50 ? '#f59e0b' : '#dc2626';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      </div>
      <span className="text-xs text-[hsl(var(--muted))]">{pct}%</span>
    </div>
  );
}

/**
 * Compact ranking table — same layout for Guard / Control Room / Manager.
 * The `variant` switches which metric columns are shown.
 */
export function RolePerformanceTable({
  rows, variant,
}: {
  rows: RolePerfRow[];
  variant: 'guard' | 'control_room' | 'manager';
}) {
  const showSiteCol = variant !== 'guard'; // guards usually share the same site
  if (rows.length === 0) {
    return <p className="text-sm text-[hsl(var(--muted))]">No activity for this role in the selected period.</p>;
  }
  return (
    <Table>
      <THead>
        <TR>
          <TH className="w-12">Rank</TH>
          <TH>{variant === 'manager' ? 'Manager' : variant === 'control_room' ? 'Operator' : 'Guard'}</TH>
          {showSiteCol && <TH>Site</TH>}
          {variant === 'manager' ? (
            <>
              <TH className="text-right">Acks</TH>
              <TH className="text-right">Assigned</TH>
              <TH className="text-right">Closed</TH>
              <TH>Response Rate</TH>
            </>
          ) : (
            <>
              <TH className="text-right">Total Logs</TH>
              <TH className="text-right">Today</TH>
              <TH className="text-right">This Week</TH>
              <TH>SLA Breach Rate</TH>
            </>
          )}
          <TH>Performance</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r, i) => {
          const perf = performanceBadge(r.sla_breach_pct);
          return (
            <TR key={r.user_id}>
              <TD>
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
                  style={{ background: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#a16207' : '#667eea' }}
                >
                  {i + 1}
                </span>
              </TD>
              <TD>
                <div className="font-medium">{r.full_name ?? '—'}</div>
                <div className="text-[11px] text-[hsl(var(--muted))]">{r.email}</div>
              </TD>
              {showSiteCol && (
                <TD className="text-sm">
                  {r.site_name ? <Badge color="#0ea5e9">{r.site_name}</Badge> : <span className="text-[hsl(var(--muted))]">—</span>}
                </TD>
              )}
              {variant === 'manager' ? (
                <>
                  <TD className="text-right font-semibold">{r.acks ?? 0}</TD>
                  <TD className="text-right">Assigned: {r.assigned ?? 0}</TD>
                  <TD className="text-right">Closed: {r.closed ?? 0}</TD>
                  <TD>{responseBar(r.response_rate ?? 0)}</TD>
                </>
              ) : (
                <>
                  <TD className="text-right font-semibold">{r.total}</TD>
                  <TD className="text-right">{r.today}</TD>
                  <TD className="text-right">{r.week}</TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(0, Math.min(100, r.sla_breach_pct))}%`,
                            background: r.sla_breach_pct === 0 ? '#16a34a' : r.sla_breach_pct < 15 ? '#0ea5e9' : r.sla_breach_pct < 30 ? '#f59e0b' : '#dc2626',
                          }}
                        />
                      </div>
                      <span className="text-xs text-[hsl(var(--muted))]">{r.sla_breach_pct}%</span>
                    </div>
                  </TD>
                </>
              )}
              <TD>
                <Badge color={perf.color}>{perf.label}</Badge>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

// Compatibility re-export — keeps a clean name if used elsewhere.
export const ROLE_PERF_VARIANTS = ['guard', 'control_room', 'manager'] as const;
export const ROLE_PERF_LABELS: Record<(typeof ROLE_PERF_VARIANTS)[number], string> = {
  guard: ROLE_LABELS['guard' as AppRole],
  control_room: ROLE_LABELS['control_room' as AppRole],
  manager: ROLE_LABELS['manager' as AppRole],
};
