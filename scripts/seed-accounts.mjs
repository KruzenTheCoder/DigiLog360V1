#!/usr/bin/env node
/**
 * DigiLog 360 — seed all production-style accounts.
 *
 * Creates / updates:
 *   • The `pmi` organization (handled by migration; safe to re-run).
 *   • One cross-org SUPER USER.
 *   • The full real-world user line-up across roles:
 *       - Admin
 *       - Manager
 *       - Control Room  (+ Control Room Manager combos via multi-role)
 *       - Supervisor
 *       - Guard
 *
 * Identity rules:
 *   • Web users (admin / manager / control_room / supervisor with a real email)
 *     authenticate with email + password on the web console.
 *   • Mobile users (guard / supervisor with a 4-digit PIN)
 *     authenticate with org_slug + employee_number + PIN on the mobile app.
 *     Their email is synthetic (auto-generated, never used to log in).
 *
 * Multi-role:
 *   • "Control Room Manager" expands to roles=[control_room, manager].
 *     Primary role is control_room; manager grants the acknowledgement queue.
 *
 * Prerequisites:
 *   1. All migrations deployed (including the multi-role + capability ones).
 *   2. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY available.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-accounts.mjs
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

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

const DEMO_ORG_SLUG = 'pmi';

// ---------------------------------------------------------------------------
// Helper: derive a friendly display name from an email when no name is given.
// ---------------------------------------------------------------------------
function nameFromEmail(email) {
  const local = email.split('@')[0];
  // Special cases for the legacy mailbox names.
  const map = {
    'admin@site.com': 'Administrator',
    'charlietango@pmi.com': 'Charlie Tango',
    'maingate1@pmi.com': 'Main Gate 1',
    'maingate2@pmi.com': 'Main Gate 2',
    'supervisor@pmi.com': 'Supervisor (Boksburg)',
    'guard@nets.com': 'Guard (Cape Town)',
    'guard@netstreamissupport.com': 'Guard (Sandton)',
    'supervisor@netstreamissupport.com': 'Supervisor (Cape Town)',
    'sherwin.control@pmi.com': 'Sherwin (Control)',
    'patroldevice@pmi.com': 'Patrol Device',
    'sierra1@pmi.com': 'Sierra 1',
    'sierra@pmi.com': 'Sierra',
    'anthony.control@pmi.com': 'Anthony (Control)',
    'control@nets.com': 'Control (Cape Town)',
    'leafgate@pmi.com': 'Leaf Gate',
    'supervisor@nets.com': 'Supervisor (Sandton)',
    'controlroom@netstreamissupport.com': 'Control Room (NIS)',
    'dpgate@pmi.com': 'DP Gate',
    'dp2@pmi.com': 'DP 2',
    'capetown.control@pmi.com': 'Cape Town (Control)',
  };
  if (map[email]) return map[email];
  // Otherwise prettify: take the local part, split on . or _, title-case.
  return local
    .split(/[._]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

/**
 * Synthesize an email for a mobile-only user (4-digit PIN guard / supervisor
 * with no real mailbox). We need *some* email because Supabase Auth requires
 * one — but it's never used to log in.
 */
function synthesizeEmail(fullName, code) {
  const slug = fullName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
  return `${slug || 'guard.' + code}@field.digilog360.local`;
}

