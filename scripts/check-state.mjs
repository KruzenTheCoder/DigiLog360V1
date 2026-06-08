#!/usr/bin/env node
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// 1. Check if category/subcategory columns exist by selecting them.
console.log('\n=== checking occurrences columns ===');
const { error: colErr } = await sb
  .from('occurrences')
  .select('id, category, subcategory')
  .limit(1);
if (colErr) {
  console.log(`  ✗ category/subcategory MISSING: ${colErr.message}`);
} else {
  console.log('  ✓ category + subcategory columns exist');
}

// 2. Check the most recent ob_number in the table.
console.log('\n=== latest ob_numbers ===');
const { data: recent } = await sb
  .from('occurrences')
  .select('id, ob_number, created_at')
  .order('id', { ascending: false })
  .limit(5);
for (const r of recent ?? []) {
  console.log(`  ${r.ob_number?.padEnd(10) ?? 'null'}  id=${r.id}  ${r.created_at}`);
}
console.log();
