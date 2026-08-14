'use client';

// What the insight engine has learned about each occurrence type, and the
// place to correct it.
//
// The classification decides what every briefing, KPI tile and weekly email
// treats as a problem. Getting it wrong is not a cosmetic issue — calling a
// real incident "routine" hides it from the analysis entirely — so the
// decision is visible and a human always outranks the model. Correcting a row
// locks it, and the classifier will not touch it again.

import { useMemo, useState } from 'react';
import { AlertTriangle, Brain, Check, Loader2, Lock, ShieldAlert, Wrench } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface TypeMemoryRow {
  id: number;
  org_id: string;
  occurrence_type: string;
  kind: 'routine' | 'incident';
  rationale: string | null;
  decided_by: 'model' | 'human';
  confidence: number | null;
  locked: boolean;
}

export function AiTypeMemory({
  rows, orgs, activeOrgId,
}: {
  rows: TypeMemoryRow[];
  orgs: { id: string; name: string }[];
  activeOrgId: string | null;
}) {
  const [items, setItems] = useState(rows);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orgFilter, setOrgFilter] = useState<string>(activeOrgId ?? 'all');

  const orgName = useMemo(
    () => new Map(orgs.map((o) => [o.id, o.name])),
    [orgs],
  );

  const shown = useMemo(() => {
    const list = orgFilter === 'all' ? items : items.filter((i) => i.org_id === orgFilter);
    // Incidents first: those are the ones worth double-checking, because a
    // mistake there is a mistake that hides something.
    return [...list].sort((a, b) =>
      a.kind === b.kind
        ? a.occurrence_type.localeCompare(b.occurrence_type)
        : a.kind === 'incident' ? -1 : 1);
  }, [items, orgFilter]);

  const counts = useMemo(() => ({
    incident: shown.filter((i) => i.kind === 'incident').length,
    routine: shown.filter((i) => i.kind === 'routine').length,
    corrected: shown.filter((i) => i.decided_by === 'human').length,
  }), [shown]);

  async function flip(row: TypeMemoryRow) {
    setBusy(row.id);
    setError(null);
    const next = row.kind === 'routine' ? 'incident' : 'routine';
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any)
      .from('ai_type_memory')
      .update({
        kind: next,
        decided_by: 'human',
        // A human decision is final. The classifier skips locked rows, so this
        // will not be quietly reverted on the next run.
        locked: true,
        rationale: 'Corrected by a super user',
        decided_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    setBusy(null);
    if (err) { setError(err.message); return; }
    setItems((list) => list.map((i) =>
      i.id === row.id ? { ...i, kind: next, decided_by: 'human', locked: true, rationale: 'Corrected by a super user' } : i));
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Brain className="mx-auto h-8 w-8 text-[hsl(var(--muted))]" />
          <p className="mt-3 text-sm text-[hsl(var(--muted))]">
            Nothing learned yet. The engine classifies each occurrence type the first
            time it sees it, then reuses the answer — so this fills in after the next briefing.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-[hsl(var(--brand))]" />
          <span className="text-sm font-semibold">Learned occurrence types</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {counts.incident} incident
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {counts.routine} routine
          </span>
          {counts.corrected > 0 && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              {counts.corrected} corrected
            </span>
          )}
          {orgs.length > 1 && (
            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-xs"
            >
              <option value="all">All tenants</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <CardContent className="py-4">
        <p className="mb-4 text-sm text-[hsl(var(--muted))]">
          This is what the briefing treats as a problem. Routine types travel as counts,
          which is what keeps a 30-day briefing inside its token budget; incidents are
          described in full. A routine task that turns severe, breaches its SLA or is left
          open still surfaces on its own.
        </p>

        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-[hsl(var(--muted))]">
                <th className="py-2 pr-3 font-semibold">Occurrence type</th>
                {orgFilter === 'all' && <th className="py-2 pr-3 font-semibold">Tenant</th>}
                <th className="py-2 pr-3 font-semibold">Treated as</th>
                <th className="py-2 pr-3 font-semibold">Why</th>
                <th className="py-2 pr-3 font-semibold">Decided by</th>
                <th className="py-2 font-semibold text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-3 font-medium">{row.occurrence_type}</td>
                  {orgFilter === 'all' && (
                    <td className="py-2.5 pr-3 text-[hsl(var(--muted))]">{orgName.get(row.org_id) ?? '—'}</td>
                  )}
                  <td className="py-2.5 pr-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      row.kind === 'incident'
                        ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {row.kind === 'incident'
                        ? <><ShieldAlert className="h-3 w-3" /> Incident</>
                        : <><Wrench className="h-3 w-3" /> Routine</>}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-[hsl(var(--muted))]">
                    {row.rationale ?? '—'}
                    {row.confidence != null && row.decided_by === 'model' && (
                      <span className="ml-1 opacity-70">({Math.round(row.confidence * 100)}%)</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    {row.decided_by === 'human' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        <Lock className="h-3 w-3" /> Human
                      </span>
                    ) : (
                      <span className="text-xs text-[hsl(var(--muted))]">Model</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <Button
                      variant="secondary"
                      onClick={() => flip(row)}
                      disabled={busy === row.id}
                      className="!px-2 !py-1 text-xs"
                    >
                      {busy === row.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : row.kind === 'routine' ? 'Mark as incident' : 'Mark as routine'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 flex items-start gap-1.5 text-xs text-[hsl(var(--muted))]">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Correcting a type locks it. The classifier will not overrule a human decision,
          and the change applies to the next briefing for that tenant.
        </p>
      </CardContent>
    </Card>
  );
}