// ---------------------------------------------------------------------------
// Per-email site assignment, mirroring the legacy AspNetUsers SiteLocation
// data. Anything not in the map defaults to HQ Central.
// ---------------------------------------------------------------------------
const SITE_BY_EMAIL = {
  'admin@site.com':                    'HQ Central',
  'kruz@site.com':                     'HQ Central',
  'charlietango@pmi.com':              'Cape Town',
  'maingate1@pmi.com':                 'Boksburg',
  'maingate2@pmi.com':                 'Boksburg',
  'supervisor@pmi.com':                'Boksburg',
  'patroldevice@pmi.com':              'Boksburg',
  'leafgate@pmi.com':                  'Boksburg',
  'dpgate@pmi.com':                    'Boksburg',
  'dp2@pmi.com':                       'Boksburg',
  'sierra1@pmi.com':                   'Sandton',
  'sierra@pmi.com':                    'Sandton',
  'sherwin.control@pmi.com':           'Sandton',
  'guard@nets.com':                    'Cape Town',
  'control@nets.com':                  'Cape Town',
  'supervisor@nets.com':               'Sandton',
  'anthony.control@pmi.com':           'Cape Town',
  'capetown.control@pmi.com':          'Cape Town',
  'guard@netstreamissupport.com':      'Sandton',
  'supervisor@netstreamissupport.com': 'Cape Town',
  'controlroom@netstreamissupport.com': 'Cape Town',
  'udeen.control@pmi.com':             'HQ Central',
  'cellier.combrink@pmi.com': 'HQ Central',
  'tshikovhi.mpho@pmi.com':   'HQ Central',
  'jj.barnard@pmi.com':       'HQ Central',
  'willem.smith@pmi.com':     'HQ Central',
  'casper.control@pmi.com':            'HQ Central',
};

// ---------------------------------------------------------------------------
// Convert the user-supplied role label into roles[] (multi-role aware).
// ---------------------------------------------------------------------------
function rolesFromLabel(label) {
  switch (label) {
    case 'super_user':            return ['super_user'];
    case 'Admin':                 return ['admin'];
    case 'Manager':               return ['manager'];
    case 'Control Room':          return ['control_room'];
    case 'Control Room Manager':  return ['control_room', 'manager'];
    case 'Supervisor':            return ['supervisor'];
    case 'Guard':                 return ['guard'];
    default:
      throw new Error(`Unknown role label: ${label}`);
  }
}

