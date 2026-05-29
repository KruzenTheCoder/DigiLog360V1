#!/usr/bin/env node
/**
 * DigiLog 360 — seed all login accounts.
 *
 * Creates (or updates) the demo accounts for every role via the Supabase Auth
 * admin API. The `handle_new_user` trigger turns each into a public.profiles row
 * using the role / site_id / full_name metadata passed here. Safe to re-run.
 *
 * Prerequisites:
 *   1. Schema deployed (run supabase/_deploy_all.sql or `supabase db push`).
 *   2. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY available.
 *
 * Usage (from repo root, with the root .env in place):
 *   node --env-file=.env scripts/seed-accounts.mjs
 *
 * Or pass env inline (PowerShell):
 *   $env:SUPABASE_URL="https://<ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
 *   node scripts/seed-accounts.mjs
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('\n✗ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('  Run with:  node --env-file=.env scripts/seed-accounts.mjs\n');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Demo accounts. Change the passwords before using in production.
 * The Sandton accounts exist so you can verify site-level RLS isolation.
 */
const ACCOUNTS = [
  { email: 'admin@digilog360.com',          password: 'Admin123!',      role: 'admin',        site: 'HQ Central', full_name: 'System Administrator' },
  { email: 'control@digilog360.com',        password: 'Control123!',    role: 'control_room', site: 'HQ Central', full_name: 'HQ Control Room' },
  { email: 'supervisor@digilog360.com',     password: 'Supervisor123!', role: 'supervisor',   site: 'HQ Central', full_name: 'HQ Supervisor' },
  { email: 'guard@digilog360.com',          password: 'Guard123!',      role: 'guard',        site: 'HQ Central', full_name: 'HQ Field Guard' },
  { email: 'sandton.control@digilog360.com', password: 'Control123!',   role: 'control_room', site: 'Sandton',    full_name: 'Sandton Control Room' },
  { email: 'sandton.guard@digilog360.com',   password: 'Guard123!',     role: 'guard',        site: 'Sandton',    full_name: 'Sandton Field Guard' },
];

async function preflight() {
  const { error } = await supabase.from('sites').select('id').limit(1);
  if (error) {
    console.error('\n✗ Could not read public.sites — has the schema been deployed?');
    console.error('  Run supabase/_deploy_all.sql in the SQL editor (or `supabase db push`) first.');
    console.error(`  (${error.message})\n`);
    process.exit(1);
  }
}

async function siteIdByName(name) {
  if (!name) return null;
  const { data } = await supabase.from('sites').select('id').eq('name', name).maybeSingle();
  if (!data) console.warn(`  ! site "${name}" not found — assigning no site.`);
  return data?.id ?? null;
}

async function findUserByEmail(email) {
  // Paginate through users (handles projects with many accounts).
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

async function upsertAccount(acc) {
  const site_id = await siteIdByName(acc.site);
  const metadata = { role: acc.role, site_id, full_name: acc.full_name };
  const existing = await findUserByEmail(acc.email);

  if (existing) {
    await supabase.auth.admin.updateUserById(existing.id, {
      password: acc.password, user_metadata: metadata, email_confirm: true,
    });
    await supabase.from('profiles').update({
      role: acc.role, site_id, full_name: acc.full_name, email: acc.email, is_active: true,
    }).eq('id', existing.id);
    return 'updated';
  }

  const { error } = await supabase.auth.admin.createUser({
    email: acc.email, password: acc.password, email_confirm: true, user_metadata: metadata,
  });
  if (error) throw error;
  return 'created';
}

console.log(`\nSeeding accounts on ${url}\n`);
await preflight();

const results = [];
for (const acc of ACCOUNTS) {
  try {
    const action = await upsertAccount(acc);
    results.push({ ...acc, action });
    console.log(`  ${action === 'created' ? '+' : '~'} ${acc.email}  (${acc.role} @ ${acc.site})`);
  } catch (e) {
    results.push({ ...acc, action: 'failed' });
    console.error(`  ✗ ${acc.email}: ${e.message ?? e}`);
  }
}

// Credentials summary
const ok = results.filter((r) => r.action !== 'failed');
console.log('\n────────────────────────────────────────────────────────────');
console.log(' DigiLog 360 — login credentials');
console.log('────────────────────────────────────────────────────────────');
for (const r of ok) {
  const surface = r.role === 'guard' || r.role === 'supervisor' ? 'mobile + web*' : 'web console';
  console.log(` ${r.role.padEnd(13)} ${r.email.padEnd(32)} ${r.password.padEnd(15)} ${surface}`);
}
console.log('────────────────────────────────────────────────────────────');
console.log(' web console = apps/admin (admin/control_room/supervisor)');
console.log(' mobile      = apps/mobile (guard/supervisor)');
console.log(' * supervisors can use both surfaces');
console.log('\nDone. Rotate these passwords before production.\n');
