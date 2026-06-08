#!/usr/bin/env node
/**
 * DigiLog 360 — verify the DB state for mobile PIN login.
 *
 * Usage:  node scripts/verify-db-state.mjs
 *
 * Prints:
 *   • All organizations (slug, name, is_active).
 *   • Profile counts in the `pmi` org by role.
 *   • Guards with a pin_hash set (the ones that can actually log in on mobile).
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

console.log('\n=== organizations ===');
const { data: orgs } = await sb.from('organizations').select('id, slug, name, is_active');
console.table(orgs?.map((o) => ({ slug: o.slug, name: o.name, is_active: o.is_active, id: o.id })) ?? []);

const pmi = orgs?.find((o) => o.slug === 'pmi');
if (!pmi) {
  console.error('\n✗ No organization with slug "pmi" found. Run the rename SQL.');
  process.exit(1);
}

console.log(`\n=== profiles in "pmi" (org_id ${pmi.id}) ===`);
const { data: profs } = await sb
  .from('profiles')
  .select('id, full_name, role, employee_number, pin_hash, is_active')
  .eq('org_id', pmi.id);

const byRole = {};
for (const p of profs ?? []) {
  byRole[p.role] = (byRole[p.role] ?? 0) + 1;
}
console.log('counts by role:', byRole);

const guardsWithPin = (profs ?? []).filter(
  (p) => (p.role === 'guard' || p.role === 'supervisor') && p.pin_hash && p.is_active,
);
console.log(`\n=== mobile users with a PIN set (${guardsWithPin.length}) ===`);
console.table(
  guardsWithPin.map((g) => ({
    name: g.full_name,
    role: g.role,
    employee_number: g.employee_number ?? '—',
    pin_hash_prefix: g.pin_hash?.slice(0, 7) + '…',
  })),
);

if (guardsWithPin.length === 0) {
  console.error('\n✗ No guards/supervisors in pmi have a PIN. Run: node scripts/seed-accounts.mjs');
} else {
  console.log('\n✓ Mobile PIN login should work. Try any of the employee numbers above as a PIN.');
}
console.log();