// ---------------------------------------------------------------------------
// The full user list. Each row:
//   { name, email | null, secret, role, site? }
//
//   • For web users (admin / manager / control_room / supervisor with a real
//     email), `secret` is their web login password.
//   • For mobile users (guard / supervisor with a 4-digit code), `secret` is
//     their PIN — used as BOTH employee_number and the bcrypt-hashed PIN.
//     (Operators can edit employee numbers later in the admin console.)
// ---------------------------------------------------------------------------
const RAW_USERS = [
  // ─── Cross-org super user ──────────────────────────────────────────────
  { name: 'Platform Super User', email: 'super@digilog360.com', secret: 'Super123!', role: 'super_user' },

  // ─── Admin ─────────────────────────────────────────────────────────────
  { name: 'Administrator',              email: 'admin@site.com',                              secret: 'AdmiAdmi123!', role: 'Admin' },

  // ─── Manager (web; PMI manager logins + Control Room Managers below) ─────
  { name: 'Cellier Combrink',           email: 'cellier.combrink@pmi.com',                    secret: 'CellMana123!', role: 'Manager' },
  { name: 'Tshikovhi Mpho',             email: 'tshikovhi.mpho@pmi.com',                      secret: 'TshiMana123!', role: 'Manager' },
  { name: 'JJ Barnard',                 email: 'jj.barnard@pmi.com',                          secret: 'JjBaMana123!', role: 'Manager' },
  { name: 'Willem Smith',               email: 'willem.smith@pmi.com',                        secret: 'WillMana123!', role: 'Manager' },

  // ─── Control Room (single role) ────────────────────────────────────────
  { name: 'Sherwin (Control)',          email: 'sherwin.control@pmi.com',                     secret: 'SherCont123!', role: 'Control Room' },
  { name: 'Anthony (Control)',          email: 'anthony.control@pmi.com',                     secret: 'AnthCont123!', role: 'Control Room' },
  { name: 'Mpho Tshikovi',              email: 'dp2@pmi.com',                                 secret: 'MphoCont123!', role: 'Control Room' },
  { name: 'Control (Cape Town)',        email: 'control@nets.com',                            secret: 'ContCont123!', role: 'Control Room' },
  { name: 'Control Room (NIS)',         email: 'controlroom@netstreamissupport.com',          secret: 'ContCont123!', role: 'Control Room' },
  { name: 'Cape Town (Control)',        email: 'capetown.control@pmi.com',                    secret: 'CapeCont123!', role: 'Control Room' },

  // ─── Control Room Manager (multi-role: control_room + manager) ────────
  { name: 'Udeen Singh',                email: 'udeen.control@pmi.com',                       secret: 'UdeeCont123!', role: 'Control Room Manager' },
  { name: 'Kruz Naidoo',                email: 'kruz@site.com',                               secret: 'KruzCont123!', role: 'Control Room Manager' },
  { name: 'Casper Van der Merwe',       email: 'casper.control@pmi.com',                      secret: 'CaspCont123!', role: 'Control Room Manager' },

  // ─── Supervisor (web/mobile via email) ─────────────────────────────────
  { name: 'Supervisor (Boksburg)',      email: 'supervisor@pmi.com',                          secret: '2632', role: 'Supervisor' },
  { name: 'Supervisor (Sandton)',       email: 'supervisor@nets.com',                         secret: '3633', role: 'Supervisor' },
  { name: 'Supervisor (Cape Town)',     email: 'supervisor@netstreamissupport.com',           secret: '8373', role: 'Supervisor' },

  // ─── Supervisor (PIN-only, mobile) ─────────────────────────────────────
  { name: 'Sibusiso Tembe',             email: null, secret: '9183', role: 'Supervisor' },
  { name: 'Nkululeko Mhlongo',          email: null, secret: '0181', role: 'Supervisor' },
  { name: 'Sicebi Kunene',              email: null, secret: '2719', role: 'Supervisor' },

  // ─── Guards (with email + PIN — legacy field accounts) ────────────────
  { name: 'Charlie Tango',              email: 'charlietango@pmi.com',                        secret: '2549', role: 'Guard' },
  { name: 'Main Gate 1',                email: 'maingate1@pmi.com',                           secret: '6369', role: 'Guard' },
  { name: 'Guard (Cape Town)',          email: 'guard@nets.com',                              secret: '3177', role: 'Guard' },
  { name: 'Guard (Sandton)',            email: 'guard@netstreamissupport.com',                secret: '7970', role: 'Guard' },
  { name: 'Main Gate 2',                email: 'maingate2@pmi.com',                           secret: '8097', role: 'Guard' },
  { name: 'Patrol Device',              email: 'patroldevice@pmi.com',                        secret: '4675', role: 'Guard' },
  { name: 'Sierra 1',                   email: 'sierra1@pmi.com',                             secret: '5066', role: 'Guard' },
  { name: 'Leaf Gate',                  email: 'leafgate@pmi.com',                            secret: '9783', role: 'Guard' },
  { name: 'Sierra',                     email: 'sierra@pmi.com',                              secret: '0493', role: 'Guard' },
  { name: 'DP Gate',                    email: 'dpgate@pmi.com',                              secret: '9811', role: 'Guard' },

  // ─── Guards (PIN-only, synthetic email) ───────────────────────────────
  { name: 'Mashilo Mphago',             email: null, secret: '3966', role: 'Guard' },
  { name: 'Patnorah Maoeng',            email: null, secret: '4887', role: 'Guard' },
  { name: 'Siphamandla Nkosi',          email: null, secret: '8642', role: 'Guard' },
  { name: 'Mduduzi Madi',               email: null, secret: '6080', role: 'Guard' },
  { name: 'Phindile Nkosi',             email: null, secret: '2431', role: 'Guard' },
  { name: 'Peter Tshabalala',           email: null, secret: '5040', role: 'Guard' },
  { name: 'Lindelani Sithole',          email: null, secret: '9662', role: 'Guard' },
  { name: 'Teddy Dlamini',              email: null, secret: '5913', role: 'Guard' },
  { name: 'Mbuso Mahlangu',             email: null, secret: '8709', role: 'Guard' },
  { name: 'Thembinkosi Tshabalala',     email: null, secret: '0767', role: 'Guard' },
  { name: 'Nobuhle Mbatha',             email: null, secret: '8282', role: 'Guard' },
  { name: 'Emihle Ngalathi',            email: null, secret: '3461', role: 'Guard' },
  { name: 'Banele Ndaba',               email: null, secret: '0085', role: 'Guard' },
  { name: 'Patricia Mehlape',           email: null, secret: '4986', role: 'Guard' },
  { name: 'Rose Ntuli',                 email: null, secret: '4001', role: 'Guard' },
  { name: 'Bongani Sikhakhane',         email: null, secret: '7323', role: 'Guard' },
  { name: 'Mlandeni Zulu',              email: null, secret: '5288', role: 'Guard' },
  { name: 'Jacob Zwane',                email: null, secret: '1365', role: 'Guard' },
  { name: 'Cebisile Mthembu',           email: null, secret: '5916', role: 'Guard' },
];

