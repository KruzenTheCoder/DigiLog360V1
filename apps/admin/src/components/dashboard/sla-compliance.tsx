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

// Summary tile — a plain box, or a link when `href` is supplied.
function Tile({
  value, label, valueClass, valueStyle, href,
}: {
  value: string | number; label: string;
  valueClass?: string; valueStyle?: React.CSSProperties; href?: string;
}) {
  const Wrapper = href ? 'a' : 'div';
  return (
    <Wrapper
      {...(href ? { href } : {})}
      className={`block rounded-xl border p-4 text-center ${href ? 'transition hover:-translate-y-0.5 hover:shadow-md' : ''}`}
    >
      <p className={`text-3xl font-extrabold ${valueClass ?? ''}`} style={valueStyle}>{value}</p>
      <p className="mt-0.5 text-xs text-[hsl(var(--muted))]">{label}</p>
    </Wrapper>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// Percentages are shown to 2 decimals (no rounding-up) so a 99.20% rate never
// masquerades as a clean "99%".
const pct2 = (n: number) => `${n.toFixed(2)}%`;

export function SlaComplianceReport({
  complianceRate, within, breached, total, avgOverageHrs, bySeverity, bySite,
  hrefForSeverity, hrefForSite, hrefBreached,
}: {
  complianceRate: number;
  within: number;
  breached: number;
  total: number;
  avgOverageHrs: number;
  bySeverity: SevCompliance[];
  bySite: SiteCompliance[];
  hrefForSeverity?: (key: SeverityLevel) => string;
  hrefForSite?: (name: string) => string;
  hrefBreached?: string;
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
              <Tile value={pct2(complianceRate)} valueStyle={{ color: rateColor }} label="Compliance rate" />
              <Tile value={within} valueClass="text-emerald-600" label="Within SLA" />
              <Tile value={breached} valueClass="text-red-600" label="Breached" href={hrefBreached} />
              <Tile value={`${avgOverageHrs.toFixed(2)}h`} label="Avg breach overage" />
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
                  {bySeverity.map((s) => {
                    const href = hrefForSeverity?.(s.key);
                    const Row = href ? 'a' : 'div';
                    return (
                      <Row key={s.key} {...(href ? { href } : {})} className={href ? 'block rounded-md transition hover:bg-slate-50 dark:hover:bg-slate-800/40' : 'block'}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEVERITY_COLORS[s.key] }} />
                            {s.label}
                          </span>
                          <span className="text-[hsl(var(--muted))]">{s.compliance.toFixed(2)}% · {s.breached}/{s.total} breached</span>
                        </div>
                        <Bar pct={s.compliance} color={complianceColor(s.compliance)} />
                      </Row>
                    );
                  })}
                </div>
              </div>

              {/* By site */}
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
                  Compliance by site
                </h3>
                <div className="space-y-3">
                  {bySite.length === 0 && <p className="text-sm text-[hsl(var(--muted))]">No data.</p>}
                  {bySite.map((s) => {
                    const href = hrefForSite?.(s.name);
                    const Row = href ? 'a' : 'div';
                    return (
                      <Row key={s.name} {...(href ? { href } : {})} className={href ? 'block rounded-md transition hover:bg-slate-50 dark:hover:bg-slate-800/40' : 'block'}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span>{s.name}</span>
                          <span className="text-[hsl(var(--muted))]">{s.compliance.toFixed(2)}% · {s.breached}/{s.total} breached</span>
                        </div>
                        <Bar pct={s.compliance} color={complianceColor(s.compliance)} />
                      </Row>
                    );
                  })}
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
