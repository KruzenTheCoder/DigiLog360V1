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
import { renderDigestEmail } from '../_shared/email-templates.ts';
import {
  affordableRows, budget, buildPrompt, factsHash, learnUnknownTypes,
  loadFacts, loadIncidents, recordUsage, type EngineFacts,
} from '../_shared/insight-engine.ts';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Groq's largest general model. Fast enough for interactive use and strong
// enough to reason over a few hundred occurrence records.
const MODEL = Deno.env.get('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';

/**
 * What each role needs out of the same data. A guard asking "what should I
 * worry about" wants their shift; a manager wants their sites; an admin wants
 * the estate. Without this the briefing wrote the same board-level summary for
 * everyone, which is useful to almost nobody.
 */
const ROLE_BRIEF: Record<string, { label: string; focus: string }> = {
  guard: {
    label: 'Officer',
    focus: 'You are briefing an officer on the ground. Talk about their sites and their shift: what is still open where they work, what needs logging or closing out, and what to watch for on patrol. Keep it short and practical. No management analysis, no staffing recommendations, no budget talk.',
  },
  supervisor: {
    label: 'Supervisor',
    focus: 'You are briefing a shift supervisor. Focus on their team and sites: unclosed occurrences, anything past its deadline, gaps in coverage, and which officer needs support. Recommend things a supervisor can do on shift, not policy changes.',
  },
  control_room: {
    label: 'Control Room',
    focus: 'You are briefing a control room operator. Focus on what is live and unresolved right now, what is closest to breaching, and which sites are generating the most traffic this shift. Be terse and operational.',
  },
  manager: {
    label: 'Manager',
    focus: 'You are briefing a site manager. Focus on performance across their sites: SLA compliance, repeat incident patterns, workload distribution across their people, and what to raise with the team this week.',
  },
  admin: {
    label: 'Administrator',
    focus: 'You are briefing an organisation administrator. Take the whole estate: which sites carry the risk, where process is failing, ownership gaps, and what to escalate.',
  },
  super_user: {
    label: 'Platform Super User',
    focus: 'You are briefing the platform owner. Take the whole estate and be blunt about systemic problems — unassigned work, sites that never log, roles that never close anything.',
  },
};

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

ROUTINE ACTIVITY vs INCIDENTS — this matters more than anything else:
Many logged occurrences are ROUTINE OPERATIONS, not problems. Opening and closing a gate, opening and closing a warehouse, booking a vehicle in or out, a shift handover — these are the job being done correctly. A high count of them means the site is busy and the logging is working, NOT that something is wrong. Never describe routine volume as a risk, a trend to worry about, or evidence of a procedural failure.
An INCIDENT is something that went wrong or needs a response: a breach, an intrusion, theft, damage, a fault, an injury, a fire, an alarm, a broken boom, an unauthorised person or vehicle, a policy violation.
Judge by what the occurrence type MEANS, not by how often it appears. Your analysis, risk assessment and recommended actions must be about INCIDENTS. Mention routine activity only for coverage (is logging happening where it should?) or genuine anomalies (a site that logs no gate activity for a week).

The data is confidential. Discuss it only with the user asking.`;

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
 * The measured half of the briefing, built from the engine's facts.
 *
 * Every figure is arithmetic over the COMPLETE window, computed in Postgres,
 * so a tile can never contradict the prose — and a wrong number can be traced
 * to a query rather than to a hallucination. These also stand on their own
 * when the model is unavailable: the numbers are still true.
 */
function buildKpisFromFacts(facts: EngineFacts) {
  const inc = facts.incident;
  const total = inc.total;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const top = (obj: Record<string, number>) => {
    const e = Object.entries(obj ?? {});
    return e.length ? e[0] : null;
  };
  const topSite = top(inc.by_site);
  const topType = top(inc.by_type);

  return [
    {
      label: 'Incidents', value: String(total), unit: `in ${facts.window_days} days`,
      tone: 'neutral',
      note: `Out of ${facts.total} occurrences logged — routine activity excluded`,
    },
    {
      label: 'Still open', value: String(inc.open), unit: `${pct(inc.open)}% of incidents`,
      tone: pct(inc.open) > 40 ? 'bad' : 'good',
      note: `${total - inc.open} resolved or closed`,
    },
    {
      label: 'SLA breached', value: String(inc.sla_breached),
      unit: `${pct(inc.sla_breached)}% of incidents`,
      tone: inc.sla_breached > 0 ? 'bad' : 'good',
      note: inc.sla_breached > 0 ? 'Past due and not closed' : 'Nothing past due',
    },
    {
      label: 'Avg resolution',
      value: inc.avg_resolution_hours == null ? '—' : String(inc.avg_resolution_hours),
      unit: 'hours to close', tone: 'neutral',
      note: 'Across every incident closed in the window',
    },
    {
      label: 'Busiest site', value: topSite ? String(topSite[1]) : '—',
      unit: topSite ? `${pct(Number(topSite[1]))}% at ${topSite[0]}` : 'no data',
      tone: topSite && pct(Number(topSite[1])) > 60 ? 'warn' : 'neutral',
      note: 'Where incidents concentrate',
    },
    {
      label: 'Most common type', value: topType ? String(topType[1]) : '—',
      unit: topType ? String(topType[0]) : 'no data',
      tone: 'neutral', note: 'Largest incident category',
    },
    {
      label: 'Unassigned', value: String(inc.unassigned),
      unit: `${pct(inc.unassigned)}% of incidents`,
      tone: pct(inc.unassigned) > 50 ? 'bad' : 'warn',
      note: 'Nobody accountable for these yet',
    },
  ];
}

/** Routine activity is coverage evidence, not risk — reported separately. */
function routineKpisFromFacts(facts: EngineFacts) {
  if (facts.routine.total === 0) return [];
  const topRoutine = Object.entries(facts.routine.by_type)[0];
  const share = Math.round((facts.routine.total / Math.max(1, facts.total)) * 100);
  const tiles = [
    { label: 'Routine logs', value: String(facts.routine.total),
      unit: `${share}% of all activity`, tone: 'neutral',
      note: 'Gate, warehouse and access operations — the job being done' },
    { label: 'Most logged', value: topRoutine ? String(topRoutine[1]) : '—',
      unit: topRoutine ? String(topRoutine[0]) : 'none', tone: 'neutral',
      note: 'Highest-volume routine task' },
    { label: 'Sites covered', value: String(Object.keys(facts.routine.by_site).length),
      unit: 'logging routine activity', tone: 'neutral',
      note: 'A site missing here may not be logging' },
  ];
  if (facts.routine_anomalies > 0) {
    tiles.push({
      label: 'Went wrong', value: String(facts.routine_anomalies),
      unit: 'routine tasks', tone: 'warn',
      note: 'Severe, breaching or left open — pulled into the incident list',
    });
  }
  return tiles;
}

/** Assignee names, for turning ids into people in the prompt. */
async function loadNames(admin: Sb, orgId: string): Promise<Map<string, string>> {
  const { data } = await admin.from('profiles').select('id, full_name').eq('org_id', orgId);
  return new Map(((data ?? []) as Array<{ id: string; full_name: string | null }>)
    .map((p) => [p.id, p.full_name ?? 'Unknown']));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = serviceClient();

  // ── Weekly digest ────────────────────────────────────────────────────────
  // Driven by cron, which has no user session, so this is checked BEFORE the
  // per-user gate below. Authorised by the internal key or the service role.
  let peeked: Record<string, unknown> = {};
  try { peeked = await req.clone().json(); } catch { /* not JSON — fall through */ }
  if (peeked.mode === 'weekly_digest') {
    // Same acceptance rule as task-alerts: a project may run legacy JWT keys,
    // new sb_secret_ keys, or both, so a plain env comparison rejects a
    // perfectly valid service caller. Accept the internal header, an exact env
    // match, membership in SUPABASE_SECRET_KEYS, or a JWT whose role claim is
    // service_role (the platform verified its signature before this ran).
    const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const internalKey = Deno.env.get('INTERNAL_FN_KEY');
    const okInternal = !!internalKey && req.headers.get('x-internal-key') === internalKey;
    const okService = (() => {
      if (!bearer) return false;
      if (bearer === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return true;
      if (bearer.startsWith('sb_secret_')
          && (Deno.env.get('SUPABASE_SECRET_KEYS') ?? '').includes(bearer)) return true;
      const parts = bearer.split('.');
      if (parts.length === 3) {
        try {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          return payload?.role === 'service_role';
        } catch { return false; }
      }
      return false;
    })();
    if (!okInternal && !okService) return json({ error: 'Not authorised to run the digest' }, 401);
    return await runWeeklyDigest(admin, peeked);
  }
  const result = await requireUser(req, admin);
  if (result.error) return json({ error: result.error }, 401);
  const { profile: caller } = result;
  if (!caller) return json({ error: 'No profile for caller' }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const userId = (caller as { id: string }).id;
  const callerOrg = (caller as { org_id?: string }).org_id ?? '';

  // A super user is a PLATFORM account: it administers every tenant and is not
  // really a member of the one its profile happens to carry. So it may name the
  // organisation it is acting for — that is what the tenant picker in the
  // header selects. Everyone else is pinned to their own, whatever they send.
  const isSuper = (caller as { role?: string }).role === 'super_user';
  const requestedOrg = typeof body.org_id === 'string' && body.org_id ? body.org_id : null;
  const orgId = isSuper && requestedOrg ? requestedOrg : callerOrg;
  if (!orgId) return json({ error: 'No organisation to work with' }, 403);

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

  // The briefing is written FOR the reader, so the role travels with the
  // request and the caller's own sites bound what they are shown.
  const callerRole = String((caller as { role?: string }).role ?? 'guard');
  const roleBrief = ROLE_BRIEF[callerRole] ?? ROLE_BRIEF.guard;
  const callerSiteIds: string[] = (() => {
    const c = caller as { site_ids?: string[]; site_id?: string | null };
    const ids = new Set<string>(Array.isArray(c.site_ids) ? c.site_ids : []);
    if (c.site_id) ids.add(c.site_id);
    return [...ids];
  })();
  const scope = { role: callerRole, userId, siteIds: callerSiteIds };

  // ── Dashboard insight ────────────────────────────────────────────────────
  if (mode === 'insight') {
    // Super users can switch the briefing off per organisation — some will not
    // want occurrence text leaving the estate at all.
    const { data: orgRow } = await admin
      .from('organizations').select('ai_insights_enabled').eq('id', orgId).maybeSingle();
    if (orgRow && orgRow.ai_insights_enabled === false) {
      return json({ error: 'AI insights are switched off for this organisation.' }, 403);
    }

    // Role is part of the key: an officer and an admin must not share a cached
    // briefing, because they are not being told the same thing.
    const scopeKey = `${siteId ?? 'all'}:${days}:${callerRole}`;
    const startedAt = Date.now();

    // Roles below manager are bounded to their own sites; everyone else sees
    // the estate. Passing null means unscoped, not "no sites".
    const boundSites = ['admin', 'super_user', 'manager'].includes(callerRole) || callerSiteIds.length === 0
      ? null
      : callerSiteIds;

    // ── Facts first, and they are arithmetic ─────────────────────────────
    // Computed over the COMPLETE window in Postgres. The model is never asked
    // for a number, so a tile can never disagree with the prose above it.
    let facts = await loadFacts(admin, orgId, days, siteId, boundSites);

    if (facts.total === 0) {
      return json({
        ok: true, cached: false,
        headline: 'Nothing to report yet',
        body: `No occurrences were logged in the last ${days} days for this view, so there is nothing to analyse.`,
        facts,
      });
    }

    // ── Learn any occurrence types we have not classified before ──────────
    // Vocabulary, not volume: PMI has thirteen types across five thousand
    // occurrences, so this is a one-off cost per new type and then free.
    if (facts.unknown_types.length > 0) {
      const learned = await learnUnknownTypes(admin, orgId, facts.unknown_types, callGroq);
      if (learned.learned > 0) {
        await recordUsage(admin, {
          orgId, mode: 'classify', model: MODEL, totalTokens: learned.tokens,
          source: 'live', latencyMs: Date.now() - startedAt,
        });
        // Re-read: the routine/incident split has just changed underneath us.
        facts = await loadFacts(admin, orgId, days, siteId, boundSites);
      }
    }

    // ── Content-addressed cache ───────────────────────────────────────────
    // Keyed on the facts themselves rather than on a clock, so a quiet day
    // costs nothing and a moving one regenerates immediately.
    const hash = await factsHash(facts, callerRole);
    if (!body.refresh) {
      const { data: cached } = await admin
        .from('ai_insights')
        .select('headline, body, facts, kpis, actions, routine_kpis, routine_note, routine_types, model, created_at, facts_hash')
        .eq('org_id', orgId).eq('scope_key', scopeKey)
        .maybeSingle();
      if (cached && cached.facts_hash === hash) {
        await recordUsage(admin, {
          orgId, mode: 'insight', model: MODEL, source: 'cache',
          cacheKey: hash, latencyMs: Date.now() - startedAt,
        });
        return json({ ok: true, cached: true, ...cached });
      }
    }

    // ── Budget ────────────────────────────────────────────────────────────
    // Shed detail rather than refuse. The record ordering guarantees that what
    // gets shed is the least serious, never an open critical.
    const state = await budget(admin);
    if (state.exhausted) {
      const { data: stale } = await admin
        .from('ai_insights')
        .select('headline, body, facts, kpis, actions, routine_kpis, routine_note, routine_types, model, created_at')
        .eq('org_id', orgId).eq('scope_key', scopeKey).maybeSingle();
      // The KPIs are ours, so they stand even when the narrative cannot be
      // rewritten. A briefing with real numbers and yesterday's prose is far
      // better than an error card.
      return json({
        ok: true, cached: true, budget_exhausted: true,
        headline: stale?.headline ?? 'Model quota reached',
        body: stale?.body ?? 'The daily AI allowance is used up. The figures below are live; the written analysis will refresh once the allowance resets.',
        facts, kpis: buildKpisFromFacts(facts), actions: stale?.actions ?? [],
        routine_kpis: routineKpisFromFacts(facts), routine_note: stale?.routine_note ?? null,
        routine_types: stale?.routine_types ?? [], model: MODEL,
      });
    }

    const rows = await loadIncidents(admin, orgId, days, siteId, boundSites, affordableRows(state));
    const nameOf = await loadNames(admin, orgId);
    const siteLabel = siteId ? (facts.incident.by_site && Object.keys(facts.incident.by_site)[0]) || 'this site' : 'All sites';
    const promptText = buildPrompt(facts, rows, nameOf, siteLabel);

    const res = await callGroq([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `WHO YOU ARE BRIEFING: a ${roleBrief.label}. ${roleBrief.focus}` },
      {
        role: 'user',
        content: `${promptText}

Brief this ${roleBrief.label} on what matters to them, and tell them what to DO.

The routine/incident split above has already been made and is correct — do not re-do it, and do not treat routine volume as a problem. Analyse the incidents.

Reply with JSON only, in exactly this shape:
{
  "routine_note": "one sentence on routine activity — volume, whether logging coverage looks healthy, anything genuinely odd",
  "headline": "one sentence naming the single most important thing, about INCIDENTS",
  "summary": "2-3 short paragraphs about INCIDENTS: what stands out, where risk is concentrated, what is trending wrong. Separate paragraphs with a blank line. Cite real sites, types and counts from the figures given. Never invent a number.",
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

Anything tagged ROUTINE-TASK-GONE-WRONG is a routine task that failed — name it as that, not as a new category of incident. Anything tagged SLA-BREACHED or UNASSIGNED is a process failure worth an action.

Every action must address an INCIDENT pattern, never routine volume. Give between 3 and 5 actions, ordered most important first. Every action must be something a security manager can actually start this week — not "review procedures" but what to review, where, and what the outcome should be. Every "measure" must be a number that can be checked against this dashboard next month.`,
      },
    ], true);
    if (!res.ok) {
      await recordUsage(admin, {
        orgId, mode: 'insight', model: MODEL, source: 'live',
        latencyMs: Date.now() - startedAt, ok: false, error: res.error,
      });
      return json({ error: res.error }, 502);
    }
    await recordUsage(admin, {
      orgId, mode: 'insight', model: MODEL, totalTokens: res.tokens ?? 0,
      source: 'live', cacheKey: hash, latencyMs: Date.now() - startedAt,
    });

    // Parse defensively: a model asked for JSON can still return it fenced or
    // with a stray preamble, and a briefing is not worth failing over.
    let parsed: { headline?: string; summary?: string; actions?: unknown[] } = {};
    try {
      const raw = res.content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
      parsed = JSON.parse(raw);
    } catch {
      parsed = { headline: 'Operations briefing', summary: res.content.trim(), actions: [] };
    }

    // The split is the engine's, learned once and held in ai_type_memory, so
    // the tiles cannot disagree with the prose above them — and two people
    // reading the same dashboard cannot be shown different classifications.
    const routineTypes = Object.keys(facts.routine.by_type);
    const kpis = buildKpisFromFacts(facts);
    const routineKpis = routineKpisFromFacts(facts);
    const routineNote = String((parsed as { routine_note?: unknown }).routine_note ?? '').trim() || null;

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
      headline, body: text, facts, kpis, actions,
      routine_kpis: routineKpis, routine_note: routineNote, routine_types: routineTypes,
      audience_role: callerRole, model: MODEL, generated_by: userId,
      facts_hash: hash, created_at: new Date().toISOString(),
    }, { onConflict: 'org_id,scope_key' });

    return json({ ok: true, cached: false, headline, body: text, facts, kpis, actions,
      routine_kpis: routineKpis, routine_note: routineNote, routine_types: routineTypes,
      model: MODEL, incidents_considered: rows.length });
  }

  // ── Chat ─────────────────────────────────────────────────────────────────
  if (mode === 'chat') {
    // Chat is an AI feature too, so the master switch must cover it.
    const { data: orgChat } = await admin
      .from('organizations').select('ai_chat_enabled').eq('id', orgId).maybeSingle();
    if (orgChat && orgChat.ai_chat_enabled === false) {
      return json({ error: 'The AI assistant is switched off for this organisation.' }, 403);
    }
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

    // Chat draws on the SAME facts as the dashboard briefing, so the assistant
    // cannot quote a number the tiles disagree with. It also inherits the full
    // window: asking "what happened this month" used to be answered from the
    // most recent day and a half.
    const chatStarted = Date.now();
    const boundSites = ['admin', 'super_user', 'manager'].includes(callerRole) || callerSiteIds.length === 0
      ? null
      : callerSiteIds;

    const state = await budget(admin);
    if (state.exhausted) {
      return json({
        error: 'The daily AI allowance is used up. Figures on the dashboard are still live; the assistant will answer again once it resets.',
      }, 429);
    }

    const facts = await loadFacts(admin, orgId, days, siteId, boundSites);
    if (facts.unknown_types.length > 0) {
      await learnUnknownTypes(admin, orgId, facts.unknown_types, callGroq);
    }
    const rows = await loadIncidents(admin, orgId, days, siteId, boundSites, affordableRows(state));
    const nameOf = await loadNames(admin, orgId);
    const promptText = buildPrompt(facts, rows, nameOf, siteId ? 'this site' : 'All sites');

    const res = await callGroq([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `WHO YOU ARE TALKING TO: a ${roleBrief.label}. ${roleBrief.focus}` },
      { role: 'system', content: `Current operational data you may draw on. The routine/incident split has already been made and is correct.\n\n${promptText}` },
      ...history,
      { role: 'user', content: message },
    ]);
    if (!res.ok) {
      await recordUsage(admin, {
        orgId, mode: 'chat', model: MODEL, source: 'live',
        latencyMs: Date.now() - chatStarted, ok: false, error: res.error,
      });
      return json({ error: res.error }, 502);
    }
    await recordUsage(admin, {
      orgId, mode: 'chat', model: MODEL, totalTokens: res.tokens ?? 0,
      source: 'live', latencyMs: Date.now() - chatStarted,
    });

    await admin.from('ai_chat_messages').insert([
      { org_id: orgId, user_id: userId, role: 'user', content: message },
      { org_id: orgId, user_id: userId, role: 'assistant', content: res.content, tokens: res.tokens ?? null },
    ]);

    return json({ ok: true, reply: res.content, model: MODEL, incidents_considered: rows.length });
  }

  return json({ error: `Unknown mode "${mode}"` }, 400);
});

/**
 * The Monday "week ahead" mail.
 *
 * Runs per organisation that has the digest switched on, writes one edition
 * PER ROLE (a supervisor and an admin are told different things), and sends it
 * to everyone holding that role. Every run is recorded in ai_digest_log, so a
 * week where nothing arrived is visible rather than silent.
 */
async function runWeeklyDigest(admin: Sb, body: Record<string, unknown>) {
  const appUrl = (Deno.env.get('PUBLIC_APP_URL') ?? '').replace(/\/+$/, '') || null;
  const onlyOrg = typeof body.org_id === 'string' ? body.org_id : null;
  // A dry run renders and returns without sending — used to preview an edition.
  const dryRun = body.dry_run === true;
  const overrideTo = typeof body.to === 'string' && body.to ? body.to : null;

  let orgQ = admin
    .from('organizations')
    .select('id, name, ai_insights_enabled, ai_weekly_digest_enabled, ai_digest_roles');
  if (onlyOrg) orgQ = orgQ.eq('id', onlyOrg);
  const { data: orgsRaw } = await orgQ;

  const orgs = ((orgsRaw ?? []) as Array<{
    id: string; name: string;
    ai_insights_enabled: boolean | null;
    ai_weekly_digest_enabled: boolean | null;
    ai_digest_roles: string[] | null;
  }>).filter((o) =>
    o.ai_insights_enabled !== false
    // A one-off test may target an org that has not switched the weekly on yet.
    && (o.ai_weekly_digest_enabled === true || !!onlyOrg));

  const results: unknown[] = [];

  for (const org of orgs) {
    const roles = (org.ai_digest_roles ?? ['admin', 'manager']).filter(Boolean);
    const { data: settings } = await admin
      .from('org_email_settings').select('*').eq('org_id', org.id).maybeSingle();

    let sent = 0; let failed = 0; let recipients = 0;
    let firstHeadline: string | null = null;

    // The facts and the incident list are the same for every role — only the
    // framing differs — so they are fetched once per org rather than per role.
    let orgFacts = await loadFacts(admin, org.id, 7, null, null);
    if (orgFacts.unknown_types.length > 0) {
      const learned = await learnUnknownTypes(admin, org.id, orgFacts.unknown_types, callGroq);
      if (learned.learned > 0) {
        await recordUsage(admin, {
          orgId: org.id, mode: 'classify', model: MODEL, totalTokens: learned.tokens, source: 'live',
        });
        orgFacts = await loadFacts(admin, org.id, 7, null, null);
      }
    }
    const orgRows = await loadIncidents(admin, org.id, 7, null, null, 60);
    const orgNames = await loadNames(admin, org.id);
    const orgPrompt = buildPrompt(orgFacts, orgRows, orgNames, 'All sites');
    if (orgFacts.total === 0) continue;

    for (const role of roles) {
      const { data: peopleRaw } = await admin
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('org_id', org.id).eq('role', role);
      const people = ((peopleRaw ?? []) as Array<{
        id: string; full_name: string | null; email: string | null; role: string;
      }>).filter((p) => (p.email ?? '').includes('@'));
      if (people.length === 0) continue;

      const brief = ROLE_BRIEF[role] ?? ROLE_BRIEF.guard;
      // One generation per role, shared by everyone holding it — the analysis
      // is about the organisation, not the individual.
      const ask = [
        orgPrompt,
        '',
        'This is the WEEK AHEAD briefing, sent on a Monday morning. Summarise the week just gone and say what to do in the week starting now.',
        'The routine/incident split above has already been made and is correct — do not re-do it.',
        '',
        'Reply with JSON only:',
        '{',
        '  "routine_note": "one sentence on routine activity and logging coverage",',
        '  "headline": "one sentence this reader should see first",',
        '  "summary": "2-3 short paragraphs about INCIDENTS — what happened, what is still open going into this week, what to expect",',
        '  "actions": [{"title":"","why":"","priority":"high|medium|low","owner":"","measure":""}]',
        '}',
        '',
        'Three to four actions, each doable this week.',
      ].join('\n');

      const res = await callGroq([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: `WHO YOU ARE BRIEFING: a ${brief.label}. ${brief.focus}` },
        { role: 'user', content: ask },
      ], true);
      // Keep the reason. A weekly job nobody watches must not fail silently —
      // "failed: 3" with no cause is indistinguishable from a send problem.
      if (!res.ok) {
        failed += people.length;
        results.push({ org: org.name, role, generate_error: res.error });
        continue;
      }

      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(res.content.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
      } catch {
        failed += people.length;
        results.push({ org: org.name, role, parse_error: res.content.slice(0, 200) });
        continue;
      }

      // The figures come from the engine's facts, not from the model and not
      // from a re-derived split, so the email and the dashboard agree.
      const inc = orgFacts.incident;
      const topSite = Object.entries(inc.by_site)[0];

      const kpis = [
        { label: 'Incidents', value: String(inc.total), unit: 'in the last 7 days' },
        { label: 'Still open', value: String(inc.open), unit: 'going into this week' },
        { label: 'SLA breached', value: String(inc.sla_breached), unit: 'past due, not closed' },
        {
          label: 'Busiest site',
          value: topSite ? String(topSite[1]) : '—',
          unit: topSite ? String(topSite[0]) : 'no data',
        },
      ];
      const headline = String(parsed.headline ?? 'Your week ahead').trim();
      if (firstHeadline === null) firstHeadline = headline;

      const weekLabel = (() => {
        const d = new Date();
        const end = new Date(d.getTime() + 6 * 864e5);
        const fmt = (x: Date) => x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        return `${fmt(d)} – ${fmt(end)}`;
      })();

      const actions = Array.isArray(parsed.actions)
        ? (parsed.actions as Record<string, unknown>[]).slice(0, 4).map((a) => ({
            title: String(a.title ?? ''),
            why: String(a.why ?? ''),
            owner: String(a.owner ?? ''),
            measure: String(a.measure ?? ''),
            priority: (['high', 'medium', 'low'].includes(String(a.priority))
              ? String(a.priority) : 'medium') as 'high' | 'medium' | 'low',
          })).filter((a) => a.title)
        : [];

      for (const p of people) {
        const mail = renderDigestEmail({
          orgName: org.name,
          appUrl,
          recipientName: (p.full_name ?? '').split(' ')[0] || null,
          audienceLabel: brief.label,
          headline,
          summary: String(parsed.summary ?? '').trim(),
          kpis,
          actions,
          routineNote: String(parsed.routine_note ?? '').trim() || null,
          weekLabel,
        }, settings);

        recipients += 1;
        if (dryRun) {
          results.push({
            org: org.name, role, to: overrideTo ?? p.email,
            subject: mail.subject, dry_run: true, html: mail.html,
          });
          continue;
        }

        const to = overrideTo ?? (p.email as string);
        const send = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Both header slots carry the SAME key. The gateway rejects a
            // request whose `apikey` and `Authorization` name different keys
            // ("Conflicting API keys"), and the anon key is issued in the new
            // sb_publishable_ format while the service key is still a JWT — so
            // pairing them silently broke every weekly digest. The internal
            // key is what send-email itself checks once past the gateway.
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
            apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            'x-internal-key': Deno.env.get('INTERNAL_FN_KEY') ?? '',
          },
          body: JSON.stringify({ to, subject: mail.subject, html: mail.html, text: mail.text }),
        });
        if (send.ok) {
          sent += 1;
        } else {
          failed += 1;
          // Keep the reason — a digest that silently fails to send is the
          // worst possible outcome for a weekly job nobody is watching.
          const why = await send.text().catch(() => '');
          results.push({ org: org.name, role, to, send_error: `${send.status}: ${why.slice(0, 200)}` });
        }
        // An override address means "send me one sample", not one per person.
        if (overrideTo) break;
      }
      if (overrideTo) break;
    }

    if (!dryRun) {
      await admin.from('ai_digest_log').insert({
        org_id: org.id, recipients, sent, failed, headline: firstHeadline,
      });
    }
    results.push({ org: org.name, recipients, sent, failed, headline: firstHeadline });
  }

  return json({ ok: true, organisations: orgs.length, results });
}
