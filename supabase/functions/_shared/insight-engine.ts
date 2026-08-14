// ============================================================================
// Digilog360 — the insight engine
//
// The old briefing sent the model 200 raw occurrences and asked it to do three
// jobs at once: classify the occurrence types, do the arithmetic, and write the
// analysis. Only the third is a job for a language model.
//
// Measured on real data, that cost ~6 300 tokens a run for PMI, of which 97%
// described gate and warehouse movements — and because the record cap bit
// before the window did, a briefing headed "last 30 days" actually saw 1.3
// days. A critical occurrence open since 5 August had never been in a prompt.
//
// This module splits the work by what each layer is good at:
//
//   FACTS      Postgres. Every number in the briefing is arithmetic over the
//              full window (ai_facts). The model is never asked for a figure
//              and can therefore never get one wrong.
//
//   MEMORY     ai_type_memory. Which occurrence types are routine operations
//              is a stable fact about a tenant, so it is learned once and
//              reused for ever. A human can override it, and their decision
//              is locked against the classifier.
//
//   RETRIEVAL  Only incidents carry descriptions into the prompt, plus routine
//              records behaving abnormally. Routine volume travels as counts.
//
//   BUDGET     ai_usage. Spend is recorded and checked before a call, so a
//              quota is something we manage rather than something we discover.
// ============================================================================

// deno-lint-ignore no-explicit-any
export type Sb = any;

export interface EngineFacts {
  window_days: number;
  generated_at: string;
  total: number;
  incident: {
    total: number; open: number; sla_breached: number; unassigned: number;
    avg_resolution_hours: number | null;
    by_type: Record<string, number>;
    by_site: Record<string, number>;
    by_severity: Record<string, number>;
    by_status: Record<string, number>;
  };
  routine: { total: number; by_type: Record<string, number>; by_site: Record<string, number> };
  routine_anomalies: number;
  unknown_types: string[];
  incident_trend: Array<{ week: string; incidents: number }>;
}

export interface IncidentRow {
  id: number;
  ob_number: string | null;
  occurrence_type: string | null;
  description: string | null;
  severity: string | null;
  status: string | null;
  site_name: string | null;
  incident_at: string;
  closed_at: string | null;
  sla_due_at: string | null;
  assigned_to: string | null;
  routine_anomaly: boolean;
}

/** Descriptions are the single largest line item; this is a generous clip. */
const DESC_CHARS = 160;
/** Incidents are few once routine is filtered out, so this rarely binds. */
export const MAX_INCIDENTS = 80;

// ─── Facts ──────────────────────────────────────────────────────────────────

export async function loadFacts(
  admin: Sb, orgId: string, days: number, siteId: string | null, siteIds: string[] | null,
): Promise<EngineFacts> {
  const { data, error } = await admin.rpc('ai_facts', {
    p_org: orgId, p_days: days, p_site: siteId, p_site_ids: siteIds,
  });
  if (error) throw new Error(`ai_facts: ${error.message}`);
  return data as EngineFacts;
}

export async function loadIncidents(
  admin: Sb, orgId: string, days: number, siteId: string | null, siteIds: string[] | null,
  limit = MAX_INCIDENTS,
): Promise<IncidentRow[]> {
  const { data, error } = await admin.rpc('ai_incident_records', {
    p_org: orgId, p_days: days, p_site: siteId, p_site_ids: siteIds, p_limit: limit,
  });
  if (error) throw new Error(`ai_incident_records: ${error.message}`);
  return (data ?? []) as IncidentRow[];
}

// ─── Learned classification ─────────────────────────────────────────────────

type Groq = (
  messages: Array<{ role: string; content: string }>, asJson?: boolean,
) => Promise<{ ok: true; content: string; tokens?: number } | { ok: false; error: string }>;

/**
 * Classify the occurrence types this tenant uses that we have not seen before,
 * and remember the answer.
 *
 * This is the only part of the pipeline that has to grow with a tenant's
 * vocabulary rather than with their volume — and vocabulary is small and
 * almost static. PMI has thirteen types across five thousand occurrences, so
 * after one run this call costs nothing for ever.
 */
