// Periodically report the guard's position while they are signed in and
// (optionally) on an active patrol. Pure subscribe/unsubscribe — caller
// decides when to start/stop.
import * as Location from 'expo-location';
import { supabase } from './supabase';

interface StartOptions {
  guardId: string;
  guardName: string | null;
  siteId: string | null;
  intervalMs?: number;        // default 30s
  onlyWhileOnPatrol?: boolean;
}

let timer: ReturnType<typeof setInterval> | null = null;

export async function startLocationReporting(opts: StartOptions): Promise<() => void> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return () => {};

  const intervalMs = opts.intervalMs ?? 30_000;

  async function tick() {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('guard_positions').insert({
        guard_id: opts.guardId,
        guard_name: opts.guardName,
        site_id: opts.siteId,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy ?? null,
        heading: pos.coords.heading ?? null,
        speed_mps: pos.coords.speed ?? null,
        on_patrol: opts.onlyWhileOnPatrol ?? true,
      });
    } catch {
      /* swallow — network blip, will retry next tick */
    }
  }

  // Fire immediately, then on interval.
  await tick();
  timer = setInterval(tick, intervalMs);

  return () => {
    if (timer) { clearInterval(timer); timer = null; }
  };
}

export function stopLocationReporting() {
  if (timer) { clearInterval(timer); timer = null; }
}
