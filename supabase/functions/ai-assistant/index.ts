// Digilog360 AI assistant, backed by Groq.
//
// POST body:
//   { mode: "insight", site_id?: uuid, days?: number, refresh?: boolean }
//       Reads the performance dashboard and writes it up. Cached per
//       org+site+window; `refresh` forces a regeneration.
//
//   { mode: "chat", message: string }
//       Conversational. The last few turns are replayed for continuity.
//
//   { mode: "history" } / { mode: "clear" }
//       Read or wipe the caller's own transcript.
//
// The operational context is gathered HERE, from the caller's own org, using
// the service role. Nothing about what gets sent to Groq is controlled by the
// browser — the client picks a mode and a site filter, and that is all.
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient, requireUser } from '../_shared/auth.ts';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Groq's largest general model. Fast enough for interactive use and strong
// enough to reason over a few hundred occurrence records.
const MODEL = Deno.env.get('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';

// How many occurrence records to hand the model. Enough to see a pattern,
// bounded so a busy org can't blow the context window or the bill.
const MAX_RECORDS = 200;

// deno-lint-ignore no-explicit-any
type Sb = any;

const SYSTEM_PROMPT = `You are the Digilog360 operations analyst — a security operations platform used by control rooms, supervisors and managers.

You are given real occurrence (incident) data for one organisation. Your job is to tell the operations team what is actually going on and what to do about it.

How to answer:
- Lead with the finding, not with preamble. Never open with "Based on the data provided".
- Be specific and quantitative. Cite counts, percentages, site names and occurrence types from the data. Never invent a number.
- Prioritise what is actionable: SLA breaches, repeat occurrences at one site, types that are trending up, workload piling on one person.
- Say plainly when the data is too thin to support a conclusion. Do not manufacture a trend from two records.
- Write in British English, in short paragraphs. No bullet-point soup, no headings unless genuinely useful.
- You are talking to security professionals. Be direct and concrete; skip the hedging and the motivational filler.

The data is confidential. Discuss it only with the user asking.`;

interface OccRow {
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
  logged_by: string | null;
}

async function callGroq(messages: Array<{ role: string; content: string }>, asJson = false) {
  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) return { ok: false as const, error: 'GROQ_API_KEY is not configured on this project.' };

  const resp = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, messages, temperature: 0.3, max_tokens: 2000,
      ...(asJson ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return { ok: false as const, error: `Groq ${resp.status}: ${body.slice(0, 300)}` };
  }
  const body = await resp.json().catch(() => ({}));
  const content = body?.choices?.[0]?.message?.content as string | undefined;
  if (!content) return { ok: false as const, error: 'Groq returned no content.' };
  return { ok: true as const, content, tokens: body?.usage?.total_tokens as number | undefined };
}

/**
 * Everything the model is allowed to see, gathered server-side.
 * Returns both a compact fact sheet (for auditing) and the prompt text.
 */
