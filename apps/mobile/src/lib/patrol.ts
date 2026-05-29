import { supabase } from './supabase';
import type { Patrol, Checkpoint, ScanMethod, Profile } from '@digilog/shared';

export async function getActivePatrol(guardId: string): Promise<Patrol | null> {
  const { data } = await supabase.from('patrols').select('*')
    .eq('guard_id', guardId).eq('status', 'active').maybeSingle();
  return (data as Patrol) ?? null;
}

/** Start a patrol: creates the patrol "occurrence" + the patrol record. */
export async function startPatrol(profile: Profile, routeId: string | null): Promise<Patrol> {
  let checkpointsTotal = 0;
  if (routeId) {
    const { count } = await supabase.from('route_checkpoints')
      .select('id', { count: 'exact', head: true }).eq('route_id', routeId);
    checkpointsTotal = count ?? 0;
  }

  const { data: occ, error: occErr } = await supabase.from('occurrences').insert({
    occurrence_type: 'Patrol', severity: 'low',
    description: `Patrol started by ${profile.full_name ?? profile.email}.`,
    incident_at: new Date().toISOString(), site_id: profile.site_id,
    logged_by: profile.id, logged_by_name: profile.full_name ?? profile.email,
    status: 'on_patrol', is_patrol: true,
  }).select('id, ob_number').single();
  if (occErr) throw occErr;

  const { data: patrol, error: patErr } = await supabase.from('patrols').insert({
    guard_id: profile.id, guard_name: profile.full_name ?? profile.email ?? 'Guard',
    site_id: profile.site_id, route_id: routeId, occurrence_id: occ!.id, ob_number: occ!.ob_number,
    status: 'active', checkpoints_total: checkpointsTotal,
  }).select('*').single();
  if (patErr) throw patErr;
  return patrol as Patrol;
}

export async function endPatrol(patrol: Patrol): Promise<void> {
  await supabase.from('patrols').update({ ended_at: new Date().toISOString() }).eq('id', patrol.id);
  if (patrol.occurrence_id) {
    await supabase.from('occurrences').update({ status: 'resolved' }).eq('id', patrol.occurrence_id);
  }
}

export async function recordScan(opts: {
  patrolId: number;
  checkpoint: Checkpoint;
  guardId: string;
  method: ScanMethod;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  distance?: number | null;
  verified?: boolean;
}): Promise<void> {
  const { error } = await supabase.from('checkpoint_scans').insert({
    patrol_id: opts.patrolId,
    checkpoint_id: opts.checkpoint.id,
    guard_id: opts.guardId,
    method: opts.method,
    latitude: opts.latitude ?? null,
    longitude: opts.longitude ?? null,
    gps_accuracy_m: opts.accuracy ?? null,
    distance_m: opts.distance ?? null,
    is_verified: opts.verified ?? true,
  });
  if (error) throw error;
}

/** Checkpoints already scanned during this patrol (by checkpoint id). */
export async function scannedCheckpointIds(patrolId: number): Promise<Set<string>> {
  const { data } = await supabase.from('checkpoint_scans').select('checkpoint_id').eq('patrol_id', patrolId);
  return new Set((data ?? []).map((r) => r.checkpoint_id).filter(Boolean) as string[]);
}

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(x));
}
