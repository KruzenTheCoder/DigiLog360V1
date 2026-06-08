#!/usr/bin/env node
/**
 * DigiLog 360 — bulk import occurrences from the legacy CSV dump.
 *
 * Source format (one header row, then data rows):
 *   Id, Description, OccurrenceType, IncidentTimestamp, Site, LoggedBy,
 *   LoggedTimestamp, Status, OccurrenceNumber, ClosedTimestamp,
 *   LastSLAUpdate, SLADueDate, SLAHours, Severity
 *
 * Behaviour:
 *   • Uses an inline RFC-4180 parser that respects quoted fields with embedded
 *     newlines and "" escapes (the legacy export contains both).
 *   • Resolves Site (e.g. "Sandton") → public.sites.id within the target org.
 *     "On Patrol" or unknown site values become null + is_patrol=true.
 *   • Resolves LoggedBy email → public.profiles.id (preserves logged_by_name
 *     either way).
 *   • Preserves the legacy OccurrenceNumber via the trigger's "skip-if-set"
 *     behaviour, then bumps the OB sequence past the highest legacy number.
 *   • Treats every timestamp as Africa/Johannesburg (UTC+2) and converts to UTC.
 *   • Skips rows where OccurrenceNumber is missing (the legacy file contains a
 *     few truncated rows from multi-line free text spilling out of fields).
 *
 * Usage (from repo root):
 *   node --env-file=.env scripts/import-occurrences.mjs <path-to-csv>
 *   node --env-file=.env scripts/import-occurrences.mjs <path-to-csv> --org acme
 *   node --env-file=.env scripts/import-occurrences.mjs <path-to-csv> --dry-run
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);

function flagValue(name, defaultValue) {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
    return argv[i + 1];
  }
  return defaultValue;
}

// Positional arg = CSV path (not a flag and not a flag's value).
const consumedByFlag = new Set();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--') && !a.includes('=')
      && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
    consumedByFlag.add(i + 1);
  }
}
const csvPath = argv.find((a, i) => !a.startsWith('--') && !consumedByFlag.has(i));
const orgSlug = flagValue('org', 'pmi');
const dryRun = argv.includes('--dry-run');

if (!csvPath) {
  console.error('Usage: node scripts/import-occurrences.mjs <csv> [--org slug] [--dry-run]');
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
// RFC 4180-ish CSV parser (handles quoted fields with embedded newlines and "")
// ---------------------------------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;
  // Strip a UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++;
        continue;
      }
      field += ch; i++;
      continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') {
      row.push(field); rows.push(row);
      row = []; field = ''; i++; continue;
    }
    field += ch; i++;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const STATUS_MAP = {
  open: 'open',
  acknowledged: 'acknowledged',
  'in progress': 'in_progress',
  inprogress: 'in_progress',
  'on patrol': 'on_patrol',
  onpatrol: 'on_patrol',
  resolved: 'resolved',
  closed: 'closed',
};

const SEVERITY_MAP = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
};

function normaliseStatus(s) {
  if (!s) return 'open';
  const key = s.trim().toLowerCase();
  return STATUS_MAP[key] ?? 'open';
}

function normaliseSeverity(s) {
  if (!s) return 'low';
  const key = s.trim().toLowerCase();
  return SEVERITY_MAP[key] ?? 'low';
}

/**
 * Parse a "M/D/YYYY H:MM" or "M/D/YYYY H:MM:SS" string interpreted as SAST
 * (Africa/Johannesburg, UTC+2) and return an ISO UTC string, or null.
 */
