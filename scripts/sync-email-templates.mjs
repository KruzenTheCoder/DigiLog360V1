// Sync the canonical email template module into the edge-function shared
// folder. Edge functions run on Deno and cannot import the npm workspace
// package, so `supabase/functions/_shared/email-templates.ts` is a generated
// copy of `packages/shared/src/emailAlerts.ts` with a different header.
//
//   node scripts/sync-email-templates.mjs          # write the copy
//   node scripts/sync-email-templates.mjs --check  # fail if out of sync (CI)
//
// Run this after ANY template change, then redeploy:
//   npx supabase functions deploy task-alerts

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'packages/shared/src/emailAlerts.ts');
const DEST = join(root, 'supabase/functions/_shared/email-templates.ts');

const GENERATED_HEADER = `// ============================================================================
// GENERATED FILE — DO NOT EDIT.
//
// Copy of packages/shared/src/emailAlerts.ts for Deno edge functions, which
// cannot import the npm workspace package. Edit the source module, then run:
//   node scripts/sync-email-templates.mjs
// ============================================================================
`;

/** Replace the source module's leading block comment with the generated one. */
function transform(source) {
  const firstExport = source.indexOf('\nexport ');
  if (firstExport === -1) throw new Error('No export found in the source module');
  return GENERATED_HEADER + source.slice(firstExport);
}

const expected = transform(readFileSync(SRC, 'utf8'));

if (process.argv.includes('--check')) {
  let actual = '';
  try { actual = readFileSync(DEST, 'utf8'); } catch { /* missing counts as stale */ }
  if (actual !== expected) {
    console.error('email-templates.ts is out of sync with emailAlerts.ts.');
    console.error('Run: node scripts/sync-email-templates.mjs');
    process.exit(1);
  }
  console.log('email templates in sync');
} else {
  writeFileSync(DEST, expected);
  console.log(`synced → ${DEST}`);
}
