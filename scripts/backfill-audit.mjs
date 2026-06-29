#!/usr/bin/env node
/**
 * DigiLog 360 — reconstruct the audit log from historical records.
 *
 * The audit_log only captures events from the moment live logging was wired in.
 * This script backfills entries for past operational transactions using the
 * REAL timestamp + actor already stored on each source row (an occurrence's
 * created_at, an update's created_at, a patrol's started_at, etc.). It does not
 * invent times or events — every backfilled row maps 1:1 to a real record.
 *
 * Each inserted row is tagged  metadata = { backfilled: true, source, source_id }
 * so reconstructed entries are clearly distinguishable from live-captured ones,
 * the run is idempotent (re-running inserts nothing new), and the whole backfill
 * is reversible with a single delete on that tag:
 *
 *     delete from public.audit_log where metadata->>'backfilled' = 'true';
 *
 * Usage:
 *   node scripts/backfill-audit.mjs            # DRY RUN — counts + samples, no writes
 *   node scripts/backfill-audit.mjs --commit   # actually insert the rows
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const COMMIT = process.argv.includes('--commit');
const trunc = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : s);

// Page through a table in 1000-row chunks (PostgREST's hard cap).
async function* pages(table, select, orderBy = 'id') {
  let from = 0;
  for (;;) {
    const { data, error } = await sb.from(table).select(select).order(orderBy, { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) return;
    yield data;
    if (data.length < 1000) return;
    from += 1000;
  }
}

// profiles → name/role, so we can fill actor_name/actor_role consistently.
const profileMap = new Map();
for await (const batch of pages('profiles', 'id, full_name, role')) {
  for (const p of batch) profileMap.set(p.id, p);
}

// Already-backfilled keys (idempotency) + live user.create target ids (dedup).
const doneKeys = new Set();
const liveUserCreate = new Set();
for await (const batch of pages('audit_log', 'action, target_id, metadata', 'id')) {
  for (const r of batch) {
    const m = r.metadata || {};
    if (m.backfilled === true || m.backfilled === 'true') doneKeys.add(`${r.action}|${m.source_id}`);
    else if (r.action === 'user.create' && r.target_id) liveUserCreate.add(String(r.target_id));
  }
}

// ---- source → audit-event mappings (real timestamp + real actor each) -------
const SOURCES = [
  {
    table: 'occurrences',
    select: 'id, ob_number, occurrence_type, severity, created_at, logged_by, logged_by_name, org_id',
    rows: (r) => [{
      action: 'occurrence.create', ts: r.created_at, actorId: r.logged_by, actorName: r.logged_by_name,
      org: r.org_id, targetTable: 'occurrences', targetId: r.id,
      summary: `OB ${r.ob_number ?? '#' + r.id} logged — ${r.occurrence_type} (${r.severity})`,
    }],
  },
  {
    table: 'occurrence_updates',
    select: 'id, occurrence_id, ob_number, status, notes, created_at, updated_by, updated_by_name, org_id',
    rows: (r) => [{
      action: 'occurrence.update', ts: r.created_at, actorId: r.updated_by, actorName: r.updated_by_name,
      org: r.org_id, targetTable: 'occurrences', targetId: r.occurrence_id,
      summary: `OB ${r.ob_number ?? '#' + r.occurrence_id} → ${r.status}${r.notes ? ': ' + trunc(r.notes, 80) : ''}`,
    }],
  },
  {
    table: 'occurrence_reports',
    select: 'id, occurrence_id, ob_number, created_at, created_by, org_id',
    rows: (r) => [{
      action: 'report.create', ts: r.created_at, actorId: r.created_by, actorName: null,
      org: r.org_id, targetTable: 'occurrence_reports', targetId: r.id,
      summary: `Report filed for OB ${r.ob_number ?? '#' + r.occurrence_id}`,
    }],
  },
  {
    table: 'patrols',
    select: 'id, guard_id, guard_name, started_at, ended_at, checkpoints_scanned, checkpoints_total, org_id',
    rows: (r) => {
      const out = [{
        action: 'patrol.start', ts: r.started_at, actorId: r.guard_id, actorName: r.guard_name,
        org: r.org_id, targetTable: 'patrols', targetId: r.id,
        summary: `Patrol started by ${r.guard_name}`,
      }];
      if (r.ended_at) out.push({
        action: 'patrol.end', ts: r.ended_at, actorId: r.guard_id, actorName: r.guard_name,
        org: r.org_id, targetTable: 'patrols', targetId: r.id,
        summary: `Patrol ended — ${r.checkpoints_scanned}/${r.checkpoints_total} checkpoints`,
      });
      return out;
    },
  },
  {
    table: 'checkpoint_scans',
    select: 'id, patrol_id, guard_id, method, scanned_at, org_id',
    rows: (r) => [{
      action: 'patrol.scan', ts: r.scanned_at, actorId: r.guard_id, actorName: null,
      org: r.org_id, targetTable: 'checkpoint_scans', targetId: r.id,
      summary: `Checkpoint scanned (${r.method})`,
    }],
  },
  {
    table: 'manager_acknowledgements',
    select: 'id, occurrence_id, ob_number, decision, reviewed_at, reviewed_by, reviewed_by_name, org_id',
    rows: (r) => [{
      action: 'manager.acknowledge', ts: r.reviewed_at, actorId: r.reviewed_by, actorName: r.reviewed_by_name,
      org: r.org_id, targetTable: 'occurrences', targetId: r.occurrence_id,
      summary: `OB ${r.ob_number ?? '#' + r.occurrence_id} ${r.decision} by manager`,
    }],
  },
  {
    table: 'profiles',
    select: 'id, email, full_name, role, created_at, org_id',
    // Creator is unknown for historical accounts → actor left null (honest).
    rows: (r) => [{
      action: 'user.create', ts: r.created_at, actorId: null, actorName: null,
      org: r.org_id, targetTable: 'profiles', targetId: r.id,
      summary: `Account created: ${r.email ?? r.full_name ?? r.id} (${r.role})`,
      skip: liveUserCreate.has(String(r.id)),  // already logged live
    }],
  },
];

// ---- build candidate rows ---------------------------------------------------
const toInsert = [];
const summary = {};
for (const src of SOURCES) {
  let considered = 0, added = 0;
  const samples = [];
  for await (const batch of pages(src.table, src.select)) {
    for (const r of batch) {
      for (const e of src.rows(r)) {
        considered++;
        if (e.skip) continue;
        if (!e.ts) continue;                                  // no real timestamp → cannot backfill
        const key = `${e.action}|${r.id}`;
        if (doneKeys.has(key)) continue;                      // already backfilled
        doneKeys.add(key);
        const prof = e.actorId ? profileMap.get(e.actorId) : null;
        const row = {
          org_id: e.org ?? null,
          actor_id: e.actorId ?? null,
          actor_name: e.actorName ?? prof?.full_name ?? null,
          actor_role: prof?.role ?? null,
          action: e.action,
          target_table: e.targetTable,
          target_id: String(e.targetId),
          summary: e.summary,
          metadata: { backfilled: true, source: src.table, source_id: r.id },
          created_at: e.ts,
        };
        toInsert.push(row);
        if (samples.length < 2) samples.push(row);
        added++;
      }
    }
  }
  summary[src.table] = { considered, added, samples };
}

// ---- report -----------------------------------------------------------------
console.log(`\n=== Audit backfill — ${COMMIT ? 'COMMIT' : 'DRY RUN (no writes)'} ===\n`);
let total = 0;
for (const [table, s] of Object.entries(summary)) {
  total += s.added;
  console.log(`${table.padEnd(26)} ${String(s.added).padStart(6)} new   (scanned ${s.considered})`);
  for (const ex of s.samples) {
    console.log(`    • ${ex.created_at}  ${ex.action.padEnd(20)} ${(ex.actor_name ?? '—').padEnd(18)} ${ex.summary}`);
  }
}
console.log(`\nTOTAL new audit entries: ${total}`);

if (!COMMIT) {
  console.log('\nDry run only — nothing written. Re-run with --commit to insert.');
  process.exit(0);
}

// ---- insert in batches ------------------------------------------------------
let written = 0;
for (let i = 0; i < toInsert.length; i += 500) {
  const chunk = toInsert.slice(i, i + 500);
  const { error } = await sb.from('audit_log').insert(chunk);
  if (error) { console.error(`Insert failed at row ${i}: ${error.message}`); process.exit(1); }
  written += chunk.length;
  process.stdout.write(`\rInserted ${written}/${toInsert.length}`);
}
console.log(`\nDone. ${written} audit entries reconstructed (tagged backfilled=true).`);