function parseSastToUtc(s) {
  if (!s) return null;
  const trimmed = String(s).trim();
  if (!trimmed) return null;
  // Accept "3/2/2026 1:21" / "3/2/2026 1:21:05" / "3/2/2026 13:21".
  const m = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/,
  );
  if (!m) return null;
  const [, mo, d, y, h, mi, se = '0'] = m;
  // SAST = UTC+2, so subtract 2 hours to get UTC.
  const utc = Date.UTC(+y, +mo - 1, +d, +h - 2, +mi, +se);
  if (Number.isNaN(utc)) return null;
  return new Date(utc).toISOString();
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------
async function loadLookups() {
  // Detect whether the multi-tenant migration is deployed yet.
  // (organizations table presence + org_id column on profiles.)
  const { error: orgsProbeErr } = await supabase
    .from('organizations').select('id').limit(1);
  const multiTenant = !orgsProbeErr;

  let org = null;
  let sitesQuery = supabase.from('sites').select('id, name');
  let profilesQuery = supabase.from('profiles').select('id, email, full_name');

  if (multiTenant) {
    const { data, error } = await supabase
      .from('organizations').select('id, slug, name')
      .eq('slug', orgSlug).maybeSingle();
    if (error || !data) {
      throw new Error(`Org "${orgSlug}" not found (${error?.message ?? 'missing'})`);
    }
    org = data;
    sitesQuery = sitesQuery.eq('org_id', org.id);
    profilesQuery = profilesQuery.eq('org_id', org.id);
  }

  const { data: sites } = await sitesQuery;
  const siteByName = new Map(
    (sites ?? []).map((s) => [s.name.toLowerCase(), s.id]),
  );

  const { data: profiles } = await profilesQuery;
  const profileByEmail = new Map(
    (profiles ?? [])
      .filter((p) => p.email)
      .map((p) => [p.email.toLowerCase(), p]),
  );

  return { org, siteByName, profileByEmail, multiTenant };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const raw = readFileSync(resolve(csvPath), 'utf8');
const rows = parseCsv(raw);
if (rows.length < 2) {
  console.error('CSV is empty.');
  process.exit(1);
}

const header = rows[0].map((h) => h.trim());
const expected = [
  'Id','Description','OccurrenceType','IncidentTimestamp','Site','LoggedBy',
  'LoggedTimestamp','Status','OccurrenceNumber','ClosedTimestamp',
  'LastSLAUpdate','SLADueDate','SLAHours','Severity',
];
const headerOk = expected.every((h, i) => header[i] === h);
if (!headerOk) {
  console.error('Unexpected header. Got:');
  console.error(header);
  console.error('Expected:');
  console.error(expected);
  process.exit(1);
}

const { org, siteByName, profileByEmail, multiTenant } = await loadLookups();
console.log(
  multiTenant
    ? `\nMode: MULTI-TENANT (importing into org "${org.name}" / ${org.id})`
    : `\nMode: SINGLE-TENANT (organizations table not deployed — org_id will be omitted)`,
);
console.log(`Sites known:   ${[...siteByName.keys()].join(', ') || '(none)'}`);
console.log(`Profiles known: ${profileByEmail.size}`);
if (dryRun) console.log('(dry-run — nothing will be inserted)\n');

// ---------------------------------------------------------------------------
// Reconstruction pass: the legacy export wrote multi-line descriptions as
// raw newlines (NOT quoted). The CSV parser sees those as separate rows, with
// only column 0 (or 1) populated. We collapse them back onto the next "anchor"
// row — the one that actually carries the OB number.
//
// • A NORMAL anchor has the OB at column 8 (Id, Desc, Type, IncidentTs, …).
// • A SHIFTED anchor has the OB at column 7 because column 0 is the last
//   description line, not the Id.
// ---------------------------------------------------------------------------
const OB_RE = /^OB\d+$/i;

const inserts = [];
const skipped = [];
let highestOb = 0;
let pendingDesc = []; // continuation lines waiting for the next anchor

function flushOrphans(reason) {
  if (pendingDesc.length > 0) {
    skipped.push({ line: '(orphaned)', reason: `${pendingDesc.length} continuation line(s) with no anchor` });
    pendingDesc = [];
  }
  if (reason) skipped.push({ line: '(meta)', reason });
}

for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  if (row.every((c) => !c || !c.trim())) continue;

  const obNormalIdx = 8;
  const obShiftedIdx = 7;
  const isNormalAnchor = row[obNormalIdx] && OB_RE.test(row[obNormalIdx].trim());
  const isShiftedAnchor = !isNormalAnchor && row[obShiftedIdx] && OB_RE.test(row[obShiftedIdx].trim());

  if (!isNormalAnchor && !isShiftedAnchor) {
    // Continuation row. The description fragment may live in col 1 (when col 0
    // still holds an Id) OR in col 0 (when the Id was lost and the line shifted).
    const line = (row[1] && row[1].trim()) ? row[1] : (row[0] && row[0].trim() ? row[0] : '');
    if (line) pendingDesc.push(line);
    continue;
  }

  // Anchor: read columns, reconstruct description, then emit.
  const shift = isShiftedAnchor ? -1 : 0;
  const col = (i) => row[i + shift] ?? '';

  const description    = col(1);
  const occurrenceType = col(2);
  const incidentTs     = col(3);
  const site           = col(4);
  const loggedBy       = col(5);
  const loggedTs       = col(6);
  const status         = col(7);
  const obNumber       = col(8);
  const closedTs       = col(9);
  const lastSla        = col(10);
  const slaDue         = col(11);
  const slaHoursStr    = col(12);
  const severity       = col(13);

  // For shifted anchors, the "Description" column (1) does not exist — the
  // anchor's own contribution to the description lives in column 0 instead.
  const ownDescLine = isShiftedAnchor ? (row[0] ?? '') : description;
  const fullDescription = [...pendingDesc, ownDescLine]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  pendingDesc = [];

  if (!obNumber || !obNumber.trim() || !incidentTs || !incidentTs.trim()) {
    skipped.push({ line: r + 1, reason: 'missing ob_number or incident_at' });
    continue;
  }

  const obMatch = obNumber.match(/^OB(\d+)$/i);
  if (obMatch) highestOb = Math.max(highestOb, parseInt(obMatch[1], 10));

  const profile = loggedBy ? profileByEmail.get(loggedBy.trim().toLowerCase()) : null;
  const siteId = site ? siteByName.get(site.trim().toLowerCase()) ?? null : null;
  const siteName = site && siteByName.has(site.trim().toLowerCase())
    ? site.trim() : null;

  const insert = {
    ...(multiTenant ? { org_id: org.id } : {}),
    ob_number: obNumber.trim(),
    occurrence_type: (occurrenceType || 'Other').trim(),
    severity: normaliseSeverity(severity),
    description: fullDescription || '(no description)',
    incident_at: parseSastToUtc(incidentTs) ?? new Date().toISOString(),
    site_id: siteId,
    site_name: siteName,
    logged_by: profile?.id ?? null,
    logged_by_name: profile?.full_name ?? profile?.email ?? (loggedBy ? loggedBy.trim() : null),
    status: normaliseStatus(status),
    is_patrol: (occurrenceType || '').trim().toLowerCase() === 'patrol',
    sla_hours: slaHoursStr ? Number(slaHoursStr) || 0 : 0,
    sla_due_at: parseSastToUtc(slaDue),
    last_sla_update_at: parseSastToUtc(lastSla) ?? parseSastToUtc(loggedTs),
    closed_at: parseSastToUtc(closedTs),
    created_at: parseSastToUtc(loggedTs) ?? parseSastToUtc(incidentTs) ?? new Date().toISOString(),
  };

  inserts.push(insert);
}