async function buildContext(admin: Sb, orgId: string, siteId: string | null, days: number) {
  const since = new Date(Date.now() - days * 864e5).toISOString();

  let q = admin
    .from('occurrences')
    .select('id, ob_number, occurrence_type, description, severity, status, site_name, site_id, incident_at, closed_at, sla_due_at, assigned_to, logged_by')
    .eq('org_id', orgId)
    .gte('incident_at', since)
    .order('incident_at', { ascending: false })
    .limit(MAX_RECORDS);
  if (siteId) q = q.eq('site_id', siteId);

  const [{ data: occRaw }, { data: people }, { data: sites }] = await Promise.all([
    q,
    admin.from('profiles').select('id, full_name, role').eq('org_id', orgId),
    admin.from('sites').select('id, name').eq('org_id', orgId),
  ]);

  const rows = (occRaw ?? []) as OccRow[];
  const nameOf = new Map<string, string>(
    ((people ?? []) as Array<{ id: string; full_name: string | null }>)
      .map((p) => [p.id, p.full_name ?? 'Unknown']),
  );

  const now = Date.now();
  const terminal = new Set(['resolved', 'closed', 'cancelled']);
  const open = rows.filter((r) => !terminal.has(String(r.status)));
  const breached = rows.filter((r) =>
    r.sla_due_at && !r.closed_at && new Date(r.sla_due_at).getTime() < now);

  const tally = (key: (r: OccRow) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = key(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const closed = rows.filter((r) => r.closed_at);
  const avgHours = closed.length
    ? Math.round(closed.reduce((s, r) =>
        s + (new Date(r.closed_at as string).getTime() - new Date(r.incident_at).getTime()), 0)
        / closed.length / 36e5)
    : null;

  const facts = {
    window_days: days,
    site_filter: siteId ? (((sites ?? []) as Array<{ id: string; name: string }>)
      .find((s) => s.id === siteId)?.name ?? siteId) : 'All sites',
    total: rows.length,
    truncated: rows.length >= MAX_RECORDS,
    open: open.length,
    resolved: rows.length - open.length,
    sla_breached: breached.length,
    avg_resolution_hours: avgHours,
    by_type: Object.fromEntries(tally((r) => r.occurrence_type).slice(0, 12)),
    by_site: Object.fromEntries(tally((r) => r.site_name).slice(0, 12)),
    by_severity: Object.fromEntries(tally((r) => r.severity)),
    by_status: Object.fromEntries(tally((r) => r.status)),
    by_assignee: Object.fromEntries(
      tally((r) => (r.assigned_to ? nameOf.get(r.assigned_to) ?? null : null)).slice(0, 10),
    ),
  };

  // Full records, per the configured data scope for this deployment.
  const records = rows.map((r) => [
    r.ob_number ?? `#${r.id}`,
    new Date(r.incident_at).toISOString().slice(0, 16).replace('T', ' '),
    r.site_name ?? '—',
    r.occurrence_type ?? '—',
    r.severity ?? '—',
    r.status ?? '—',
    r.assigned_to ? (nameOf.get(r.assigned_to) ?? '—') : 'unassigned',
    (r.description ?? '').replace(/\s+/g, ' ').slice(0, 220),
  ].join(' | ')).join('\n');

  const prompt = `SUMMARY STATISTICS (last ${days} days, ${facts.site_filter}):
${JSON.stringify(facts, null, 2)}

OCCURRENCE RECORDS${facts.truncated ? ` (most recent ${MAX_RECORDS} — older ones exist)` : ''}
Columns: OB | when | site | type | severity | status | assigned to | description
${records || '(no occurrences in this window)'}`;

  return { facts, prompt, count: rows.length };
}

/**
 * The measured half of the briefing. Every figure here is arithmetic on the
 * same facts handed to the model, so a tile can never contradict the prose —
 * and a wrong number can be traced to a query rather than to a hallucination.
 */
// deno-lint-ignore no-explicit-any
function buildKpis(f: any) {
  const total = Number(f.total ?? 0);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const topEntry = (obj: Record<string, number> | undefined) => {
    const e = Object.entries(obj ?? {});
    return e.length ? e[0] : null;
  };
  const topSite = topEntry(f.by_site);
  const topType = topEntry(f.by_type);
  const unassigned = total - Object.values<number>(f.by_assignee ?? {}).reduce((s, n) => s + Number(n), 0);

  return [
    {
      label: 'Occurrences', value: String(total), unit: `in ${f.window_days} days`,
      tone: 'neutral',
      note: f.truncated ? 'Capped at the most recent 200 for analysis' : 'All records in the window',
    },
    {
      label: 'Still open', value: String(f.open ?? 0), unit: `${pct(Number(f.open ?? 0))}% of total`,
      tone: pct(Number(f.open ?? 0)) > 40 ? 'bad' : 'good',
      note: `${f.resolved ?? 0} resolved or closed`,
    },
    {
      label: 'SLA breached', value: String(f.sla_breached ?? 0),
      unit: `${pct(Number(f.sla_breached ?? 0))}% of total`,
      tone: Number(f.sla_breached ?? 0) > 0 ? 'bad' : 'good',
      note: Number(f.sla_breached ?? 0) > 0 ? 'Past due and not closed' : 'Nothing past due',
    },
    {
      label: 'Avg resolution',
      value: f.avg_resolution_hours == null ? '—' : String(f.avg_resolution_hours),
      unit: 'hours to close', tone: 'neutral',
      note: 'Across everything closed in the window',
    },
    {
      label: 'Busiest site', value: topSite ? String(topSite[1]) : '—',
      unit: topSite ? `${pct(Number(topSite[1]))}% at ${topSite[0]}` : 'no data',
      tone: topSite && pct(Number(topSite[1])) > 60 ? 'warn' : 'neutral',
      note: 'Concentration of workload',
    },
    {
      label: 'Most common type', value: topType ? String(topType[1]) : '—',
      unit: topType ? String(topType[0]) : 'no data',
      tone: 'neutral', note: 'Single largest occurrence category',
    },
    {
      label: 'Unassigned', value: String(Math.max(0, unassigned)),
      unit: `${pct(Math.max(0, unassigned))}% of total`,
      tone: pct(Math.max(0, unassigned)) > 50 ? 'bad' : 'warn',
      note: 'Nobody accountable for these yet',
    },
  ];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = serviceClient();
  const result = await requireUser(req, admin);
  if (result.error) return json({ error: result.error }, 401);
  const { profile: caller } = result;
  if (!caller) return json({ error: 'No profile for caller' }, 403);

  const orgId = (caller as { org_id?: string }).org_id ?? '';
  const userId = (caller as { id: string }).id;
  if (!orgId) return json({ error: 'Caller has no organisation' }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const mode = String(body.mode ?? 'chat');

  // ── Transcript management ────────────────────────────────────────────────
  if (mode === 'history') {
    const { data } = await admin
      .from('ai_chat_messages')
      .select('id, role, content, created_at')
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .limit(100);
    return json({ ok: true, messages: data ?? [] });
  }

  if (mode === 'clear') {
    await admin.from('ai_chat_messages').delete().eq('user_id', userId);
    return json({ ok: true, cleared: true });
  }

  const siteId = typeof body.site_id === 'string' && body.site_id ? body.site_id : null;
  const days = Math.min(365, Math.max(1, Number(body.days) || 30));

  // ── Dashboard insight ────────────────────────────────────────────────────
  if (mode === 'insight') {
    const scopeKey = `${siteId ?? 'all'}:${days}`;

    if (!body.refresh) {
      const { data: cached } = await admin
        .from('ai_insights')
        .select('headline, body, facts, kpis, actions, model, created_at')
        .eq('org_id', orgId).eq('scope_key', scopeKey)
        .maybeSingle();
      // An hour old is still a fair read of a 30-day window, and it keeps the
      // dashboard instant for everyone after the first viewer.
      if (cached && Date.now() - new Date(cached.created_at).getTime() < 3600_000) {
        return json({ ok: true, cached: true, ...cached });
      }
    }

    const ctx = await buildContext(admin, orgId, siteId, days);
    if (ctx.count === 0) {
      return json({
        ok: true, cached: false,
        headline: 'Nothing to report yet',
        body: `No occurrences were logged in the last ${days} days for this view, so there is nothing to analyse.`,
        facts: ctx.facts,
      });
    }

    // KPIs come from the data, never from the model. A headline number an LLM
    // invented is worse than no number — these are arithmetic on the same
    // facts the model is shown, so the tiles and the prose cannot disagree.
    const kpis = buildKpis(ctx.facts);

    const res = await callGroq([
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${ctx.prompt}

Brief the manager who owns this dashboard, and tell them what to DO.

Reply with JSON only, in exactly this shape:
{
  "headline": "one sentence naming the single most important thing",
  "summary": "2-3 short paragraphs: what stands out, where risk is concentrated, what is trending wrong. Separate paragraphs with a blank line. Cite real sites, types and counts.",
  "actions": [
    {
      "title": "imperative, specific, doable this week",
      "why": "one sentence tying it to the numbers above",
      "priority": "high" | "medium" | "low",
      "owner": "a role or a named person from the data",
      "measure": "the number that tells you it worked, with a target"
    }
  ]
}

Give between 3 and 5 actions, ordered most important first. Every action must be something a security manager can actually start this week — not "review procedures" but what to review, where, and what the outcome should be. Every "measure" must be a number that can be checked against this dashboard next month.`,
      },
    ], true);
    if (!res.ok) return json({ error: res.error }, 502);

    // Parse defensively: a model asked for JSON can still return it fenced or
    // with a stray preamble, and a briefing is not worth failing over.
    let parsed: { headline?: string; summary?: string; actions?: unknown[] } = {};
    try {
      const raw = res.content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
      parsed = JSON.parse(raw);
    } catch {
      parsed = { headline: 'Operations briefing', summary: res.content.trim(), actions: [] };
    }

    const headline = String(parsed.headline ?? 'Operations briefing').trim();
    const text = String(parsed.summary ?? '').trim();
    const actions = Array.isArray(parsed.actions)
      ? parsed.actions.slice(0, 6).map((a) => {
          const x = a as Record<string, unknown>;
          return {
            title: String(x.title ?? '').trim(),
            why: String(x.why ?? '').trim(),
            priority: ['high', 'medium', 'low'].includes(String(x.priority)) ? String(x.priority) : 'medium',
            owner: String(x.owner ?? '').trim(),
            measure: String(x.measure ?? '').trim(),
          };
        }).filter((a) => a.title)
      : [];

    await admin.from('ai_insights').upsert({
      org_id: orgId, scope_key: scopeKey, site_id: siteId, days,
      headline, body: text, facts: ctx.facts, kpis, actions,
      model: MODEL, generated_by: userId,
      created_at: new Date().toISOString(),
    }, { onConflict: 'org_id,scope_key' });

    return json({ ok: true, cached: false, headline, body: text, facts: ctx.facts, kpis, actions, model: MODEL });
  }

  // ── Chat ─────────────────────────────────────────────────────────────────
  if (mode === 'chat') {
    const message = String(body.message ?? '').trim();
    if (!message) return json({ error: 'message is required' }, 400);
    if (message.length > 4000) return json({ error: 'Message is too long' }, 400);

    // Replay recent turns so follow-ups make sense, but keep it bounded —
    // the operational context below is far more valuable than turn 20.
    const { data: recent } = await admin
      .from('ai_chat_messages')
      .select('role, content')
      .eq('user_id', userId)
      .order('id', { ascending: false })
      .limit(10);
    const history = ((recent ?? []) as Array<{ role: string; content: string }>).reverse();

    const ctx = await buildContext(admin, orgId, siteId, days);

    const res = await callGroq([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `Current operational data you may draw on:\n\n${ctx.prompt}` },
      ...history,
      { role: 'user', content: message },
    ]);
    if (!res.ok) return json({ error: res.error }, 502);

    await admin.from('ai_chat_messages').insert([
      { org_id: orgId, user_id: userId, role: 'user', content: message },
      { org_id: orgId, user_id: userId, role: 'assistant', content: res.content, tokens: res.tokens ?? null },
    ]);

    return json({ ok: true, reply: res.content, model: MODEL, records_considered: ctx.count });
  }

  return json({ error: `Unknown mode "${mode}"` }, 400);
});
