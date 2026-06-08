// Public health check endpoint for uptime monitoring.
//
// GET /functions/v1/health-check
// Returns 200 + { status: 'ok', ... } when the database is reachable.
// Returns 503 when any required check fails.
//
// Safe to call without authentication. Exposes only non-sensitive counts
// (number of organisations + active occurrences) so a probe can verify the
// stack end-to-end. NEVER add user data here.
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/auth.ts';

const STARTED_AT = new Date().toISOString();
const VERSION = '1.0.0';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const start = performance.now();
  const admin = serviceClient();

  try {
    const [{ count: orgs, error: orgsErr }, { count: liveOcc, error: occErr }] = await Promise.all([
      admin.from('organizations').select('*', { count: 'exact', head: true }),
      admin.from('occurrences').select('*', { count: 'exact', head: true })
        .not('status', 'in', '(resolved,closed)'),
    ]);

    if (orgsErr || occErr) {
      return json({
        status: 'degraded',
        version: VERSION,
        error: (orgsErr ?? occErr)?.message,
        checked_at: new Date().toISOString(),
      }, 503);
    }

    return json({
      status: 'ok',
      version: VERSION,
      started_at: STARTED_AT,
      checked_at: new Date().toISOString(),
      latency_ms: Math.round(performance.now() - start),
      organisations: orgs ?? 0,
      live_occurrences: liveOcc ?? 0,
    });
  } catch (e) {
    return json({
      status: 'down',
      version: VERSION,
      error: e instanceof Error ? e.message : 'unknown error',
      checked_at: new Date().toISOString(),
    }, 503);
  }
});
