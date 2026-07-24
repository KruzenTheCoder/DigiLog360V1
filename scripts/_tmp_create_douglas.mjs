// Create Douglas Masha — guard, org pmi, site Boksburg — with a unique PIN.
// Mirrors the flow used for the previous four guards. Deleted after run.
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PMI_ORG = 'd5b4cbd0-4b11-4889-91b7-8a6609c3bc82';
const BOKSBURG_SITE = '47a1f0db-b5e4-43b7-8a15-d0f541f15d11';
const NAME = 'Douglas Masha';

// 1. Duplicate check.
const { data: existing } = await supabase.from('profiles')
  .select('id, full_name, email, role, employee_number, is_active')
  .ilike('full_name', `%${NAME}%`);
if (existing && existing.length > 0) {
  console.log('ALREADY EXISTS — aborting:');
  for (const p of existing) console.log(`  ${p.full_name} <${p.email}> role=${p.role} emp=${p.employee_number} active=${p.is_active}`);
  process.exit(0);
}

// 2. Collision sets from active pmi profiles (PIN must be unique in org —
//    pin-login matches by PIN alone).
const { data: actives } = await supabase.from('profiles')
  .select('employee_number, pin_hash')
  .eq('org_id', PMI_ORG).eq('is_active', true);
const usedEmp = new Set((actives ?? []).map(a => a.employee_number).filter(Boolean));
const hashes = (actives ?? []).map(a => a.pin_hash).filter(Boolean);

function collides(pin) {
  if (usedEmp.has(pin)) return true;
  for (const h of hashes) { try { if (bcrypt.compareSync(pin, h)) return true; } catch {} }
  return false;
}
let pin = null;
for (let i = 0; i < 5000; i++) {
  const cand = String(Math.floor(1000 + Math.random() * 9000));
  if (!collides(cand)) { pin = cand; break; }
}
if (!pin) { console.log('Could not find a free PIN'); process.exit(1); }

// 3. Create auth user + profile.
const email = 'douglas.masha@field.digilog360.local';
const password = 'mob_' + Math.random().toString(36).slice(2, 14) + Math.random().toString(36).slice(2, 14);
const metadata = {
  role: 'guard', roles: ['guard'], site_id: BOKSBURG_SITE,
  full_name: NAME, org_id: PMI_ORG, employee_number: pin,
};
const { data: created, error: cErr } = await supabase.auth.admin.createUser({
  email, password, email_confirm: true, user_metadata: metadata,
});
if (cErr) { console.log('createUser error:', cErr.message); process.exit(1); }

const { error: uErr } = await supabase.from('profiles').update({
  role: 'guard', roles: ['guard'],
  site_id: BOKSBURG_SITE, site_ids: [BOKSBURG_SITE],
  full_name: NAME, email, is_active: true, org_id: PMI_ORG,
  employee_number: pin,
  pin_hash: bcrypt.hashSync(pin, 4),
  pin_set_at: new Date().toISOString(),
}).eq('id', created.user.id);
if (uErr) { console.log('profile update error:', uErr.message); process.exit(1); }

// 4. Verify end state + PIN validates.
const { data: check } = await supabase.from('profiles')
  .select('full_name, role, is_active, site_id, site_ids, employee_number, pin_hash, org_id')
  .eq('id', created.user.id).single();
const pinOk = check?.pin_hash ? bcrypt.compareSync(pin, check.pin_hash) : false;
console.log(`created: ${check.full_name} role=${check.role} active=${check.is_active}`);
console.log(`site ok: ${check.site_id === BOKSBURG_SITE} | org ok: ${check.org_id === PMI_ORG} | pinValidates: ${pinOk}`);
console.log(`\nEmployee #: ${pin}   PIN: ${pin}`);
