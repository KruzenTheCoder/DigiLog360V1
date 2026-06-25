#!/usr/bin/env node
/**
 * DigiLog 360 — Import legacy ASP.NET MVC OccurrenceBook data from Azure SQL
 * into the new multi-tenant Supabase schema (org = pmi).
 *
 * Source: Azure SQL Database (credentials in .env or LEGACY_AZURE_* env vars).
 * Tables imported:
 *   OccurrenceLogs       → occurrences
 *   OccurrenceUpdates    → occurrence_updates
 *   OccurrenceReports    → occurrence_reports
 *   OccurrenceImages     → occurrence_images
 *   PatrolLogs           → patrols
 *   ManagerAcknowledgements (+ Items) → manager_acknowledgements (1 row per item)
 *   TaskItems            → tasks
 *   TaskUpdates          → task_updates
 *   Notifications        → notifications
 *
 * Skipped: AspNetUsers/Roles (already seeded), AuditLogs (huge & noisy),
 *          __EFMigrationsHistory.
 *
 * Conventions:
 *   • Legacy datetimes are SAST (UTC+2, no DST) → converted to UTC.
 *   • Legacy `OccurrenceNumber` (text) is preserved as `ob_number` and
 *     used to map across tables (we build a Number→new.id map after step 1).
 *   • Emails (LoggedBy / AssignedToEmail / etc.) are resolved against
 *     `profiles.email` to fill `*_by` UUID columns. Unknown emails →
 *     name-only (so we still see who did it, just without an FK).
 *
 * Usage:
 *   node --env-file=.env scripts/import-legacy-azure.mjs [--dry] [--only=occurrences,patrols,...]
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import mssql from 'mssql';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const onlyArg = args.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? new Set(onlyArg.split('=')[1].split(',')) : null;
const skipArg = args.find((a) => a.startsWith('--skip='));
const SKIP = skipArg ? new Set(skipArg.split('=')[1].split(',')) : new Set();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const AZURE = {
  server: process.env.LEGACY_AZURE_SERVER || 'occurrence.database.windows.net',
  database: process.env.LEGACY_AZURE_DB || 'occurrencedb2',
  user: process.env.LEGACY_AZURE_USER || 'superuser',
  password: process.env.LEGACY_AZURE_PASSWORD || 'Admin@123!',
  options: { encrypt: true, trustServerCertificate: false, useUTC: true },
  pool: { max: 4, min: 0, idleTimeoutMillis: 30000 },
  requestTimeout: 60000,
};

const ORG_SLUG = process.env.LEGACY_ORG_SLUG || 'pmi';
const BATCH = 500;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('✗ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a legacy SAST `datetime2` to a true UTC ISO string.
 *
 * We open the mssql connection with `useUTC: true`, so the driver returns a
 * JS Date whose UTC y/m/d/h/m/s equal the raw stored values (i.e. the
 * driver did not apply a TZ shift). The stored values are SAST wall-clock,
 * so to get the true UTC instant we subtract 2 hours.
 */
function sastToUtcIso(d) {
  if (d == null) return null;
  if (!(d instanceof Date)) return null;
  if (isNaN(d.getTime())) return null;
  // Sentinel from EF: 0001-01-01 → leave null.
  if (d.getUTCFullYear() < 1900) return null;
  return new Date(d.getTime() - 2 * 60 * 60 * 1000).toISOString();
}

function nz(s) {
  if (s == null) return null;
  const v = String(s).trim();
  return v.length ? v : null;
}

const STATUS_MAP = {
  'open': 'open',
  'new': 'open',
  'acknowledged': 'acknowledged',
  'ack': 'acknowledged',
  'in progress': 'in_progress',
  'inprogress': 'in_progress',
  'in_progress': 'in_progress',
  'on patrol': 'on_patrol',
  'onpatrol': 'on_patrol',
  'on_patrol': 'on_patrol',
  'patrol': 'on_patrol',
  'resolved': 'resolved',
  'closed': 'closed',
  'complete': 'closed',
  'completed': 'closed',
};
function mapStatus(raw, fallback = 'open') {
  if (!raw) return fallback;
  return STATUS_MAP[String(raw).toLowerCase().trim()] || fallback;
}

