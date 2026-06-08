#!/usr/bin/env node
/**
 * DigiLog 360 — recover from a botched org rename.
 *
 * Situation:
 *   • `digilog-demo` still exists with all real users.
 *   • `pmi` was created as an empty placeholder (because the original rename
 *     UPDATE conflicted with an existing pmi row, so it was a no-op).
 *
 * What this does:
 *   1. Reports row counts in each org so we don't accidentally lose data.
 *   2. Deletes everything attached to the empty `pmi` org (sites, etc.).
 *   3. Deletes the empty `pmi` org itself.
 *   4. Renames `digilog-demo` → `pmi` (with name='PMI', legal_name='PMI').
 *
 * Refuses to run if `pmi` has any profiles (your real users) — in that case
 * we'd need a real merge and you should ping for help.
 *
 * Usage:  node scripts/fix-org-rename.mjs
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function countIn(orgId, table) {
  const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('org_id', orgId);
  return count ?? 0;
}

const { data: orgs } = await sb.from('organizations').select('id, slug, name');
const demo = orgs?.find((o) => o.slug === 'digilog-demo');
const pmi = orgs?.find((o) => o.slug === 'pmi');

if (!demo && pmi) {
  console.log('✓ Already clean — only `pmi` exists. Nothing to do.');
  process.exit(0);
}
if (!demo) {
  console.error('✗ No `digilog-demo` org found. Aborting — nothing to rename.');
  process.exit(1);
}

console.log('\n── Counts in each org ──');
for (const o of [demo, pmi].filter(Boolean)) {
  const profiles = await countIn(o.id, 'profiles');
  const sites = await countIn(o.id, 'sites');
  const occurrences = await countIn(o.id, 'occurrences');
  console.log(`  ${o.slug.padEnd(15)} profiles=${profiles}  sites=${sites}  occurrences=${occurrences}`);
}

// Safety: refuse if pmi has profiles.
if (pmi) {
  const pmiProfiles = await countIn(pmi.id, 'profiles');
  if (pmiProfiles > 0) {
    console.error(`\n✗ The placeholder \`pmi\` org has ${pmiProfiles} profiles — this isn't a simple rename anymore.`);
    console.error('  Run a merge manually or ask Claude for a migration script.');
    process.exit(1);
  }
}

console.log('\n── Plan ──');
if (pmi) {
  console.log('  1. Delete sites (and dependents) under the empty `pmi` org.');
  console.log('  2. Delete the `pmi` org row.');
  console.log('  3. Rename `digilog-demo` → slug=`pmi`, name=`PMI`, legal_name=`PMI`.');
} else {
  console.log('  1. Rename `digilog-demo` → slug=`pmi`, name=`PMI`, legal_name=`PMI`.');
}

console.log('\n── Executing ──');

// Step 1+2: clean up the placeholder pmi.
if (pmi) {
  // Delete sites attached to placeholder pmi (cascade should handle any
  // checkpoint routes etc., but pmi is empty of patrols/profiles so this
  // should be trivial). If FK constraints block, the error surfaces here.
  const { error: sitesErr } = await sb.from('sites').delete().eq('org_id', pmi.id);
  if (sitesErr) {
    console.error(`  ✗ Failed to delete sites in pmi: ${sitesErr.message}`);
    process.exit(1);
  }
  console.log('  ✓ Deleted sites attached to empty pmi.');

  const { error: orgErr } = await sb.from('organizations').delete().eq('id', pmi.id);
  if (orgErr) {
    console.error(`  ✗ Failed to delete empty pmi org: ${orgErr.message}`);
    process.exit(1);
  }
  console.log('  ✓ Deleted empty pmi org.');
}

// Step 3: rename digilog-demo → pmi.
const { error: renameErr } = await sb
  .from('organizations')
  .update({ slug: 'pmi', name: 'PMI', legal_name: 'PMI' })
  .eq('id', demo.id);
if (renameErr) {
  console.error(`  ✗ Failed to rename digilog-demo → pmi: ${renameErr.message}`);
  process.exit(1);
}
console.log('  ✓ Renamed digilog-demo → pmi.');

console.log('\n✓ Done. Mobile users (Charlie Tango PIN 2549 etc.) are now under the `pmi` org.\n');
