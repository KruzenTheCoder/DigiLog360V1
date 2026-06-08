#!/usr/bin/env node
/**
 * Quick test — verify Charlie Tango's pin_hash against PIN '2549' using
 * Node's bcryptjs. If this PASSES, the seed wrote a valid hash and the edge
 * function's bcrypt library is the problem (deno bcrypt $2a compatibility).
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data } = await sb
  .from('profiles')
  .select('full_name, employee_number, pin_hash')
  .eq('employee_number', '2549')
  .maybeSingle();

if (!data) { console.error('No row for employee_number=2549'); process.exit(1); }

console.log(`Testing ${data.full_name} (emp ${data.employee_number})`);
console.log(`Hash: ${data.pin_hash}`);
console.log(`Hash prefix: ${data.pin_hash.slice(0, 4)}`);

const ok = bcrypt.compareSync('2549', data.pin_hash);
console.log(`\nbcryptjs.compare('2549', hash) → ${ok ? '✓ MATCH' : '✗ NO MATCH'}`);

if (ok) {
  console.log('\nSeed wrote a correct hash. The edge function bcrypt lib must be the issue.');
}
