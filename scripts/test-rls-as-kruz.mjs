#!/usr/bin/env node
/**
 * Simulate Kruz hitting the WITH CHECK expression of ack_write.
 * Uses service role to set the request.jwt.claims so the policy
 * evaluates exactly as it would for the real user, but lets us
 * peek at each component of the OR clause.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const KRUZ_ID = 'e4be4bdd-965f-448b-a91e-18d7f959e79c';
const KRUZ_ORG = 'd5b4cbd0-4b11-4889-91b7-8a6609c3bc82';

// 1. Use the admin auth to mint a magic-link session for Kruz, then make a
//    real Supabase client signed in AS Kruz, and try the insert. That tells
//    us whether the RLS layer accepts Kruz's session.
const { data: link, error: linkErr } = await sb.auth.admin.generateLink({
  type: 'magiclink',
  email: 'kruz@site.com',
});
if (linkErr) { console.error('Could not mint link:', linkErr.message); process.exit(1); }

const userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data: session, error: vErr } = await userClient.auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: 'magiclink',
});
if (vErr || !session.session) { console.error('verifyOtp failed:', vErr); process.exit(1); }

console.log('Signed in as Kruz, attempting test insert into manager_acknowledgements…\n');

const { data: occ } = await sb
  .from('occurrences').select('id, ob_number').eq('org_id', KRUZ_ORG).limit(1).single();

const payload = {
  org_id: KRUZ_ORG,
  occurrence_id: occ.id,
  ob_number: occ.ob_number,
  reviewed_by: KRUZ_ID,
  reviewed_by_name: 'Kruz Naidoo (TEST)',
  decision: 'acknowledged',
  manager_notes: 'RLS diagnostic — safe to delete',
};

const { data, error } = await userClient.from('manager_acknowledgements').insert(payload).select().maybeSingle();

if (error) {
  console.log('❌ INSERT REJECTED');
  console.log('   message:', error.message);
  console.log('   code:', error.code);
  console.log('   details:', error.details);
  console.log('   hint:', error.hint);
} else {
  console.log('✓ INSERT ACCEPTED — id=', data?.id);
  // Clean up our test row.
  await sb.from('manager_acknowledgements').delete().eq('id', data.id);
  console.log('  (test row deleted)');
}
console.log();