const SEVERITY_MAP = {
  'low': 'low', 'medium': 'medium', 'med': 'medium',
  'high': 'high', 'critical': 'critical', 'urgent': 'critical',
};
function mapSeverity(raw, fallback = 'medium') {
  if (!raw) return fallback;
  return SEVERITY_MAP[String(raw).toLowerCase().trim()] || fallback;
}

// Legacy task priority enum: 0 Low, 1 Normal, 2 High, 3 Urgent
const TASK_PRIORITY = ['low', 'normal', 'high', 'urgent'];
// Legacy task status: 0 Open, 1 InProgress, 2 Blocked, 3 Done, 4 Cancelled
const TASK_STATUS = ['open', 'in_progress', 'blocked', 'done', 'cancelled'];

const PATROL_STATUS_BY_END = (endedAt) => endedAt ? 'completed' : 'active';

const ACK_DECISION_MAP = {
  acknowledged: 'acknowledged', acknowledge: 'acknowledged',
  ack: 'acknowledged', approved: 'acknowledged',
  escalated: 'escalated', escalate: 'escalated',
  rejected: 'rejected', reject: 'rejected', denied: 'rejected',
};

// ---------------------------------------------------------------------------
// Batch insert with progress
// ---------------------------------------------------------------------------
async function batchInsert(table, rows, label = table) {
  let ok = 0; let err = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    if (DRY) { ok += chunk.length; continue; }
    const { error } = await sb.from(table).insert(chunk);
    if (error) {
      // Retry per-row to isolate failures.
      for (const r of chunk) {
        const { error: e2 } = await sb.from(table).insert(r);
        if (e2) { err++; if (err <= 3) console.log(`  · ${label} row failed: ${e2.message}`); }
        else ok++;
      }
    } else { ok += chunk.length; }
    process.stdout.write(`  · ${label}: ${ok}/${rows.length}\r`);
  }
  process.stdout.write(`  · ${label}: ${ok} inserted, ${err} failed                \n`);
  return { ok, err };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n┌─ DigiLog 360 — legacy Azure SQL importer`);
  console.log(`│  Source: ${AZURE.user}@${AZURE.server}/${AZURE.database}`);
  console.log(`│  Dest:   ${SUPABASE_URL} (org=${ORG_SLUG})${DRY ? '  [DRY RUN]' : ''}`);
  if (ONLY) console.log(`│  Only:   ${[...ONLY].join(', ')}`);
  console.log(`└────────────────────────────────────────────\n`);

  // ----- Resolve org_id and roster maps from Supabase -----
  const { data: orgRow, error: orgErr } = await sb
    .from('organizations').select('id, slug').eq('slug', ORG_SLUG).maybeSingle();
  if (orgErr || !orgRow) {
    console.error(`✗ org '${ORG_SLUG}' not found in Supabase. Run seed-accounts.mjs first.`);
    process.exit(1);
  }
  const ORG_ID = orgRow.id;
  console.log(`✓ org_id = ${ORG_ID}`);

  const { data: profiles } = await sb
    .from('profiles').select('id, email, full_name').eq('org_id', ORG_ID);
  const byEmail = new Map();
  for (const p of profiles ?? []) {
    if (p.email) byEmail.set(p.email.toLowerCase(), p);
  }
  console.log(`✓ ${profiles?.length ?? 0} profiles loaded for resolution\n`);

  const { data: sites } = await sb.from('sites').select('id, name').eq('org_id', ORG_ID);
  const siteByName = new Map();
  for (const s of sites ?? []) siteByName.set(s.name.toLowerCase(), s);

  const resolveUser = (email, fallbackName) => {
    const lk = email ? email.toLowerCase() : null;
    const p = lk ? byEmail.get(lk) : null;
    return { id: p?.id ?? null, name: p?.full_name ?? fallbackName ?? null };
  };

  // ----- Connect to Azure SQL -----
  console.log(`→ connecting to Azure SQL…`);
  const pool = await mssql.connect(AZURE);
  console.log(`✓ connected\n`);

  const summary = {};
  const obToId = new Map(); // legacy OccurrenceNumber → new occurrences.id
  const legacyOccIdToObNumber = new Map(); // legacy OccurrenceLogs.Id → OccurrenceNumber

  const want = (name) => (!ONLY || ONLY.has(name)) && !SKIP.has(name);

  // -------------------------------------------------------------------------
  // 1. occurrences (must be first — everything else FKs to it)
  // -------------------------------------------------------------------------
  if (want('occurrences')) {
    console.log(`◇ OccurrenceLogs → occurrences`);
    const { recordset } = await pool.request().query(`
      SELECT Id, OccurrenceNumber, OccurrenceType, Severity, Description,
             IncidentTimestamp, Site, LoggedBy, LoggedTimestamp, Status,
             ClosedTimestamp, LastSLAUpdate, SLADueDate, SLAHours,
             ReportedBy, AssignedToEmail, AssignedToName,
             AssignedByEmail, AssignedTimestamp,
             IsAssignmentAcknowledged, AssignmentAcknowledgedAt
      FROM dbo.OccurrenceLogs`);
    console.log(`  · source rows: ${recordset.length}`);

    const rows = [];
    for (const r of recordset) {
      const ob = nz(r.OccurrenceNumber);
      if (!ob) continue;
      legacyOccIdToObNumber.set(r.Id, ob);

      const logger = resolveUser(null, nz(r.LoggedBy));
      const siteName = nz(r.Site);
      const siteId = siteName ? (siteByName.get(siteName.toLowerCase())?.id ?? null) : null;

      rows.push({
        org_id: ORG_ID,
        ob_number: ob,
        occurrence_type: nz(r.OccurrenceType) || 'General',
        severity: mapSeverity(r.Severity, 'medium'),
        description: nz(r.Description) || '(no description)',
        incident_at: sastToUtcIso(r.IncidentTimestamp) || sastToUtcIso(r.LoggedTimestamp) || new Date().toISOString(),
        site_id: siteId,
        site_name: siteName,
        logged_by: logger.id,
        logged_by_name: logger.name || nz(r.LoggedBy),
        status: mapStatus(r.Status, 'open'),
        sla_hours: r.SLAHours ?? 0,
        sla_due_at: sastToUtcIso(r.SLADueDate),
        last_sla_update_at: sastToUtcIso(r.LastSLAUpdate),
        closed_at: sastToUtcIso(r.ClosedTimestamp),
        created_at: sastToUtcIso(r.LoggedTimestamp) || new Date().toISOString(),
      });
    }

    // Insert and map ob_number → new.id
    let ok = 0, err = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      if (DRY) { ok += chunk.length; continue; }
      const { data, error } = await sb.from('occurrences').insert(chunk).select('id, ob_number');
      if (error) {
        for (const r of chunk) {
          const { data: d2, error: e2 } = await sb.from('occurrences').insert(r).select('id, ob_number').single();
          if (e2) { err++; if (err <= 3) console.log(`  · row failed: ${e2.message}`); }
          else { ok++; obToId.set(d2.ob_number, d2.id); }
        }
      } else {
        ok += data.length;
        for (const d of data) obToId.set(d.ob_number, d.id);
      }
      process.stdout.write(`  · occurrences: ${ok}/${rows.length}\r`);
    }
    process.stdout.write(`  · occurrences: ${ok} inserted, ${err} failed                \n\n`);
    summary.occurrences = { ok, err, src: recordset.length };

    // In DRY mode, populate obToId so downstream tables don't all skip.
    if (DRY) for (const r of rows) obToId.set(r.ob_number, -1);
  } else {
    // Even if we skip occurrences, we still need ob → id for downstream tables.
    const { data } = await sb.from('occurrences').select('id, ob_number').eq('org_id', ORG_ID);
    for (const r of data ?? []) if (r.ob_number) obToId.set(r.ob_number, r.id);
    console.log(`◇ loaded ${obToId.size} existing ob_numbers from Supabase\n`);
  }

  // -------------------------------------------------------------------------
  // 2. occurrence_updates
  // -------------------------------------------------------------------------
  if (want('occurrence_updates')) {
    console.log(`◇ OccurrenceUpdates → occurrence_updates`);
    const { recordset } = await pool.request().query(`
      SELECT OccurrenceNumber, UpdateNotes, Status, UpdatedBy, UpdatedAt
      FROM dbo.OccurrenceUpdates`);
    console.log(`  · source rows: ${recordset.length}`);
    const rows = [];
    let skipped = 0;
    for (const r of recordset) {
      const occId = obToId.get(nz(r.OccurrenceNumber));
      if (!occId) { skipped++; continue; }
      const who = resolveUser(null, nz(r.UpdatedBy));
      rows.push({
        org_id: ORG_ID,
        occurrence_id: occId,
        ob_number: nz(r.OccurrenceNumber),
        notes: nz(r.UpdateNotes) || '(no notes)',
        status: mapStatus(r.Status, 'in_progress'),
        updated_by: who.id,
        updated_by_name: who.name || nz(r.UpdatedBy),
        created_at: sastToUtcIso(r.UpdatedAt) || new Date().toISOString(),
      });
    }
    if (skipped) console.log(`  · skipped ${skipped} (no matching occurrence)`);
    const s = await batchInsert('occurrence_updates', rows);
    summary.occurrence_updates = { ...s, src: recordset.length, skipped };
    console.log();
  }

  // -------------------------------------------------------------------------
  // 3. occurrence_reports
  // -------------------------------------------------------------------------
  if (want('occurrence_reports')) {
    console.log(`◇ OccurrenceReports → occurrence_reports`);
    const { recordset } = await pool.request().query(`
      SELECT OccurrenceNumber, Severity, OccurrenceType, IncidentTimestamp,
             Location, ReportedBy, Description, Personnel, RespondingOfficer,
             EmergencyServices, ExternalCase, CCTV, CCTVTimes, PropertyDamage,
             ImmediateActions, NextSteps, CreatedBy, CreatedAt, Status
      FROM dbo.OccurrenceReports`);
    console.log(`  · source rows: ${recordset.length}`);
    const seen = new Set();
    const rows = [];
    let skipped = 0, dupes = 0;
    for (const r of recordset) {
      const ob = nz(r.OccurrenceNumber);
      const occId = obToId.get(ob);
      if (!occId) { skipped++; continue; }
      // occurrence_reports has UNIQUE(occurrence_id) — keep the first.
      if (seen.has(occId)) { dupes++; continue; }
      seen.add(occId);
      const who = resolveUser(null, nz(r.CreatedBy));
      rows.push({
        org_id: ORG_ID,
        occurrence_id: occId,
        ob_number: ob,
        severity: r.Severity ? mapSeverity(r.Severity) : null,
        occurrence_type: nz(r.OccurrenceType),
        incident_at: sastToUtcIso(r.IncidentTimestamp),
        location: nz(r.Location),
        reported_by: nz(r.ReportedBy),
        description: nz(r.Description) || '(no description)',
        personnel: nz(r.Personnel),
        responding_officer: nz(r.RespondingOfficer),
        emergency_services: nz(r.EmergencyServices),
        external_case: nz(r.ExternalCase),
        cctv: nz(r.CCTV),
        cctv_times: nz(r.CCTVTimes),
        property_damage: nz(r.PropertyDamage),
        immediate_actions: nz(r.ImmediateActions),
        next_steps: nz(r.NextSteps),
        created_by: who.id,
        created_by_name: who.name || nz(r.CreatedBy),
        status: mapStatus(r.Status, 'open'),
        created_at: sastToUtcIso(r.CreatedAt) || new Date().toISOString(),
      });
    }
    if (skipped) console.log(`  · skipped ${skipped} (no matching occurrence)`);
    if (dupes) console.log(`  · de-duped ${dupes} (multiple reports for same OB)`);
    const s = await batchInsert('occurrence_reports', rows);
    summary.occurrence_reports = { ...s, src: recordset.length, skipped, dupes };
    console.log();
  }

  // -------------------------------------------------------------------------
  // 4. occurrence_images
  // -------------------------------------------------------------------------
  if (want('occurrence_images')) {
    console.log(`◇ OccurrenceImages → occurrence_images`);
    const { recordset } = await pool.request().query(`
      SELECT OccurrenceNumber, BlobUrl, Caption, CapturedAt, CapturedBy, BlobName
      FROM dbo.OccurrenceImages`);
    console.log(`  · source rows: ${recordset.length}`);
    const rows = [];
    let skipped = 0;
    for (const r of recordset) {
      const occId = obToId.get(nz(r.OccurrenceNumber));
      if (!occId) { skipped++; continue; }
      const who = resolveUser(null, nz(r.CapturedBy));
      // We don't have the actual Supabase Storage path — we store the legacy
      // Azure Blob URL as the path so the link still works in the UI.
      const storagePath = nz(r.BlobName) || nz(r.BlobUrl) || '(unknown)';
      rows.push({
        org_id: ORG_ID,
        occurrence_id: occId,
        ob_number: nz(r.OccurrenceNumber),
        storage_path: storagePath,
        caption: nz(r.Caption),
        captured_by: who.id,
        captured_by_name: who.name || nz(r.CapturedBy),
        captured_at: sastToUtcIso(r.CapturedAt) || new Date().toISOString(),
      });
    }
    if (skipped) console.log(`  · skipped ${skipped} (no matching occurrence)`);
    const s = await batchInsert('occurrence_images', rows);
    summary.occurrence_images = { ...s, src: recordset.length, skipped };
    console.log();
  }

  // -------------------------------------------------------------------------
  // 5. patrols
  // -------------------------------------------------------------------------
  if (want('patrols')) {
    console.log(`◇ PatrolLogs → patrols`);
    const { recordset } = await pool.request().query(`
      SELECT GuardName, PatrolStart, PatrolEnd, DurationMinutes, OccurrenceNumber
      FROM dbo.PatrolLogs`);
    console.log(`  · source rows: ${recordset.length}`);
    const rows = [];
    for (const r of recordset) {
      const start = sastToUtcIso(r.PatrolStart);
      const end = sastToUtcIso(r.PatrolEnd);
      const occId = obToId.get(nz(r.OccurrenceNumber)) ?? null;
      // Resolve guard by name (legacy stored display name only)
      const guardName = nz(r.GuardName);
      let guardId = null;
      if (guardName) {
        for (const p of profiles ?? []) {
          if (p.full_name && p.full_name.toLowerCase() === guardName.toLowerCase()) {
            guardId = p.id; break;
          }
        }
      }
      rows.push({
        org_id: ORG_ID,
        guard_id: guardId,
        guard_name: guardName || 'Unknown',
        occurrence_id: occId,
        ob_number: nz(r.OccurrenceNumber),
        status: PATROL_STATUS_BY_END(end),
        started_at: start || new Date().toISOString(),
        ended_at: end,
        duration_minutes: r.DurationMinutes != null ? Number(r.DurationMinutes) : null,
      });
    }
    const s = await batchInsert('patrols', rows);
    summary.patrols = { ...s, src: recordset.length };
    console.log();
  }

  // -------------------------------------------------------------------------
  // 6. manager_acknowledgements (legacy 1:N expansion via Items)
  //
  // Legacy schema: ManagerAcknowledgements is the header, with details in
  // ManagerAcknowledgementItems (one row per acknowledged occurrence).
  // New schema requires occurrence_id NOT NULL on every ack row → we
  // explode into 1 ack-per-item.
  // -------------------------------------------------------------------------
  if (want('manager_acknowledgements')) {
    console.log(`◇ ManagerAcknowledgements (+ Items) → manager_acknowledgements`);
    const { recordset: heads } = await pool.request().query(`
      SELECT Id, AcknowledgementNumber, ManagerName, AcknowledgedAt, Notes,
             SignatureData, AcknowledgedCount
      FROM dbo.ManagerAcknowledgements`);
    const { recordset: items } = await pool.request().query(`
      SELECT Id, ManagerAcknowledgementId, OccurrenceNumber
      FROM dbo.ManagerAcknowledgementItems`);
    console.log(`  · source: ${heads.length} acks, ${items.length} items`);
    const byHead = new Map(heads.map((h) => [h.Id, h]));

    const rows = [];
    let skipped = 0;
    for (const it of items) {
      const head = byHead.get(it.ManagerAcknowledgementId);
      if (!head) { skipped++; continue; }
      const occId = obToId.get(nz(it.OccurrenceNumber));
      if (!occId) { skipped++; continue; }
      // ManagerName isn't an email — best-effort name match
      const mgrName = nz(head.ManagerName);
      let mgrId = null;
      if (mgrName) {
        for (const p of profiles ?? []) {
          if (p.full_name && p.full_name.toLowerCase() === mgrName.toLowerCase()) {
            mgrId = p.id; break;
          }
        }
      }
      rows.push({
        org_id: ORG_ID,
        occurrence_id: occId,
        ob_number: nz(it.OccurrenceNumber),
        reviewed_by: mgrId,
        reviewed_by_name: mgrName,
        decision: 'acknowledged',
        manager_notes: nz(head.Notes),
        signature_data_url: nz(head.SignatureData),
        reviewed_at: sastToUtcIso(head.AcknowledgedAt) || new Date().toISOString(),
        created_at: sastToUtcIso(head.AcknowledgedAt) || new Date().toISOString(),
      });
    }
    if (skipped) console.log(`  · skipped ${skipped} (no matching occurrence/head)`);
    const s = await batchInsert('manager_acknowledgements', rows);
    summary.manager_acknowledgements = { ...s, src: items.length, skipped };
    console.log();
  }

  // -------------------------------------------------------------------------
  // 7. tasks + task_updates
  // -------------------------------------------------------------------------
  const legacyTaskIdToNew = new Map();
  if (want('tasks')) {
    console.log(`◇ TaskItems → tasks`);
    const { recordset } = await pool.request().query(`
      SELECT Id, Title, Description, OccurrenceNumber, AssignedByEmail, AssignedByName,
             AssignedToEmail, AssignedToName, Priority, Status, DueDate, CreatedAt,
             CompletedAt, CompletedBy, CompletionNotes
      FROM dbo.TaskItems`);
    console.log(`  · source rows: ${recordset.length}`);
    let ok = 0, err = 0;
    for (const r of recordset) {
      const occId = obToId.get(nz(r.OccurrenceNumber)) ?? null;
      const assignee = resolveUser(nz(r.AssignedToEmail), nz(r.AssignedToName));
      const assigner = resolveUser(nz(r.AssignedByEmail), nz(r.AssignedByName));
      const completer = resolveUser(null, nz(r.CompletedBy));
      const row = {
        org_id: ORG_ID,
        title: nz(r.Title) || '(untitled)',
        description: nz(r.Description),
        priority: TASK_PRIORITY[r.Priority ?? 1] || 'normal',
        status: TASK_STATUS[r.Status ?? 0] || 'open',
        assigned_to: assignee.id,
        assigned_to_name: assignee.name || nz(r.AssignedToName),
        assigned_by: assigner.id,
        assigned_by_name: assigner.name || nz(r.AssignedByName),
        occurrence_id: occId,
        ob_number: nz(r.OccurrenceNumber),
        due_at: sastToUtcIso(r.DueDate),
        completed_at: sastToUtcIso(r.CompletedAt),
        completed_by: completer.id,
        completion_notes: nz(r.CompletionNotes),
        created_at: sastToUtcIso(r.CreatedAt) || new Date().toISOString(),
      };
      if (DRY) { legacyTaskIdToNew.set(r.Id, -1); ok++; continue; }
      const { data, error } = await sb.from('tasks').insert(row).select('id').single();
      if (error) { err++; if (err <= 3) console.log(`  · row failed: ${error.message}`); }
      else { legacyTaskIdToNew.set(r.Id, data.id); ok++; }
      if ((ok + err) % 25 === 0) process.stdout.write(`  · tasks: ${ok}/${recordset.length}\r`);
    }
    process.stdout.write(`  · tasks: ${ok} inserted, ${err} failed                \n`);
    summary.tasks = { ok, err, src: recordset.length };
    console.log();
  }

  if (want('task_updates')) {
    console.log(`◇ TaskUpdates → task_updates`);
    const { recordset } = await pool.request().query(`
      SELECT TaskItemId, PreviousStatus, NewStatus, Notes,
             UpdatedByEmail, UpdatedByName, UpdatedAt
      FROM dbo.TaskUpdates`);
    console.log(`  · source rows: ${recordset.length}`);
    const rows = [];
    let skipped = 0;
    for (const r of recordset) {
      const taskId = legacyTaskIdToNew.get(r.TaskItemId);
      if (!taskId) { skipped++; continue; }
      const who = resolveUser(nz(r.UpdatedByEmail), nz(r.UpdatedByName));
      rows.push({
        org_id: ORG_ID,
        task_id: taskId,
        previous_status: TASK_STATUS[r.PreviousStatus ?? 0] || 'open',
        new_status: TASK_STATUS[r.NewStatus ?? 0] || 'open',
        notes: nz(r.Notes),
        updated_by: who.id,
        updated_by_name: who.name || nz(r.UpdatedByName),
        created_at: sastToUtcIso(r.UpdatedAt) || new Date().toISOString(),
      });
    }
    if (skipped) console.log(`  · skipped ${skipped} (no matching task)`);
    const s = await batchInsert('task_updates', rows);
    summary.task_updates = { ...s, src: recordset.length, skipped };
    console.log();
  }

  // -------------------------------------------------------------------------
  // 8. notifications
  // -------------------------------------------------------------------------
  if (want('notifications')) {
    console.log(`◇ Notifications → notifications`);
    const { recordset } = await pool.request().query(`
      SELECT RecipientEmail, RecipientName, Title, Message, NotificationType,
             OccurrenceNumber, OccurrenceId, SenderEmail, SenderName, IsRead,
             ReadAt, IsAcknowledged, AcknowledgedAt, ActionUrl, CreatedAt, ExpiresAt
      FROM dbo.Notifications`);
    console.log(`  · source rows: ${recordset.length}`);
    const rows = [];
    let skipped = 0;
    for (const r of recordset) {
      const recipient = resolveUser(nz(r.RecipientEmail), nz(r.RecipientName));
      if (!recipient.id) { skipped++; continue; } // user_id is NOT NULL
      rows.push({
        org_id: ORG_ID,
        user_id: recipient.id,
        kind: nz(r.NotificationType) || 'system',
        title: nz(r.Title) || '(no title)',
        body: nz(r.Message),
        data: {
          ob_number: nz(r.OccurrenceNumber),
          legacy_occurrence_id: r.OccurrenceId,
          sender_email: nz(r.SenderEmail),
          sender_name: nz(r.SenderName),
          action_url: nz(r.ActionUrl),
          is_acknowledged: !!r.IsAcknowledged,
          acknowledged_at: sastToUtcIso(r.AcknowledgedAt),
        },
        read_at: r.IsRead ? (sastToUtcIso(r.ReadAt) || sastToUtcIso(r.CreatedAt)) : null,
        created_at: sastToUtcIso(r.CreatedAt) || new Date().toISOString(),
      });
    }
    if (skipped) console.log(`  · skipped ${skipped} (recipient not in roster)`);
    const s = await batchInsert('notifications', rows);
    summary.notifications = { ...s, src: recordset.length, skipped };
    console.log();
  }

  await pool.close();

  // ----- Summary -----
  console.log(`\n┌─ Import summary ${DRY ? '(DRY RUN)' : ''}`);
  for (const [k, v] of Object.entries(summary)) {
    console.log(`│  ${k.padEnd(26)} src=${String(v.src).padStart(5)}  ok=${String(v.ok).padStart(5)}  err=${String(v.err).padStart(3)}` +
      (v.skipped ? `  skipped=${v.skipped}` : '') + (v.dupes ? `  dupes=${v.dupes}` : ''));
  }
  console.log(`└────────────────────────────────────────────\n`);
}

main().catch((e) => {
  console.error('\n✗ import failed:', e);
  process.exit(1);
});
