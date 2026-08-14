'use client';

// The written read of the performance dashboard.
//
// Styled to the dashboard's own rhythm rather than inventing a second visual
// language: a GradientSection banner, three HeroKpi tiles, then a row of the
// same accent-bar counters the dashboard uses beneath its heroes. Routine
// activity gets its own slate section so its volume reads as context, not as
// a finding.
//
// It does NOT generate on mount — an LLM call on every dashboard load would be
// slow and costly, and most visits are a glance at the KPIs. The first click
// generates and caches; everyone after that gets it instantly.

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, ListChecks, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { functionErrorMessage } from '@/lib/fn-error';
import { Card } from '@/components/ui/card';
import { GradientSection } from '@/components/ui/gradient-section';
import { HeroKpi } from '@/components/dashboard/hero-kpi';

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
  /** Routine operations, reported apart so volume cannot drown the findings. */
  routine_kpis?: Kpi[];
  routine_note?: string | null;
  routine_types?: string[];
  cached?: boolean;
  created_at?: string;
}

// The briefing speaks in good/warn/bad; the dashboard speaks in its own tones.
// Translate once here so both surfaces stay in step.
const HERO_TONE: Record<string, 'red' | 'blue' | 'green' | 'violet'> = {
  bad: 'red', good: 'green', warn: 'violet', neutral: 'blue',
};
const ACCENT: Record<string, string> = {
  bad: 'bg-red-400', good: 'bg-emerald-400', warn: 'bg-amber-400', neutral: 'bg-brand',
};
const HERO_ICON = ['ClipboardList', 'Radio', 'AlertTriangle'];

