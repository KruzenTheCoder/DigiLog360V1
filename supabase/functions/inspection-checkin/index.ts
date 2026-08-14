// Site-inspection check-in and completion.
//
// This runs server-side for one reason: evidence. If the browser wrote its own
// check_in_at and distance straight to the table, both would be whatever the
// device chose to claim. Here the timestamp is the SERVER's clock and the
// distance is computed in Postgres from the site's recorded coordinates, so
// "they were at the site at this time" means something.
//
// POST { visit_id, action: "check_in", latitude, longitude, accuracy_m? }
// POST { visit_id, action: "complete", checklist?, findings?, outcome? }
//
// An out-of-range fix is RECORDED, not rejected — a guard standing at the far
// gate of a large property is a fact worth keeping, and silently refusing it
// would just teach people to fake their location.
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient, requireUser } from '../_shared/auth.ts';

// deno-lint-ignore no-explicit-any
type Sb = any;

const isManagerish = (role?: string) =>
  role === 'manager' || role === 'admin' || role === 'super_user' || role === 'supervisor';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin: Sb = serviceClient();
  const result = await requireUser(req, admin);
  if (result.error) return json({ error: result.error }, 401);
  const { profile: caller } = result;
  if (!caller) return json({ error: 'No profile for caller' }, 403);
  const callerId = (caller as { id: string }).id;
  const callerRole = (caller as { role?: string }).role;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const visitId = String(body.visit_id ?? '');
  if (!visitId) return json({ error: 'visit_id is required' }, 400);
  const action = String(body.action ?? 'check_in');

  const { data: visit, error: vErr } = await admin
    .from('inspection_visits')
    // check_in_at is load-bearing: it guards against a second check-in
    // overwriting the first, and it is the precondition for filing the report.
    // Omitting it silently disabled both.
    .select('id, org_id, site_id, assigned_to, status, due_at, window_end, checklist, check_in_at, completed_at')
    .eq('id', visitId)
    .maybeSingle();
  if (vErr) return json({ error: vErr.message }, 500);
  if (!visit) return json({ error: 'Inspection not found' }, 404);

  // The person the job belongs to, or someone who supervises them.
  const mine = visit.assigned_to === callerId;
  if (!mine && !isManagerish(callerRole)) {
    return json({ error: 'This inspection is assigned to someone else' }, 403);
  }
  if (visit.status === 'cancelled') return json({ error: 'This inspection was cancelled' }, 409);

  // ── Check in ─────────────────────────────────────────────────────────────
  if (action === 'check_in') {
    if (visit.status === 'completed') return json({ error: 'This inspection is already complete' }, 409);
    if (visit.check_in_at) return json({ error: 'Already checked in' }, 409);

    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json({ error: 'A location fix is required to check in' }, 400);
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return json({ error: 'That location is not a valid coordinate' }, 400);
    }
    const accuracy = Number.isFinite(Number(body.accuracy_m)) ? Number(body.accuracy_m) : null;

    const { data: site } = await admin
      .from('sites')
      .select('id, name, latitude, longitude, geofence_radius_m')
      .eq('id', visit.site_id)
      .maybeSingle();

    let distance: number | null = null;
    let within: boolean | null = null;
    if (site?.latitude != null && site?.longitude != null) {
      const { data: d } = await admin.rpc('geo_distance_m', {
        lat1: lat, lng1: lng, lat2: site.latitude, lng2: site.longitude,
      });
      distance = d == null ? null : Number(d);
      if (distance != null) within = distance <= Number(site.geofence_radius_m ?? 250);
    }
    // No coordinates on the site means we can't judge the fix. Record it and
    // say so, rather than implying a validation that never happened.

    const now = new Date().toISOString();
    const { error: uErr } = await admin
      .from('inspection_visits')
      .update({
        status: 'checked_in',
        check_in_at: now,
        check_in_lat: lat,
        check_in_lng: lng,
        check_in_accuracy_m: accuracy,
        check_in_distance_m: distance,
        check_in_within_geofence: within,
        updated_at: now,
      })
      .eq('id', visitId);
    if (uErr) return json({ error: uErr.message }, 500);

    return json({
      ok: true,
      checked_in_at: now,
      distance_m: distance,
      within_geofence: within,
      site_has_coordinates: site?.latitude != null && site?.longitude != null,
      late: new Date(now) > new Date(visit.window_end),
    });
  }

  // ── Complete ─────────────────────────────────────────────────────────────
  if (action === 'complete') {
    if (visit.status === 'completed') return json({ error: 'Already completed' }, 409);
    if (!visit.check_in_at) {
      return json({ error: 'Check in at the site before completing the report' }, 409);
    }
    const outcome = body.outcome == null ? null : String(body.outcome);
    if (outcome && !['pass', 'issues', 'fail'].includes(outcome)) {
      return json({ error: 'outcome must be pass, issues or fail' }, 400);
    }

    const now = new Date().toISOString();
    const { error: uErr } = await admin
      .from('inspection_visits')
      .update({
        status: 'completed',
        completed_at: now,
        checklist: Array.isArray(body.checklist) ? body.checklist : visit.checklist,
        findings: body.findings == null ? null : String(body.findings),
        outcome,
        updated_at: now,
      })
      .eq('id', visitId);
    if (uErr) return json({ error: uErr.message }, 500);

    return json({ ok: true, completed_at: now });
  }

  return json({ error: `Unknown action "${action}"` }, 400);
});