export async function learnUnknownTypes(
  admin: Sb, orgId: string, unknown: string[], groq: Groq,
): Promise<{ learned: number; tokens: number }> {
  const types = unknown.filter((t) => typeof t === 'string' && t.trim()).slice(0, 40);
  if (types.length === 0) return { learned: 0, tokens: 0 };

  const res = await groq([
    {
      role: 'system',
      content:
        'You classify occurrence types used by a security operations platform.\n\n'
        + 'ROUTINE means the task IS the job being done correctly, on a schedule or on '
        + 'demand: opening and closing gates, warehouses or buildings, booking vehicles '
        + 'or visitors in and out, patrols, checkpoint scans, shift handovers, routine '
        + 'collections and deliveries. High volume is expected and healthy.\n\n'
        + 'INCIDENT means something went wrong or needs a response: intrusion, theft, '
        + 'damage, a fault or failure, fire or smoke, injury, an alarm, an unauthorised '
        + 'person or vehicle, a spill, a policy breach, a suspicious observation.\n\n'
        + 'Judge by what the NAME means. Ignore how often it occurs. When a name is '
        + 'ambiguous, choose incident — missing a real incident costs far more than '
        + 'over-reporting a routine one.',
    },
    {
      role: 'user',
      content:
        `Classify each occurrence type.\n\n${types.map((t) => `- ${t}`).join('\n')}\n\n`
        + 'Reply with JSON only:\n'
        + '{"types":[{"type":"exact name as given","kind":"routine|incident",'
        + '"confidence":0.0-1.0,"rationale":"at most 12 words"}]}',
    },
  ], true);

  if (!res.ok) return { learned: 0, tokens: 0 };

  let parsed: { types?: Array<Record<string, unknown>> } = {};
  try {
    parsed = JSON.parse(res.content.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return { learned: 0, tokens: res.tokens ?? 0 };
  }

  const known = new Set(types.map((t) => t.toLowerCase().trim()));
  const rows = (parsed.types ?? [])
    // Only accept verdicts for types we actually asked about, so a hallucinated
    // name cannot write itself into the tenant's memory.
    .filter((r) => known.has(String(r.type ?? '').toLowerCase().trim()))
    .map((r) => ({
      org_id: orgId,
      occurrence_type: String(r.type),
      kind: String(r.kind) === 'routine' ? 'routine' : 'incident',
      rationale: String(r.rationale ?? '').slice(0, 200) || null,
      decided_by: 'model',
      confidence: Number.isFinite(Number(r.confidence))
        ? Math.max(0, Math.min(1, Number(r.confidence)))
        : null,
      decided_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return { learned: 0, tokens: res.tokens ?? 0 };

  // A human decision outranks the classifier permanently, so locked rows are
  // left exactly as they are.
  const { data: lockedRows } = await admin
    .from('ai_type_memory').select('occurrence_type').eq('org_id', orgId).eq('locked', true);
  const locked = new Set(
    ((lockedRows ?? []) as Array<{ occurrence_type: string }>)
      .map((r) => r.occurrence_type.toLowerCase().trim()),
  );
  const writable = rows.filter((r) => !locked.has(r.occurrence_type.toLowerCase().trim()));
  if (writable.length === 0) return { learned: 0, tokens: res.tokens ?? 0 };

  const { error } = await admin
    .from('ai_type_memory').upsert(writable, { onConflict: 'org_id,occurrence_type' });
  if (error) return { learned: 0, tokens: res.tokens ?? 0 };

  return { learned: writable.length, tokens: res.tokens ?? 0 };
}

// ─── Prompt assembly ────────────────────────────────────────────────────────

const fmtWhen = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace('T', ' ');

/**
 * The prompt. Routine activity is three lines of counts; incidents are listed
 * in full. That inversion is the whole saving — and it is also why the model
 * now sees the entire window instead of the most recent day and a half.
 */
export function buildPrompt(
  facts: EngineFacts, rows: IncidentRow[], nameOf: Map<string, string>, siteLabel: string,
): string {
  const inc = facts.incident;
  const routineLines = Object.entries(facts.routine.by_type)
    .map(([t, n]) => `- ${t}: ${n}`)
    .join('\n') || '- (none)';

  const trend = facts.incident_trend.length
    ? facts.incident_trend.map((w) => `${w.week}: ${w.incidents}`).join('  |  ')
    : '(no data)';

  const line = (r: IncidentRow) => [
    r.ob_number ?? `#${r.id}`,
    fmtWhen(r.incident_at),
    r.site_name ?? '—',
    r.occurrence_type ?? '—',
    r.severity ?? '—',
    r.status ?? '—',
    r.assigned_to ? (nameOf.get(r.assigned_to) ?? '—') : 'UNASSIGNED',
    r.sla_due_at && !r.closed_at && new Date(r.sla_due_at).getTime() < Date.now() ? 'SLA-BREACHED' : '',
    r.routine_anomaly ? 'ROUTINE-TASK-GONE-WRONG' : '',
    (r.description ?? '').replace(/\s+/g, ' ').slice(0, DESC_CHARS),
  ].filter(Boolean).join(' | ');

  return `WINDOW: last ${facts.window_days} days, ${siteLabel}. ${facts.total} occurrences logged in total.

These figures are computed from the complete window. Use them; do not recount.

INCIDENTS (the part that needs analysis)
  total:            ${inc.total}
  still open:       ${inc.open}
  SLA breached:     ${inc.sla_breached}
  unassigned:       ${inc.unassigned}
  avg time to close: ${inc.avg_resolution_hours ?? '—'} hours
  by type:     ${JSON.stringify(inc.by_type)}
  by site:     ${JSON.stringify(inc.by_site)}
  by severity: ${JSON.stringify(inc.by_severity)}
  by status:   ${JSON.stringify(inc.by_status)}
  weekly incident counts: ${trend}

ROUTINE OPERATIONS (${facts.routine.total} records — the job being done, NOT a problem)
${routineLines}
${facts.routine_anomalies > 0
    ? `\n${facts.routine_anomalies} routine task(s) went wrong — severe, breaching, or left open. They are in the list below, tagged ROUTINE-TASK-GONE-WRONG.`
    : ''}

EVERY INCIDENT IN THE WINDOW${rows.length >= MAX_INCIDENTS ? ` (most serious ${rows.length}, unresolved first)` : ''}
Columns: OB | when | site | type | severity | status | owner | flags | description
${rows.map(line).join('\n') || '(none)'}`;
}

// ─── Content-addressed caching ──────────────────────────────────────────────

/**
 * A hash of the facts that drive the answer. The old cache expired an hour
 * after it was written, so a quiet Sunday cost the same as a busy Monday.
 * Keying on content means we regenerate when the numbers actually move.
 */
export async function factsHash(facts: EngineFacts, role: string, extra = ''): Promise<string> {
  const stable = JSON.stringify({
    role, extra,
    i: facts.incident,
    r: facts.routine.total,
    a: facts.routine_anomalies,
    w: facts.window_days,
  });
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// ─── Token ledger and budget guard ──────────────────────────────────────────

/** Groq's free on-demand tier. Kept slightly under so we degrade, not fail. */
const DAILY_TOKEN_CAP = Number(Deno.env.get('AI_DAILY_TOKEN_CAP') ?? '92000');

export async function tokensToday(admin: Sb): Promise<number> {
  const { data } = await admin.rpc('ai_tokens_today');
  return Number(data ?? 0);
}

export interface BudgetState { used: number; cap: number; remaining: number; exhausted: boolean }

export async function budget(admin: Sb): Promise<BudgetState> {
  const used = await tokensToday(admin);
  return {
    used, cap: DAILY_TOKEN_CAP,
    remaining: Math.max(0, DAILY_TOKEN_CAP - used),
    exhausted: used >= DAILY_TOKEN_CAP,
  };
}

export async function recordUsage(admin: Sb, row: {
  orgId: string | null; mode: string; model?: string | null;
  promptTokens?: number; completionTokens?: number; totalTokens?: number;
  source?: 'live' | 'cache'; cacheKey?: string | null; latencyMs?: number | null;
  ok?: boolean; error?: string | null;
}): Promise<void> {
  // Accounting must never take the feature down with it.
  try {
    await admin.from('ai_usage').insert({
      org_id: row.orgId, mode: row.mode, model: row.model ?? null,
      prompt_tokens: row.promptTokens ?? 0,
      completion_tokens: row.completionTokens ?? 0,
      total_tokens: row.totalTokens ?? 0,
      source: row.source ?? 'live',
      cache_key: row.cacheKey ?? null,
      latency_ms: row.latencyMs ?? null,
      ok: row.ok ?? true,
      error: row.error ?? null,
    });
  } catch { /* ignore */ }
}

/**
 * How many incident rows we can afford right now. Under pressure the engine
 * sheds detail rather than refusing — a shorter briefing beats no briefing,
 * and the ordering guarantees what it sheds is the least serious.
 */
export function affordableRows(state: BudgetState): number {
  if (state.remaining > 20000) return MAX_INCIDENTS;
  if (state.remaining > 8000) return 40;
  if (state.remaining > 3000) return 20;
  return 10;
}
