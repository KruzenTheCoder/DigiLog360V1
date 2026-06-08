#!/usr/bin/env node
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log('\n=== Kruz profile ===');
const { data: kruz } = await sb
  .from('profiles')
  .select('id, email, role, roles, org_id, site_id, is_active')
  .eq('email', 'kruz@site.com')
  .maybeSingle();
console.log(JSON.stringify(kruz, null, 2));

if (kruz) {
  console.log('\n  Has "manager" in roles:', Array.isArray(kruz.roles) && kruz.roles.includes('manager'));
  console.log('  primary role:', kruz.role);
  console.log('  org_id:', kruz.org_id);
}

console.log('\n=== current_org_id() for Kruz (simulated) ===');
console.log('Should match kruz.org_id above.');

console.log('\n=== one occurrence + its org_id ===');
const { data: occ } = await sb
  .from('occurrences')
  .select('id, ob_number, org_id, status')
  .limit(1)
  .single();
console.log(JSON.stringify(occ, null, 2));
console.log('  Occurrence org_id matches Kruz org_id?', occ?.org_id === kruz?.org_id);

console.log('\n=== ack_write policy text ===');
const { data: policy } = await sb.rpc('pg_get_policy_text').catch(() => ({ data: null }));
console.log(policy ?? '(pg_get_policy_text RPC not available — skipping)');
console.log();
