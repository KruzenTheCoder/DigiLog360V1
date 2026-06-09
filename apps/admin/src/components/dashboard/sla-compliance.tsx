import { ShieldCheck } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SEVERITY_COLORS, type SeverityLevel } from '@digilog/shared';

export interface SevCompliance {
  key: SeverityLevel;
  label: string;
  total: number;
  breached: number;
  compliance: number;
}
export interface SiteCompliance {
  name: string;
  total: number;
  breached: number;
  compliance: number;
}

// Traffic-light colour for a compliance percentage.
function complianceColor(pct: number) {
  if (pct >= 90) return '#16a34a'; // green
  if (pct >= 75) return '#d97706'; // amber
  return '#dc2626'; // red
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function SlaComplianceReport({
  complianceRate, within, breached, total, avgOverageHrs, bySeverity, bySite,
}: {
  complianceRate: number;
  within: number;
  breached: number;
  total: number;
  avgOverageHrs: number;
  bySeverity: SevCompliance[];
  bySite: SiteCompliance[];
}) {
  const rateColor = complianceColor(complianceRate);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand" />
          SLA Breach Analysis &amp; Compliance Tracking
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-[hsl(var(--muted))]">
            No SLA-tracked occurrences in the last 30 days.
          </p>
        ) : (
          <div className="space-y-6">
            {/* Summary tiles */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-xl border p-4 text-center">
                <p className="text-3xl font-extrabold" style={{ color: rateColor }}>{complianceRate}%</p>
                <p className="mt-0.5 text-xs text-[hsl(var(--muted))]">Compliance rate</p>
              </div>
              <div className="rounded-xl border p-4 text-center">
                <p className="text-3xl font-extrabold text-emerald-600">{within}</p>
                <p className="mt-0.5 text-xs text-[hsl(var(--muted))]">Within SLA</p>
              </div>
              <div className="rounded-xl border p-4 text-center">
                <p className="text-3xl font-extrabold text-red-600">{breached}</p>
                <p className="mt-0.5 text-xs text-[hsl(var(--muted))]">Breached</p>
              </div>
              <div className="rounded-xl border p-4 text-center">
                <p className="text-3xl font-extrabold">{avgOverageHrs}h</p>
                <p className="mt-0.5 text-xs text-[hsl(var(--muted))]">Avg breach overage</p>
              </div>
            </div>

            {/* Overall compliance bar */}
            <div>
              <div className="mb-1 flex justify-between text-xs text-[hsl(var(--muted))]">
                <span>Overall compliance</span>
                <span>{within}/{total} within SLA</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-red-100 dark:bg-red-950/40">
                <div className="h-full rounded-full" style={{ width: `${complianceRate}%`, background: rateColor }} />
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* By severity */}
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
                  Compliance by severity
                </h3>
                <div className="space-y-3">
                  {bySeverity.length === 0 && <p className="text-sm text-[hsl(var(--muted))]">No data.</p>}
                  {bySeverity.map((s) => (
                    <div key={s.key}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEVERITY_COLORS[s.key] }} />
                          {s.label}
                        </span>
                        <span className="text-[hsl(var(--muted))]">{s.compliance}% · {s.breached}/{s.total} breached</span>
                      </div>
                      <Bar pct={s.compliance} color={complianceColor(s.compliance)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* By site */}
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
                  Compliance by site
                </h3>
                <div className="space-y-3">
                  {bySite.length === 0 && <p className="text-sm text-[hsl(var(--muted))]">No data.</p>}
                  {bySite.map((s) => (
                    <div key={s.name}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span>{s.name}</span>
                        <span className="text-[hsl(var(--muted))]">{s.compliance}% · {s.breached}/{s.total} breached</span>
                      </div>
                      <Bar pct={s.compliance} color={complianceColor(s.compliance)} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-[hsl(var(--muted))]">
              Compliance = occurrences resolved (or still open) within their SLA window, over the last 30 days.
              Green ≥ 90% · amber ≥ 75% · red below.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
