import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@digilog/shared';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY ' +
    'in apps/mobile/.env (see .env.example), then restart Expo with `--clear`.',
  );
}

// ---------------------------------------------------------------------------
// Network resilience
//
// Patrol devices roam in and out of coverage, so a request can fail at the
// transport layer (DNS, TLS, dropped socket) before it ever reaches PostgREST.
// We wrap fetch to:
//   • apply a hard timeout so a stalled socket can't hang a screen forever, and
//   • retry ONLY transport-level failures (fetch rejected = no response). We
//     never retry on an HTTP status — a 4xx/5xx means the server answered, and
//     blindly re-POSTing could duplicate an occurrence or log entry.
//
// We deliberately do NOT deduplicate or cache responses here: a Response body
// is a one-shot stream, so handing the same Response to two callers makes the
// second read throw "body already read". Supabase-js + React Query handle
// caching/dedup correctly at a layer that owns the data, not the stream.
// ---------------------------------------------------------------------------
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const resilientFetch: typeof fetch = async (input, init) => {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    // Respect an upstream abort signal if the caller passed one.
    init?.signal?.addEventListener('abort', () => controller.abort());

    try {
      // A resolved fetch — including 4xx/5xx — is returned to supabase-js as-is.
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === MAX_RETRIES - 1;
      if (isLastAttempt) break;
      // Exponential backoff before retrying the transport failure.
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
};

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL-based session detection on native — there's no browser address bar.
    detectSessionInUrl: false,
  },
  global: {
    fetch: resilientFetch,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});