// ---------------------------------------------------------------------------
// Normalise each raw row into the canonical account shape we feed to upsert.
// ---------------------------------------------------------------------------
function buildAccount(raw) {
  const roles = rolesFromLabel(raw.role);
  const isSuper = roles.includes('super_user');
  const isMobile = roles.includes('guard') ||
    (roles.includes('supervisor') && /^\d{4}$/.test(raw.secret));
  const isWeb = !isMobile;

  const email = raw.email
    ?? synthesizeEmail(raw.name, raw.secret);

  // For mobile users the 4-digit code is the PIN (and doubles as the
  // employee_number, so they can type the same value in both fields).
  const pin = isMobile ? raw.secret : null;
  const employee_number = isMobile ? raw.secret : null;
  // Generate a strong random password for mobile-only users (they never use it).
  const password = isWeb
    ? raw.secret
    : 'mob_' + Math.random().toString(36).slice(2, 14) + Math.random().toString(36).slice(2, 14);

  const site = isSuper ? null : (SITE_BY_EMAIL[email] ?? 'HQ Central');

  return {
    email: email.toLowerCase(),
    password,
    full_name: raw.name,
    roles,
    primary_role: roles[0],
    employee_number,
    pin,
    site,
    scope: isSuper ? 'global' : 'org',
    rawSecret: raw.secret,
    isMobile,
  };
}

const ACCOUNTS = RAW_USERS.map(buildAccount);

// ===========================================================================
// Preflight + lookups
// ===========================================================================
async function preflight() {
  const { error: sitesErr } = await supabase.from('sites').select('id').limit(1);
  if (sitesErr) {
    console.error('\n✗ Could not read public.sites — has the schema been deployed?');
    console.error(`  (${sitesErr.message})\n`);
    process.exit(1);
  }
  const { error: orgsErr } = await supabase.from('organizations').select('id').limit(1);
  if (orgsErr) {
    console.error('\n✗ Could not read public.organizations.');
    console.error('  Apply migration 20260603000001_multi_tenant_and_pin.sql.');
    console.error(`  (${orgsErr.message})\n`);
    process.exit(1);
  }
}

async function getDemoOrgId() {
  const { data } = await supabase
    .from('organizations').select('id').eq('slug', DEMO_ORG_SLUG).maybeSingle();
  if (data?.id) return data.id;
  const { data: created, error } = await supabase
    .from('organizations')
    .insert({
      name: 'PMI', slug: DEMO_ORG_SLUG,
      legal_name: 'PMI', plan: 'standard',
    })
    .select('id').single();
  if (error) throw error;
  return created.id;
}

async function ensureDemoSites(orgId) {
  const sites = [
    { name: 'Sandton',    code: 'SAN', address: 'Sandton, Johannesburg' },
    { name: 'Cape Town',  code: 'CPT', address: 'Cape Town CBD' },
    { name: 'Boksburg',   code: 'BOK', address: 'Boksburg, East Rand' },
    { name: 'HQ Central', code: 'HQ',  address: 'Head Office' },
  ];
  for (const s of sites) {
    const { data: existing } = await supabase
      .from('sites').select('id').eq('name', s.name).eq('org_id', orgId).maybeSingle();
    if (!existing) {
      await supabase.from('sites').insert({ ...s, org_id: orgId });
    }
  }
}

