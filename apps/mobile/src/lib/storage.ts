import { supabase } from './supabase';
import { STORAGE_BUCKET } from '@digilog/shared';

// Minimal base64 → Uint8Array (avoids extra deps; RN has global atob via polyfill on newer RN,
// but we implement directly to be safe).
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const e1 = B64.indexOf(clean[i]);
    const e2 = B64.indexOf(clean[i + 1]);
    const e3 = B64.indexOf(clean[i + 2]);
    const e4 = B64.indexOf(clean[i + 3]);
    const c1 = (e1 << 2) | (e2 >> 4);
    const c2 = ((e2 & 15) << 4) | (e3 >> 2);
    const c3 = ((e3 & 3) << 6) | e4;
    bytes[p++] = c1;
    if (e3 !== -1) bytes[p++] = c2;
    if (e4 !== -1) bytes[p++] = c3;
  }
  return bytes.subarray(0, p);
}

/** Upload a base64 image to the occurrence-images bucket; returns the storage path. */
export async function uploadOccurrenceImage(
  base64: string, obNumber: string, ext = 'jpg',
): Promise<string> {
  const path = `${obNumber}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const bytes = base64ToBytes(base64);
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, bytes, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: false });
  if (error) throw error;
  return path;
}