const PRIORITY: Record<string, { label: string; bar: string; pill: string }> = {
  high: { label: 'High', bar: 'bg-red-400', pill: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300' },
  medium: { label: 'Medium', bar: 'bg-amber-400', pill: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  low: { label: 'Low', bar: 'bg-slate-300', pill: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};

export function AiInsightPanel(
  { siteId, days = 30, role }: { siteId?: string | null; days?: number; role: string },
) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  // Figures collapse away so the briefing can be read as prose, or the tiles
  // scanned on their own. Remembered per browser — a preference, not state.
  const [showKpis, setShowKpis] = useState(true);
  useEffect(() => {
    setShowKpis(window.localStorage.getItem('ai-kpis-collapsed') !== '1');
  }, []);
  const toggleKpis = () => setShowKpis((v) => {
    window.localStorage.setItem('ai-kpis-collapsed', v ? '1' : '0');
    return !v;
  });

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

  // Take whatever is already cached on mount, but never pay for a generation
  // the user didn't ask for.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // ai_insights isn't in the generated types yet — same escape hatch used
      // for the other tables added after the last type generation.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb: any = createClient();
      const { data } = await sb
        .from('ai_insights')
        .select('headline, body, kpis, actions, routine_kpis, routine_note, routine_types, created_at')
        .eq('scope_key', `${siteId ?? 'all'}:${days}:${role}`)
        .maybeSingle();
      if (!cancelled) {
        if (data) setInsight({ ...(data as unknown as Insight), cached: true });
        setChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [siteId, days, role]);

  const heroes = (insight?.kpis ?? []).slice(0, 3);
  const counters = (insight?.kpis ?? []).slice(3);

  return (
    <GradientSection
      title="AI Briefing"
      subtitle={insight ? 'Incidents only — routine activity is summarised separately' : undefined}
      icon="Sparkles"
      tone="brand"
      actions={
        <button
          type="button"
          onClick={() => load(true)}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-white/25 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          {insight ? 'Regenerate' : 'Generate'}
        </button>
      }
    >
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!error && !insight && (
        <p className="flex items-center gap-2 text-sm text-[hsl(var(--muted))]">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy
            ? 'Reading the last 30 days of occurrences…'
            : checked
              ? 'Generate a written read of this dashboard — what stands out, where risk is concentrated, and what to act on this week.'
              : 'Checking for an existing briefing…'}
        </p>
      )}

      {insight && !error && (
        <>
          <p className="text-lg font-bold leading-snug">{insight.headline}</p>

          {(heroes.length > 0 || counters.length > 0) && (
            <button
              type="button"
              onClick={toggleKpis}
              className="mt-4 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))] transition hover:text-[hsl(var(--foreground))]"
              aria-expanded={showKpis}
            >
              {showKpis ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Key figures
              {!showKpis && <span className="font-normal normal-case tracking-normal">({heroes.length + counters.length} hidden)</span>}
            </button>
          )}

          {/* Hero tiles — same component the dashboard uses above its charts. */}
          {showKpis && heroes.length > 0 && (
            <div className="mt-2 grid gap-4 md:grid-cols-3">
              {heroes.map((k, i) => (
                <HeroKpi
                  key={k.label}
                  tone={HERO_TONE[k.tone ?? 'neutral']}
                  icon={HERO_ICON[i] ?? 'Activity'}
                  label={k.label}
                  sublabel={k.unit}
                  value={k.value}
                  footer={k.note}
                />
              ))}
            </div>
          )}

          {/* Accent-bar counters — the dashboard's quick-counter pattern. */}
          {showKpis && counters.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {counters.map((k) => (
                <Card key={k.label} className="flex items-stretch overflow-hidden p-0">
                  <span className={`w-1.5 shrink-0 ${ACCENT[k.tone ?? 'neutral']}`} />
                  <div className="min-w-0 px-4 py-3">
                    <p className="truncate text-2xl font-extrabold leading-tight">{k.value}</p>
                    <p className="text-xs text-[hsl(var(--muted))]">{k.label}</p>
                    {k.unit && <p className="truncate text-[11px] text-[hsl(var(--muted))]">{k.unit}</p>}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {insight.body && (
            <div className="mt-5 space-y-3 text-sm leading-relaxed text-[hsl(var(--muted))]">
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
              <div className="grid gap-3 lg:grid-cols-2">
                {insight.actions.map((a, i) => {
                  const p = PRIORITY[a.priority ?? 'medium'];
                  return (
                    <Card key={i} className="flex items-stretch overflow-hidden p-0">
                      <span className={`w-1.5 shrink-0 ${p.bar}`} />
                      <div className="min-w-0 flex-1 px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-sm font-bold">{i + 1}. {a.title}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${p.pill}`}>
                            {p.label}
                          </span>
                        </div>
                        {a.why && (
                          <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted))]">{a.why}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
                          {a.owner && (
                            <span className="text-[hsl(var(--muted))]">
                              Owner <strong className="text-[hsl(var(--foreground))]">{a.owner}</strong>
                            </span>
                          )}
                          {a.measure && (
                            <span className="text-[hsl(var(--muted))]">
                              Measure <strong className="text-[hsl(var(--foreground))]">{a.measure}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Routine activity — context, not a finding. Its own section so the
              distinction is visual as well as textual. */}
          {(!!insight.routine_kpis?.length || insight.routine_note) && (
            <div className="mt-5">
              <GradientSection
                title="Routine Activity"
                subtitle="Normal operations — gate, warehouse and access logging"
                icon="Repeat"
                tone="slate"
              >
                {!!insight.routine_kpis?.length && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {insight.routine_kpis.map((k) => (
                      <Card key={k.label} className="flex items-stretch overflow-hidden p-0">
                        <span className="w-1.5 shrink-0 bg-slate-400" />
                        <div className="min-w-0 px-4 py-3">
                          <p className="truncate text-2xl font-extrabold leading-tight">{k.value}</p>
                          <p className="text-xs text-[hsl(var(--muted))]">{k.label}</p>
                          {k.unit && <p className="truncate text-[11px] text-[hsl(var(--muted))]">{k.unit}</p>}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
                {insight.routine_note && (
                  <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--muted))]">{insight.routine_note}</p>
                )}
                {!!insight.routine_types?.length && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {insight.routine_types.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-0.5 text-[11px] text-[hsl(var(--muted))]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </GradientSection>
            </div>
          )}

          <p className="mt-4 flex items-center gap-1.5 text-[11px] text-[hsl(var(--muted))]">
            <Sparkles className="h-3 w-3 shrink-0" />
            Figures are calculated from your occurrence data. The narrative and actions are
            AI-generated — check anything you plan to act on.
            {insight.created_at && ` Updated ${new Date(insight.created_at).toLocaleString()}.`}
          </p>
        </>
      )}
    </GradientSection>
  );
}
