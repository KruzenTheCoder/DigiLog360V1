#!/usr/bin/env node
/**
 * DigiLog 360 — seed the migrated legacy (AspNetUsers) accounts.
 *
 * The legacy ASP.NET Identity PBKDF2 password hashes CANNOT be reused by
 * Supabase Auth (which uses bcrypt), so every account is created with a single
 * temporary password. Users (or an admin) must change it afterwards.
 *
 * Role is inferred from the email; site comes from the legacy SiteLocation.
 *
 * Prerequisites:
 *   1. Schema + sites seeded (run supabase/_deploy_all.sql or `supabase db push`).
 *   2. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY available.
 *
 * Usage (from repo root, with the root .env in place):
 *   node --env-file=.env scripts/seed-new.mjs
 *   # optional: override the temporary password
 *   SEED_PASSWORD='YourTemp#2026' node --env-file=.env scripts/seed-new.mjs
 *
 * The repo-root .env is loaded automatically (via dotenv), so this also works:
 *   node scripts/seed-new.mjs          (from the repo root)
 *   node seed-new.mjs                  (from the scripts/ folder)
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Load the repo-root .env regardless of the current working directory.
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEMP_PASSWORD = process.env.SEED_PASSWORD || 'Digilog#2026';

if (!url || !serviceKey) {
  console.error('\n✗ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('  Run with:  node --env-file=.env scripts/seed-new.mjs\n');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Migrated accounts (from the legacy AspNetUsers dump).
 * role: admin | control_room | supervisor | guard
 * site: must match a public.sites.name (null = unassigned)
 */
const ACCOUNTS = [
  { email: 'admin@site.com',                       role: 'admin',        site: null,         full_name: 'Administrator' },
  { email: 'charlietango@pmi.com',                 role: 'guard',        site: 'Cape Town',  full_name: 'Charlie Tango' },
  { email: 'udeen.control@pmi.com',                role: 'control_room', site: 'HQ Central', full_name: 'Udeen (Control)' },
  { email: 'maingate1@pmi.com',                    role: 'guard',        site: 'Boksburg',   full_name: 'Main Gate 1' },
  { email: 'supervisor@pmi.com',                   role: 'supervisor',   site: 'Boksburg',   full_name: 'Supervisor (Boksburg)' },
  { email: 'guard@nets.com',                       role: 'guard',        site: 'Cape Town',  full_name: 'Guard (Cape Town)' },
  { email: 'guard@netstreamissupport.com',         role: 'guard',        site: 'Sandton',    full_name: 'Guard (Sandton)' },
  { email: 'supervisor@netstreamissupport.com',    role: 'supervisor',   site: 'Cape Town',  full_name: 'Supervisor (Cape Town)' },
  { email: 'maingate2@pmi.com',                    role: 'guard',        site: 'Boksburg',   full_name: 'Main Gate 2' },
  { email: 'dp2@pmi.com',                          role: 'guard',        site: 'Boksburg',   full_name: 'DP 2' },
  { email: 'sherwin.control@pmi.com',              role: 'control_room', site: 'Sandton',    full_name: 'Sherwin (Control)' },
  { email: 'patroldevice@pmi.com',                 role: 'guard',        site: 'Boksburg',   full_name: 'Patrol Device' },
  { email: 'sierra1@pmi.com',                      role: 'guard',        site: 'Sandton',    full_name: 'Sierra 1' },
  { email: 'anthony.control@pmi.com',              role: 'control_room', site: 'Cape Town',  full_name: 'Anthony (Control)' },
  { email: 'admin@netstreamissupport.com',         role: 'admin',        site: 'HQ Central', full_name: 'Administrator (NIS)' },
  { email: 'control@nets.com',                     role: 'control_room', site: 'Cape Town',  full_name: 'Control (Cape Town)' },
  { email: 'leafgate@pmi.com',                     role: 'guard',        site: 'Boksburg',   full_name: 'Leaf Gate' },
  { email: 'casper.control@pmi.com',               role: 'control_room', site: 'HQ Central', full_name: 'Casper (Control)' },
  { email: 'supervisor@nets.com',                  role: 'supervisor',   site: 'Sandton',    full_name: 'Supervisor (Sandton)' },
  { email: 'controlroom@netstreamissupport.com',   role: 'control_room', site: 'Cape Town',  full_name: 'Control Room (NIS)' },
  { email: 'sierra@pmi.com',                       role: 'guard',        site: 'Sandton',    full_name: 'Sierra' },
  { email: 'dpgate@pmi.com',                       role: 'guard',        site: 'Boksburg',   full_name: 'DP Gate' },
  { email: 'admin@netstreamsupport.com',           role: 'admin',        site: 'HQ Central', full_name: 'Administrator (NS)' },
  { email: 'capetown.control@pmi.com',             role: 'control_room', site: 'Cape Town',  full_name: 'Cape Town (Control)' },
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

// Cache site name -> id lookups.
const siteCache = new Map();
async function siteIdByName(name) {
  if (!name) return null;
  if (siteCache.has(name)) return siteCache.get(name);
  const { data } = await supabase.from('sites').select('id').eq('name', name).maybeSingle();
  if (!data) console.warn(`  ! site "${name}" not found — assigning no site.`);
  siteCache.set(name, data?.id ?? null);
  return data?.id ?? null;
}

async function findUserByEmail(email) {
  for (let page = 1; page <= 50; page++) {
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
      password: TEMP_PASSWORD, user_metadata: metadata, email_confirm: true,
    });
    await supabase.from('profiles').update({
      role: acc.role, site_id, full_name: acc.full_name, email: acc.email, is_active: true,
    }).eq('id', existing.id);
    return 'updated';
  }

  const { error } = await supabase.auth.admin.createUser({
    email: acc.email, password: TEMP_PASSWORD, email_confirm: true, user_metadata: metadata,
  });
  if (error) throw error;
  return 'created';
}

console.log(`\nSeeding ${ACCOUNTS.length} migrated accounts on ${url}`);
console.log(`Temporary password for all: ${TEMP_PASSWORD}\n`);
await preflight();

let created = 0, updated = 0, failed = 0;
for (const acc of ACCOUNTS) {
  try {
    const action = await upsertAccount(acc);
    action === 'created' ? created++ : updated++;
    console.log(`  ${action === 'created' ? '+' : '~'} ${acc.email.padEnd(38)} ${acc.role.padEnd(13)} ${acc.site ?? '—'}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${acc.email}: ${e.message ?? e}`);
  }
}

console.log(`\nDone. created=${created} updated=${updated} failed=${failed}`);
console.log('All accounts share the temporary password above — rotate before production.\n');