const SITE_CACHE = new Map();
async function siteIdByName(name, orgId) {
  if (!name) return null;
  const key = `${orgId}::${name}`;
  if (SITE_CACHE.has(key)) return SITE_CACHE.get(key);
  const { data } = await supabase
    .from('sites').select('id').eq('name', name).eq('org_id', orgId).maybeSingle();
  if (!data) console.warn(`  ! site "${name}" not found — leaving unassigned.`);
  SITE_CACHE.set(key, data?.id ?? null);
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

async function upsertAccount(acc, demoOrgId) {
  const orgId = acc.scope === 'global' ? null : demoOrgId;
  const site_id = orgId ? await siteIdByName(acc.site, orgId) : null;

  const metadata = {
    role: acc.primary_role,
    roles: acc.roles,
    site_id,
    full_name: acc.full_name,
    org_id: orgId,
    employee_number: acc.employee_number,
  };

  const existing = await findUserByEmail(acc.email);

  if (existing) {
    await supabase.auth.admin.updateUserById(existing.id, {
      password: acc.password, user_metadata: metadata, email_confirm: true,
    });
  } else {
    const { error } = await supabase.auth.admin.createUser({
      email: acc.email, password: acc.password, email_confirm: true, user_metadata: metadata,
    });
    if (error) throw error;
  }

  // Re-fetch (handles the trigger-created profile row).
  const user = existing ?? (await findUserByEmail(acc.email));
  if (!user) throw new Error(`user lookup failed for ${acc.email}`);

  const patch = {
    role: acc.primary_role,
    roles: acc.roles,
    site_id,
    full_name: acc.full_name,
    email: acc.email,
    is_active: true,
    employee_number: acc.employee_number,
  };
  if (orgId) patch.org_id = orgId;
  if (acc.pin) {
    // rounds=4 matches the edge function's PIN_BCRYPT_ROUNDS — see
    // supabase/functions/_shared/pin.ts for rationale.
    patch.pin_hash = bcrypt.hashSync(acc.pin, 4);
    patch.pin_set_at = new Date().toISOString();
  }
  await supabase.from('profiles').update(patch).eq('id', user.id);

  return existing ? 'updated' : 'created';
}

// ===========================================================================
// Main
// ===========================================================================
console.log(`\nSeeding ${ACCOUNTS.length} accounts on ${url}\n`);
await preflight();
const demoOrgId = await getDemoOrgId();
await ensureDemoSites(demoOrgId);
console.log(`  Demo org id: ${demoOrgId}\n`);

const summary = { created: 0, updated: 0, failed: 0 };

for (const acc of ACCOUNTS) {
  try {
    const action = await upsertAccount(acc, demoOrgId);
    summary[action] += 1;
    const rolesLabel = acc.roles.join('+');
    console.log(`  ${action === 'created' ? '+' : '~'} ${acc.email.padEnd(48)} ${rolesLabel.padEnd(22)} ${acc.site ?? '—'}`);
  } catch (e) {
    summary.failed += 1;
    console.error(`  ✗ ${acc.email}: ${e.message ?? e}`);
  }
}

// ===========================================================================
// Credential summary
// ===========================================================================
const ok = ACCOUNTS.filter((_, i) => i < ACCOUNTS.length);   // we logged each above
void ok;

console.log('\n──────────────────────────────────────────────────────────────────────────');
console.log('  WEB CONSOLE   (apps/admin)   sign in with email + password');
console.log('──────────────────────────────────────────────────────────────────────────');
for (const a of ACCOUNTS) {
  if (a.scope === 'global' || (!a.isMobile && a.password === a.rawSecret)) {
    console.log(`   ${a.email.padEnd(48)} ${a.rawSecret.padEnd(15)}  [${a.roles.join('+')}]`);
  }
}

console.log('\n──────────────────────────────────────────────────────────────────────────');
console.log(`  MOBILE APP    (apps/mobile)   org slug: ${DEMO_ORG_SLUG}`);
console.log('──────────────────────────────────────────────────────────────────────────');
console.log('  Enter the 4-digit number in BOTH "Employee number" and "PIN" fields.');
for (const a of ACCOUNTS) {
  if (a.isMobile) {
    console.log(`   ${a.full_name.padEnd(28)} emp/pin ${a.rawSecret}  site ${a.site ?? '—'}  [${a.roles.join('+')}]`);
  }
}

console.log(`\nDone. created=${summary.created} updated=${summary.updated} failed=${summary.failed}\n`);
console.log('  Rotate all credentials before production. PINs and passwords above\n  are documented in version control and must NOT be used in real deployments.\n');
