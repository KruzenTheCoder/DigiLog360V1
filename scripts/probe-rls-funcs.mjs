#!/usr/bin/env node
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Mint a Kruz session.
const { data: link } = await sb.auth.admin.generateLink({
  type: 'magiclink', email: 'kruz@site.com',
});
const userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
await userClient.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });

console.log('Probing RLS helpers as Kruz:\n');

for (const fn of ['is_super_user', 'is_admin', 'is_manager']) {
  const { data, error } = await userClient.rpc(fn);
  console.log(`  ${fn}() →`, error ? `ERR: ${error.message}` : data);
}

const { data: org, error: orgErr } = await userClient.rpc('current_org_id');
console.log(`  current_org_id() →`, orgErr ? `ERR: ${orgErr.message}` : org);

const { data: roles, error: rolesErr } = await userClient.rpc('current_app_roles');
console.log(`  current_app_roles() →`, rolesErr ? `ERR: ${rolesErr.message}` : roles);

const { data: hasMgr, error: hasErr } = await userClient.rpc('has_any_role', {
  _roles: ['admin', 'manager'],
});
console.log(`  has_any_role(['admin','manager']) →`, hasErr ? `ERR: ${hasErr.message}` : hasMgr);

console.log();
