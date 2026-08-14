'use client';

// The written read of the performance dashboard.
//
// Sits above the charts and says what the numbers mean. It does NOT generate
// on mount — an LLM call on every dashboard load would be slow and expensive,
// and most visits are a glance at the KPIs rather than a request for analysis.
// The first click generates and caches; everyone after that gets it instantly
// until the cache ages out.

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ListChecks, RefreshCw, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { functionErrorMessage } from '@/lib/fn-error';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Kpi {
  label: string; value: string; unit?: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral'; note?: string;
}
interface Action {
  title: string; why?: string;
  priority?: 'high' | 'medium' | 'low';
  owner?: string; measure?: string;
}
interface Insight {
  headline: string;
  body: string;
  kpis?: Kpi[];
  actions?: Action[];
  cached?: boolean;
  model?: string;
  created_at?: string;
}

const TONE: Record<string, string> = {
  good: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-red-600 dark:text-red-400',
  neutral: 'text-[hsl(var(--foreground))]',
};
const PRIORITY: Record<string, { label: string; cls: string }> = {
  high: { label: 'High', cls: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300' },
  medium: { label: 'Medium', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  low: { label: 'Low', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};

export function AiInsightPanel({ siteId, days = 30 }: { siteId?: string | null; days?: number }) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const load = useCallback(async (refresh: boolean) => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.functions.invoke('ai-assistant', {
      body: { mode: 'insight', site_id: siteId ?? null, days, refresh },
    });
    setBusy(false);
    const d = data as (Insight & { ok?: boolean; error?: string }) | null;
    if (err || !d?.ok) {
      setError(await functionErrorMessage(err, d, 'Could not generate the briefing.'));
      return;
    }
    setInsight(d);
  }, [siteId, days]);

  // On mount, take whatever is already cached — but never pay for a
  // generation the user didn't ask for.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      // ai_insights isn't in the generated types yet — same escape hatch used
      // for the other tables added after the last type generation.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb: any = supabase;
      const { data } = await sb
        .from('ai_insights')
        .select('headline, body, kpis, actions, created_at')
        .eq('scope_key', `${siteId ?? 'all'}:${days}`)
        .maybeSingle();
      if (!cancelled) {
        if (data) setInsight({ ...(data as unknown as Insight), cached: true });
        setChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [siteId, days]);

  return (
    <Card className="overflow-hidden border-[hsl(var(--brand))]/25">
      <div className="flex items-center justify-between gap-3 bg-brand-gradient px-5 py-3">
        <div className="flex items-center gap-2 text-white">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-semibold">AI briefing</span>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-white/85 transition hover:bg-white/15 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          {insight ? 'Regenerate' : 'Generate'}
        </button>
      </div>

      <CardContent className="py-5">
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!error && !insight && (
          <p className="text-sm text-[hsl(var(--muted))]">
            {busy
              ? 'Reading the last 30 days of occurrences…'
              : checked
                ? 'Generate a written read of this dashboard — what stands out, where the risk is concentrated, and what to act on this week.'
                : 'Checking for an existing briefing…'}
          </p>
        )}

        {insight && !error && (
          <div>
            <p className="text-base font-semibold leading-snug">{insight.headline}</p>

            {/* Measured figures — computed from the data, not written by the model. */}
            {!!insight.kpis?.length && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {insight.kpis.map((k) => (
                  <div key={k.label} className="rounded-xl border px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
                      {k.label}
                    </p>
                    <p className={`mt-0.5 text-2xl font-bold leading-none ${TONE[k.tone ?? 'neutral']}`}>
                      {k.value}
                    </p>
                    {k.unit && <p className="mt-1 text-[11px] text-[hsl(var(--muted))]">{k.unit}</p>}
                    {k.note && <p className="mt-0.5 text-[10px] text-[hsl(var(--muted))]">{k.note}</p>}
                  </div>
                ))}
              </div>
            )}

            {insight.body && (
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-[hsl(var(--muted))]">
                {insight.body.split(/\n{2,}/).map((para, i) => (
                  <p key={i}>{para.trim()}</p>
                ))}
              </div>
            )}

            {!!insight.actions?.length && (
              <div className="mt-5">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
                  <ListChecks className="h-3.5 w-3.5" /> Do this week
                </p>
                <ol className="space-y-2">
                  {insight.actions.map((a, i) => (
                    <li key={i} className="rounded-xl border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-semibold">{i + 1}. {a.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          PRIORITY[a.priority ?? 'medium'].cls
                        }`}>
                          {PRIORITY[a.priority ?? 'medium'].label}
                        </span>
                      </div>
                      {a.why && <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted))]">{a.why}</p>}
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
                        {a.owner && (
                          <span className="text-[hsl(var(--muted))]">
                            Owner: <strong className="text-[hsl(var(--foreground))]">{a.owner}</strong>
                          </span>
                        )}
                        {a.measure && (
                          <span className="text-[hsl(var(--muted))]">
                            Measure: <strong className="text-[hsl(var(--foreground))]">{a.measure}</strong>
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <p className="mt-4 text-[11px] text-[hsl(var(--muted))]">
              Figures are calculated from your occurrence data. The narrative and actions are
              AI-generated — check anything you plan to act on.
              {insight.created_at && ` Last updated ${new Date(insight.created_at).toLocaleString()}.`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
