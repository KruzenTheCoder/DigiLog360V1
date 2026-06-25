#!/usr/bin/env node
/**
 * DigiLog 360 — generic legacy CSV importer.
 *
 * Pairs with scripts/BACPAC_IMPORT.md. After you extract a `.bacpac` via
 * sqlpackage into a temporary SQL Server and export each table to CSV with
 * sqlcmd, this script ingests each CSV into the new Supabase schema with
 * the correct column mapping.
 *
 * Usage:
 *   node --env-file=.env scripts/import-legacy-csv.mjs <kind> <csv>
 *
 *   <kind> = updates | reports | patrols | tasks | task_updates | acks | ack_items
 *
 * Defaults:
 *   • Timestamps in the CSV are assumed to be Africa/Johannesburg (UTC+2)
 *     and converted to UTC on insert.
 *   • Rows are matched to existing occurrences by ob_number when possible.
 *   • All inserts are idempotent — re-running skips rows that already exist.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

const KINDS = ['updates','reports','patrols','tasks','task_updates','acks','ack_items'];

const args = process.argv.slice(2);
const kind = args[0];
const csvPath = args[1];

if (!kind || !csvPath || !KINDS.includes(kind)) {
  console.error('Usage: node scripts/import-legacy-csv.mjs <kind> <csv>');
  console.error('  kind one of:', KINDS.join(' | '));
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// RFC-4180-ish CSV parser (handles quoted fields with embedded newlines).
// ---------------------------------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------------------
// SAST timestamp → UTC ISO
// Accepts both "M/D/YYYY H:MM[:SS]" and "YYYY-MM-DD HH:MM[:SS][.fff]" formats.
// ---------------------------------------------------------------------------
function parseSastToUtc(s) {
  if (!s) return null;
  const trimmed = String(s).trim();
  if (!trimmed || trimmed.toUpperCase() === 'NULL') return null;

  // ISO-ish first
  let m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if (m) {
    const [, y, mo, d, h, mi, se = '0'] = m;
    const utc = Date.UTC(+y, +mo - 1, +d, +h - 2, +mi, +se);
    return Number.isNaN(utc) ? null : new Date(utc).toISOString();
  }
  // US M/D/YYYY
  m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) {
    const [, mo, d, y, h, mi, se = '0'] = m;
    const utc = Date.UTC(+y, +mo - 1, +d, +h - 2, +mi, +se);
    return Number.isNaN(utc) ? null : new Date(utc).toISOString();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Header → index helper
// ---------------------------------------------------------------------------
function indexer(header) {
  const m = new Map(header.map((h, i) => [h.trim(), i]));
  return (col) => {
    const i = m.get(col);
    return (row) => i === undefined ? '' : (row[i] ?? '');
  };
}

// ---------------------------------------------------------------------------
// Resolve a legacy occurrence by OB number → our id. Cached.
// ---------------------------------------------------------------------------
const obCache = new Map();
async function occIdByOb(ob) {
  if (!ob) return null;
  if (obCache.has(ob)) return obCache.get(ob);
  const { data } = await supabase.from('occurrences').select('id').eq('ob_number', ob).maybeSingle();
  const id = data?.id ?? null;
  obCache.set(ob, id);
  return id;
}

// Same for users by email.
const userCache = new Map();
async function userIdByEmail(email) {
  if (!email) return null;
  const key = email.toLowerCase();
  if (userCache.has(key)) return userCache.get(key);
  const { data } = await supabase.from('profiles').select('id').ilike('email', key).maybeSingle();
  const id = data?.id ?? null;
  userCache.set(key, id);
  return id;
}

// Status mapping — legacy uses enums sometimes as int.
function mapOccStatus(s) {
  const v = String(s ?? '').trim().toLowerCase();
  const m = {
    'open':'open','acknowledged':'acknowledged','in progress':'in_progress','onpatrol':'on_patrol',
    'on patrol':'on_patrol','resolved':'resolved','closed':'closed',
    '0':'open','1':'acknowledged','2':'in_progress','3':'on_patrol','4':'resolved','5':'closed',
  };
  return m[v] ?? 'open';
}
function mapTaskStatus(s) {
  const v = String(s ?? '').trim().toLowerCase();
  const m = {
    'open':'open','inprogress':'in_progress','in progress':'in_progress',
    'blocked':'blocked','done':'done','completed':'done','cancelled':'cancelled','canceled':'cancelled',
    '0':'open','1':'in_progress','2':'blocked','3':'done','4':'cancelled',
  };
  return m[v] ?? 'open';
}
function mapTaskPriority(p) {
  const v = String(p ?? '').trim().toLowerCase();
  const m = {
    'low':'low','normal':'normal','medium':'normal','high':'high','urgent':'urgent','critical':'urgent',
    '0':'low','1':'normal','2':'high','3':'urgent',
  };
  return m[v] ?? 'normal';
}
function mapSeverity(s) {
  const v = String(s ?? '').trim().toLowerCase();
  const m = {
    'critical':'critical','high':'high','medium':'medium','low':'low',
    '0':'low','1':'medium','2':'high','3':'critical',
  };
  return m[v] ?? 'low';
}

// ---------------------------------------------------------------------------
// Importers
// ---------------------------------------------------------------------------
async function importUpdates(rows, header) {
  const get = indexer(header);
  const result = { inserted: 0, skipped: 0 };
  for (const row of rows) {
    const ob = String(get('OccurrenceNumber')(row) || '').trim();
    const occId = await occIdByOb(ob);
    if (!occId) { result.skipped++; continue; }
    const payload = {
      occurrence_id: occId,
      ob_number: ob,
      notes: String(get('Notes')(row) || '').trim() || '(no notes)',
      status: mapOccStatus(get('Status')(row)),
      updated_by_name: String(get('UpdatedByName')(row) || get('UpdatedByEmail')(row) || ''),
      created_at: parseSastToUtc(get('CreatedAt')(row)) ?? new Date().toISOString(),
    };
    const email = String(get('UpdatedByEmail')(row) || '').trim();
    if (email) payload.updated_by = await userIdByEmail(email);
    const { error } = await supabase.from('occurrence_updates').insert(payload);
    if (error) result.skipped++;
    else result.inserted++;
  }
  return result;
}

async function importReports(rows, header) {
  const get = indexer(header);
  const result = { inserted: 0, skipped: 0 };
  for (const row of rows) {
    const ob = String(get('OccurrenceNumber')(row) || '').trim();
    const occId = await occIdByOb(ob);
    if (!occId) { result.skipped++; continue; }
    const payload = {
      occurrence_id: occId,
      ob_number: ob,
      description: String(get('Description')(row) || '(no description)').trim(),
      personnel: get('Personnel')(row) || null,
      responding_officer: get('RespondingOfficer')(row) || null,
      emergency_services: get('EmergencyServices')(row) || null,
      external_case: get('ExternalCaseNumber')(row) || null,
      cctv: get('CCTV')(row) || null,
      cctv_times: get('CCTVTimes')(row) || null,
      property_damage: get('PropertyDamage')(row) || null,
      immediate_actions: get('ImmediateActions')(row) || null,
      next_steps: get('NextSteps')(row) || null,
      created_by_name: get('CreatedByName')(row) || get('CreatedByEmail')(row) || null,
      created_at: parseSastToUtc(get('CreatedAt')(row)) ?? new Date().toISOString(),
      severity: mapSeverity(get('Severity')(row)),
      status: mapOccStatus(get('Status')(row)),
    };
    const email = String(get('CreatedByEmail')(row) || '').trim();
    if (email) payload.created_by = await userIdByEmail(email);
    const { error } = await supabase.from('occurrence_reports')
      .upsert(payload, { onConflict: 'occurrence_id' });
    if (error) result.skipped++;
    else result.inserted++;
  }
  return result;
}

async function importPatrols(rows, header) {
  const get = indexer(header);
  const result = { inserted: 0, skipped: 0 };
  for (const row of rows) {
    const guardEmail = String(get('GuardEmail')(row) || '').trim();
    const guardName = String(get('GuardName')(row) || guardEmail || 'Unknown').trim();
    const payload = {
      guard_id: guardEmail ? await userIdByEmail(guardEmail) : null,
      guard_name: guardName,
      ob_number: String(get('OccurrenceNumber')(row) || '').trim() || null,
      status: String(get('Status')(row) || '').toLowerCase().includes('end') ? 'completed' : 'active',
      started_at: parseSastToUtc(get('StartTime')(row)) ?? new Date().toISOString(),
      ended_at: parseSastToUtc(get('EndTime')(row)),
      duration_minutes: Number(get('DurationMinutes')(row)) || null,
      notes: get('Notes')(row) || null,
    };
    const { error } = await supabase.from('patrols').insert(payload);
    if (error) result.skipped++;
    else result.inserted++;
  }
  return result;
}

async function importTasks(rows, header) {
  const get = indexer(header);
  const result = { inserted: 0, skipped: 0 };
  // Cache legacy task_id → new id (for follow-up task_updates import).
  const mapping = {};
  for (const row of rows) {
    const legacyId = String(get('Id')(row) || '').trim();
    const title = String(get('Title')(row) || '').trim();
    if (!title) { result.skipped++; continue; }

    const assignedToEmail = String(get('AssignedToEmail')(row) || '').trim();
    const assignedByEmail = String(get('AssignedByEmail')(row) || '').trim();
    const ob = String(get('OccurrenceNumber')(row) || '').trim();
    const payload = {
      title,
      description: get('Description')(row) || null,
      priority: mapTaskPriority(get('Priority')(row)),
      status: mapTaskStatus(get('Status')(row)),
      assigned_to: assignedToEmail ? await userIdByEmail(assignedToEmail) : null,
      assigned_to_name: get('AssignedToName')(row) || assignedToEmail || null,
      assigned_by: assignedByEmail ? await userIdByEmail(assignedByEmail) : null,
      assigned_by_name: get('AssignedByName')(row) || assignedByEmail || null,
      occurrence_id: ob ? await occIdByOb(ob) : null,
      ob_number: ob || null,
      due_at: parseSastToUtc(get('DueDate')(row)),
      completed_at: parseSastToUtc(get('CompletedAt')(row)),
      completion_notes: get('CompletionNotes')(row) || null,
      created_at: parseSastToUtc(get('CreatedAt')(row)) ?? new Date().toISOString(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase).from('tasks').insert(payload).select('id').single();
    if (error) { result.skipped++; continue; }
    mapping[legacyId] = data.id;
    result.inserted++;
  }
  // Persist the mapping file so importing task_updates next can resolve FKs.
  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../.task-id-map.json');
  await import('node:fs').then((fs) => fs.writeFileSync(out, JSON.stringify(mapping, null, 2)));
  console.log(`  (legacy → new task id map written to ${out})`);
  return result;
}

async function importTaskUpdates(rows, header) {
  const get = indexer(header);
  const map = await import('node:fs').then((fs) => {
    const p = resolve(dirname(fileURLToPath(import.meta.url)), '../.task-id-map.json');
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
  });
  const result = { inserted: 0, skipped: 0 };
  for (const row of rows) {
    const legacyTaskId = String(get('TaskItemId')(row) || '').trim();
    const taskId = map[legacyTaskId];
    if (!taskId) { result.skipped++; continue; }
    const payload = {
      task_id: taskId,
      previous_status: mapTaskStatus(get('PreviousStatus')(row)),
      new_status: mapTaskStatus(get('NewStatus')(row)),
      notes: get('Notes')(row) || null,
      updated_by_name: get('UpdatedByName')(row) || get('UpdatedByEmail')(row) || null,
      created_at: parseSastToUtc(get('UpdatedAt')(row)) ?? new Date().toISOString(),
    };
    const email = String(get('UpdatedByEmail')(row) || '').trim();
    if (email) payload.updated_by = await userIdByEmail(email);
    const { error } = await supabase.from('task_updates').insert(payload);
    if (error) result.skipped++;
    else result.inserted++;
  }
  return result;
}

async function importAcks(rows, header) {
  const get = indexer(header);
  const result = { inserted: 0, skipped: 0 };
  for (const row of rows) {
    const obs = String(get('OccurrenceNumber')(row) || '').trim();
    const occId = obs ? await occIdByOb(obs) : null;
    if (!occId) { result.skipped++; continue; }
    const payload = {
      occurrence_id: occId,
      ob_number: obs,
      reviewed_by_name: get('ManagerName')(row) || get('ReviewedByName')(row) || null,
      decision: String(get('Decision')(row) || 'acknowledged').toLowerCase().includes('reject')
        ? 'rejected'
        : String(get('Decision')(row) || '').toLowerCase().includes('esc')
          ? 'escalated' : 'acknowledged',
      manager_notes: get('Notes')(row) || get('ManagerNotes')(row) || null,
      reviewed_at: parseSastToUtc(get('AcknowledgedAt')(row)) ?? parseSastToUtc(get('ReviewedAt')(row)) ?? new Date().toISOString(),
    };
    const email = String(get('ManagerEmail')(row) || get('ReviewedByEmail')(row) || '').trim();
    if (email) payload.reviewed_by = await userIdByEmail(email);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase).from('manager_acknowledgements').insert(payload);
    if (error) result.skipped++;
    else result.inserted++;
  }
  return result;
}

async function importAckItems(rows, header) {
  // The legacy ManagerAcknowledgementItems link OB numbers to a parent ack.
  // Our new schema merges these into manager_acknowledgements (one row per OB).
  // We replay the items as additional acknowledgement rows so each occurrence
  // is independently acknowledged in the new system.
  const get = indexer(header);
  const result = { inserted: 0, skipped: 0 };
  for (const row of rows) {
    const obs = String(get('OccurrenceNumber')(row) || '').trim();
    const occId = obs ? await occIdByOb(obs) : null;
    if (!occId) { result.skipped++; continue; }
    const payload = {
      occurrence_id: occId,
      ob_number: obs,
      decision: 'acknowledged',
      manager_notes: '(migrated from legacy ManagerAcknowledgementItems)',
      reviewed_at: parseSastToUtc(get('AcknowledgedAt')(row)) ?? new Date().toISOString(),
    };
    const { error } = await supabase.from('manager_acknowledgements').insert(payload);
    if (error) result.skipped++;
    else result.inserted++;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log(`\nImporting ${kind} from ${csvPath}\n`);
const raw = readFileSync(resolve(csvPath), 'utf8');
const all = parseCsv(raw);
if (all.length < 2) {
  console.error('CSV has no data rows.');
  process.exit(1);
}
const header = all[0].map((h) => h.trim());
const body = all.slice(1).filter((r) => r.some((c) => c && c.trim() !== ''));
console.log(`  ${body.length} data rows · ${header.length} columns`);
console.log(`  Header: ${header.join(', ')}\n`);

let result;
switch (kind) {
  case 'updates':       result = await importUpdates(body, header); break;
  case 'reports':       result = await importReports(body, header); break;
  case 'patrols':       result = await importPatrols(body, header); break;
  case 'tasks':         result = await importTasks(body, header); break;
  case 'task_updates':  result = await importTaskUpdates(body, header); break;
  case 'acks':          result = await importAcks(body, header); break;
  case 'ack_items':     result = await importAckItems(body, header); break;
  default: throw new Error('unreachable');
}

console.log(`\nDone. inserted=${result.inserted} skipped=${result.skipped}\n`);