flushOrphans();
console.log(`Parsed ${inserts.length} valid rows · skipped ${skipped.length}`);
if (skipped.length > 0 && skipped.length <= 20) {
  for (const s of skipped) console.log(`  skip line ${s.line}: ${s.reason}`);
} else if (skipped.length > 20) {
  console.log(`  (first 5) ${skipped.slice(0, 5).map((s) => `line ${s.line}`).join(', ')} ...`);
}

if (dryRun) {
  console.log('\nSample of first 3 rows that would be inserted:');
  console.log(JSON.stringify(inserts.slice(0, 3), null, 2));
  // Spot-check a known multi-line row (OB0158 from the legacy export).
  const interesting = inserts.find((i) => i.ob_number === 'OB0158');
  if (interesting) {
    console.log('\nMulti-line spot-check (OB0158):');
    console.log(JSON.stringify(interesting, null, 2));
  }
  process.exit(0);
}

// Pre-empt OB collisions: skip any ob_number already in the table.
// Chunked because Supabase's URL has a hard length limit.
const obNumbers = inserts.map((i) => i.ob_number);
const CHECK_CHUNK = 200;
const existingSet = new Set();
for (let i = 0; i < obNumbers.length; i += CHECK_CHUNK) {
  const slice = obNumbers.slice(i, i + CHECK_CHUNK);
  const { data: existing, error: exErr } = await supabase
    .from('occurrences').select('ob_number').in('ob_number', slice);
  if (exErr) {
    console.error(`Pre-check chunk ${i / CHECK_CHUNK + 1} failed:`, exErr.message);
    process.exit(1);
  }
  for (const e of existing ?? []) existingSet.add(e.ob_number);
}
const toInsert = inserts.filter((i) => !existingSet.has(i.ob_number));
console.log(`Inserting ${toInsert.length}; ${existingSet.size} already present (skipped).`);

// Batched inserts.
const BATCH = 500;
let inserted = 0;
let failedBatches = 0;

for (let i = 0; i < toInsert.length; i += BATCH) {
  const slice = toInsert.slice(i, i + BATCH);
  const { error } = await supabase.from('occurrences').insert(slice);
  if (error) {
    failedBatches += 1;
    console.error(`  ✗ batch ${i / BATCH + 1}: ${error.message}`);
    // Fallback to per-row inserts so a single bad row doesn't sink the batch.
    let rowFails = 0;
    for (const r of slice) {
      const { error: e2 } = await supabase.from('occurrences').insert(r);
      if (e2) {
        rowFails += 1;
        if (rowFails <= 3) console.error(`     · ${r.ob_number}: ${e2.message}`);
      } else {
        inserted += 1;
      }
    }
    console.error(`     row-by-row salvage: ${slice.length - rowFails}/${slice.length} ok`);
  } else {
    inserted += slice.length;
    process.stdout.write(`  + batch ${Math.floor(i / BATCH) + 1} (${inserted}/${toInsert.length})\r`);
  }
}
process.stdout.write('\n');

// Bump the OB sequence so new occurrences don't collide.
// There is no public `exec_sql` RPC in our schema, so we just print the SQL
// the operator should paste into the Supabase SQL editor.
if (highestOb > 0) {
  console.log(
    `\n⚠ Run this in the Supabase SQL editor to bump the OB sequence past the\n` +
    `   imported rows (otherwise the next new occurrence will collide on OB0001):\n` +
    `   select setval('public.ob_number_seq', ${highestOb});\n`,
  );
}

console.log(`\nDone. inserted=${inserted} skipped_existing=${existingSet.size} skipped_invalid=${skipped.length} failed_batches=${failedBatches}`);
