// AsyncStorage-backed queue for occurrence logging when the device is offline.
// Items are flushed in order on reconnect or when the user re-opens the app.
// Photos are stored as base64 in the queue payload (small + survives reboot).
//
// Schema is intentionally minimal — one queue per device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { uploadOccurrenceImage, uploadVoiceNote } from './storage';

const KEY = 'digilog.offline_queue.v1';

export interface QueuedOccurrence {
  /** Local UUID — survives across retries. */
  id: string;
  queued_at: string;
  /** Insert payload for public.occurrences (NO org_id — server default fills it). */
  occurrence: {
    occurrence_type: string;
    category?: string;
    subcategory?: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    incident_at: string;
    site_id: string | null;
    site_name: string | null;
    logged_by: string;
    logged_by_name: string | null;
    status: 'open';
  };
  /** Base64 image payloads to attach after the row is created. */
  photos: { base64: string }[];
  /** Base64 audio payloads (voice notes) to attach after the row is created.
   *  Optional so queue items written by older builds still parse. */
  voiceNotes?: { base64: string; durationMs: number | null }[];
  /** Retry counter — we stop after this many to avoid infinite loops. */
  attempts: number;
  /** Most recent error message — populated on each failed retry, so the user
   *  can see exactly why the upload keeps failing. */
  last_error?: string;
}

const MAX_ATTEMPTS = 8;

async function readQueue(): Promise<QueuedOccurrence[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedOccurrence[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

/** Add an occurrence to the queue. Returns the queued item's local id. */
export async function enqueueOccurrence(
  payload: Omit<QueuedOccurrence, 'id' | 'queued_at' | 'attempts'>,
): Promise<string> {
  const items = await readQueue();
  const id =
    (globalThis.crypto && 'randomUUID' in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  items.push({ id, queued_at: new Date().toISOString(), attempts: 0, ...payload });
  await writeQueue(items);
  return id;
}

/** Number of items currently waiting. */
export async function pendingCount(): Promise<number> {
  const items = await readQueue();
  return items.length;
}

/** Wipe the queue. Used by the "Clear pending" affordance when items are
 *  permanently stuck (e.g. queued against a profile that no longer exists). */
export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/** Inspect the first item's most recent error, useful for diagnostics. */
export async function inspectQueue(): Promise<{
  count: number;
  oldest_queued_at: string | null;
  total_attempts: number;
  last_error: string | null;
}> {
  const items = await readQueue();
  return {
    count: items.length,
    oldest_queued_at: items[0]?.queued_at ?? null,
    total_attempts: items.reduce((s, i) => s + i.attempts, 0),
    last_error: items[0]?.last_error ?? null,
  };
}

/** Returns true if there's network connectivity right now. */
export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

/**
 * Try to flush the queue. Caller can check `pending` after to see what's left.
 * No-op when offline. Items that fail with a non-network error keep retrying
 * up to MAX_ATTEMPTS before being dropped (preventing infinite poison loops).
 */
export async function flushQueue(): Promise<{
  flushed: number; remaining: number; failed: number;
}> {
  if (!(await isOnline())) {
    const items = await readQueue();
    return { flushed: 0, remaining: items.length, failed: 0 };
  }

  let items = await readQueue();
  let flushed = 0;
  let failed = 0;
  const kept: QueuedOccurrence[] = [];

  for (const item of items) {
    try {
      const { data: occ, error } = await supabase
        .from('occurrences')
        .insert(item.occurrence)
        .select('id, ob_number')
        .single();
      if (error) throw error;

      for (const photo of item.photos) {
        try {
          const path = await uploadOccurrenceImage(photo.base64, occ!.ob_number ?? `OB${occ!.id}`);
          await supabase.from('occurrence_images').insert({
            occurrence_id: occ!.id,
            ob_number: occ!.ob_number,
            storage_path: path,
            captured_by: item.occurrence.logged_by,
            captured_by_name: item.occurrence.logged_by_name,
          });
        } catch {
          // a single failed photo doesn't fail the whole occurrence; we move on.
        }
      }

      for (const vn of item.voiceNotes ?? []) {
        try {
          const path = await uploadVoiceNote(vn.base64, occ!.ob_number ?? `OB${occ!.id}`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('occurrence_voice_notes').insert({
            occurrence_id: occ!.id,
            ob_number: occ!.ob_number,
            storage_path: path,
            duration_ms: vn.durationMs,
            recorded_by: item.occurrence.logged_by,
            recorded_by_name: item.occurrence.logged_by_name,
          });
        } catch {
          // a single failed voice note doesn't fail the whole occurrence.
        }
      }
      flushed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const next = { ...item, attempts: item.attempts + 1, last_error: msg };
      if (next.attempts >= MAX_ATTEMPTS) {
        failed += 1;
        console.warn('Dropping queued occurrence after max attempts', item.id, e);
      } else {
        kept.push(next);
      }
    }
  }

  await writeQueue(kept);
  items = kept;
  return { flushed, remaining: items.length, failed };
}

/**
 * Listen for connectivity changes and try to flush whenever we go back online.
 * Returns an unsubscribe function.
 */
export function startAutoFlush(onResult?: (r: { flushed: number; remaining: number }) => void) {
  const unsub = NetInfo.addEventListener(async (state) => {
    if (state.isConnected) {
      const r = await flushQueue();
      onResult?.(r);
    }
  });
  return unsub;
}
