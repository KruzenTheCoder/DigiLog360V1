// Temporary diagnostic — (1) live columns of the four RLS tables, (2) dp2
// profile + page queries under RLS. Deleted after verification.
import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL, svc = process.env.SUPABASE_SERVICE_ROLE_KEY, anon = process.env.SUPABASE_ANON_KEY;
const admin = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });

// --- 1. Which columns exist on each table (probe with a select) -------------
for (const t of ['occurrences', 'visitors', 'keys', 'key_handovers']) {
  const { data, error } = await admin.from(t).select('*').limit(1);
  if (error) { console.log(`${t}: ERROR ${error.message}`); continue; }
  const cols = data && data[0] ? Object.keys(data[0]) : [];
  console.log(`${t}: rows=${data?.length} site_id=${cols.includes('site_id')} org_id=${cols.includes('org_id')} deleted_at=${cols.includes('deleted_at')}${cols.length ? '' : ' (empty table — cols unknown)'}`);
}

// --- 2. dp2 profile ----------------------------------------------------------
const { data: prof } = await admin.from('profiles')
  .select('id, email, full_name, role, roles, site_id, site_ids, org_id, is_active')
  .eq('email', 'dp2@pmi.com').maybeSingle();
console.log('\ndp2 profile:', JSON.stringify(prof));

const { data: sites } = await admin.from('sites').select('id, name, org_id');
const siteById = Object.fromEntries((sites ?? []).map(s => [s.id, s.name]));
console.log('dp2 primary site:', prof?.site_id ? siteById[prof.site_id] : null,
  '| site_ids:', (prof?.site_ids ?? []).map(id => siteById[id]));

const { count: totalOcc } = await admin.from('occurrences').select('id', { count: 'exact', head: true });
console.log('TOTAL occurrences (service role):', totalOcc);
const bok = (sites ?? []).find(s => s.name === 'Boksburg');
const { count: bokCount } = await admin.from('occurrences').select('id', { count: 'exact', head: true }).eq('site_id', bok.id);
console.log(`Boksburg total=${bokCount} (service role)`);

// --- 3. Sign in AS dp2 and reproduce the page queries -----------------------
const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'dp2@pmi.com' });
if (le) { console.log('link err', le.message); process.exit(1); }
const asUser = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
const { error: ve } = await asUser.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
if (ve) { console.log('otp err', ve.message); process.exit(1); }
console.log('\nSigned in as dp2');

const own = [...new Set([...(prof.site_ids ?? []), ...(prof.site_id ? [prof.site_id] : [])])];
console.log('ownSites:', own.map(id => siteById[id]));
async function timed(label, fn) {
  const t = Date.now();
  try { const r = await fn(); console.log(`${label}: rows=${r.data?.length ?? '—'} count=${r.count ?? '—'} err=${r.error?.message ?? 'none'} (${Date.now() - t}ms)`); }
  catch (e) { console.log(`${label}: THREW ${e.message} (${Date.now() - t}ms)`); }
}
if (own.length) {
  await timed('LIVE (occurrences_live eq site)', () => asUser.from('occurrences_live').select('id, ob_number, status').eq('site_id', own[0]).order('incident_at', { ascending: false }));
  await timed('HISTORY (closed, in sites)', () => asUser.from('occurrences').select('id, ob_number').in('status', ['resolved', 'closed']).in('site_id', own).order('closed_at', { ascending: false }).limit(50));
  await timed('ALL (in sites)', () => asUser.from('occurrences').select('id, ob_number', { count: 'exact' }).in('site_id', own).limit(50));
} else {
  await timed('FALLBACK (logged_by=dp2)', () => asUser.from('occurrences').select('id, ob_number', { count: 'exact' }).eq('logged_by', prof.id).limit(50));
}
await timed('UNFILTERED RLS-only count', () => asUser.from('occurrences').select('id', { count: 'exact', head: true }));
const { data: csids, error: csErr } = await asUser.rpc('current_site_ids');
console.log('current_site_ids():', JSON.stringify((csids ?? []).map(id => siteById[id] ?? id)), csErr?.message ?? '');
