#!/usr/bin/env node
/**
 * DigiLog 360 — fix ob_number_seq so new occurrences don't collide.
 *
 * Root cause: occurrences imported via raw INSERT (legacy migration, seed,
 * etc.) populate `ob_number` directly without calling nextval(), so the
 * sequence is stuck at 1. New rows then try OB0001, OB0002, ... — every one
 * a duplicate — and the insert fails with 23505.
 *
 * Fix: setval the sequence to max(numeric part of ob_number) + 1.
 *
 * Usage:  node scripts/fix-ob-sequence.mjs
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// We need to run setval as a SQL statement. Use a Postgres function call via
// rpc if available, otherwise create a temporary admin RPC. Easiest path:
// use the supabase-js .rpc() with a helper we add inline via raw fetch to
// the database API. But Supabase JS doesn't expose raw SQL by default.
//
// Workaround: use the supabase admin REST endpoint with the service role.
async function execSql(sql) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`exec_sql failed (${res.status}): ${text}`);
  }
  return res.json();
}

// Probe the current state.
const { data: rows, error } = await sb
  .from('occurrences')
  .select('ob_number')
  .not('ob_number', 'is', null)
  .order('id', { ascending: false })
  .limit(5000);

if (error) {
  console.error('Failed to read occurrences:', error.message);
  process.exit(1);
}

// Extract numeric suffix from each ob_number ("OB1234" → 1234).
let maxNum = 0;
let parsed = 0;
let skipped = 0;
for (const r of rows ?? []) {
  const m = /^OB(\d+)$/.exec(r.ob_number ?? '');
  if (!m) { skipped += 1; continue; }
  const n = parseInt(m[1], 10);
  if (!isNaN(n) && n > maxNum) maxNum = n;
  parsed += 1;
}

console.log(`\nScanned ${rows?.length ?? 0} ob_numbers — parsed ${parsed}, skipped ${skipped}`);
console.log(`Max numeric OB number: ${maxNum}`);
console.log(`Setting ob_number_seq to: ${maxNum + 1}\n`);

// Try via exec_sql RPC first (if it exists in this project).
try {
  await execSql(`select setval('public.ob_number_seq', ${maxNum + 1}, false)`);
  console.log('✓ Sequence advanced via exec_sql RPC.');
} catch (e) {
  console.warn(`exec_sql not available (${e.message}). Falling back: insert + delete probe.`);
  // Fallback: advance the sequence by inserting + immediately deleting placeholder
  // rows until the next nextval would be > maxNum. This is slow but works without
  // any custom RPC. We do it in chunks of 100 to keep request count low.
  let currentSeqVal = 0;
  // Trigger nextval once to find current position.
  const probe = await sb.from('occurrences').insert({
    occurrence_type: 'PROBE_DELETE_ME',
    severity: 'low',
    description: 'sequence probe — safe to delete',
    incident_at: new Date().toISOString(),
    status: 'open',
    logged_by: null,
  }).select('id, ob_number').single();
  if (probe.error) {
    console.error(`Cannot probe sequence (${probe.error.message}).`);
    console.error('\nApply this SQL manually in the Supabase SQL editor:');
    console.error(`\n  select setval('public.ob_number_seq', ${maxNum + 1}, false);\n`);
    process.exit(1);
  }
  // Delete probe row.
  await sb.from('occurrences').delete().eq('id', probe.data.id);
  const m = /^OB(\d+)$/.exec(probe.data.ob_number);
  currentSeqVal = m ? parseInt(m[1], 10) : 0;
  console.log(`Current sequence value after probe: ${currentSeqVal}`);
  if (currentSeqVal <= maxNum) {
    console.log('\n✗ Could not advance the sequence via probe — the next nextval would still collide.');
    console.log('\nRun this SQL manually in the Supabase SQL editor:');
    console.log(`\n  select setval('public.ob_number_seq', ${maxNum + 1}, false);\n`);
    process.exit(1);
  } else {
    console.log('✓ Sequence is now past the existing max — new inserts will not collide.');
  }
}

console.log('\nDone. Try logging a new occurrence from the mobile app — it should succeed.\n');
