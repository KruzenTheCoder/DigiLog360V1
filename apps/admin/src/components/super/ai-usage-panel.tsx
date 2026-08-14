'use client';

// Token spend over the last 24 hours.
//
// The daily allowance was previously something you discovered by having a
// briefing fail. Cache hits are shown alongside live calls because the ratio
// between them is the whole point of the insight engine: a cached briefing
// costs nothing, and on a quiet day most of them should be cached.

import { Activity, Database, Sparkles, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export interface UsageRow {
  mode: string;
  source: 'live' | 'cache';
  total_tokens: number;
  ok: boolean;
}

export function AiUsagePanel({ rows, cap }: { rows: UsageRow[]; cap: number }) {
  const live = rows.filter((r) => r.source === 'live');
  const cached = rows.filter((r) => r.source === 'cache');
  const used = live.reduce((s, r) => s + (r.total_tokens ?? 0), 0);
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const failures = rows.filter((r) => !r.ok).length;
  const hitRate = rows.length > 0 ? Math.round((cached.length / rows.length) * 100) : 0;

  const tone = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500';

  const byMode = new Map<string, number>();
  for (const r of live) byMode.set(r.mode, (byMode.get(r.mode) ?? 0) + (r.total_tokens ?? 0));

  return (
    <Card>
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <Activity className="h-4 w-4 text-[hsl(var(--brand))]" />
        <span className="text-sm font-semibold">Model usage — last 24 hours</span>
      </div>
      <CardContent className="py-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-[hsl(var(--muted))]">Tokens used</p>
            <p className="mt-1 text-2xl font-extrabold">{used.toLocaleString()}</p>
            <p className="text-xs text-[hsl(var(--muted))]">of {cap.toLocaleString()} allowed</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-[hsl(var(--muted))]">Served from cache</p>
            <p className="mt-1 text-2xl font-extrabold">{hitRate}%</p>
            <p className="text-xs text-[hsl(var(--muted))]">{cached.length} of {rows.length} requests, free</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-[hsl(var(--muted))]">Model calls</p>
            <p className="mt-1 text-2xl font-extrabold">{live.length}</p>
            <p className="text-xs text-[hsl(var(--muted))]">
              {live.length > 0 ? `${Math.round(used / live.length).toLocaleString()} tokens each` : 'none yet'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-[hsl(var(--muted))]">Failed</p>
            <p className={`mt-1 text-2xl font-extrabold ${failures > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
              {failures}
            </p>
            <p className="text-xs text-[hsl(var(--muted))]">quota or provider errors</p>
          </div>
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--surface))]">
          <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${pct}%` }} />
        </div>

        {byMode.size > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {[...byMode.entries()].sort((a, b) => b[1] - a[1]).map(([mode, n]) => (
              <span key={mode} className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--surface))] px-2.5 py-1">
                {mode === 'classify' ? <Sparkles className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                <span className="font-semibold">{mode}</span>
                <span className="text-[hsl(var(--muted))]">{n.toLocaleString()}</span>
              </span>
            ))}
          </div>
        )}

        <p className="mt-4 flex items-start gap-1.5 text-xs text-[hsl(var(--muted))]">
          <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Classification is a one-off cost per new occurrence type. Once a tenant&rsquo;s
          vocabulary is learned, briefings reuse it and only pay for the writing.
        </p>
      </CardContent>
    </Card>
  );
}
