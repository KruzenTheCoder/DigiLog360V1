import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@digilog/shared';
import { getSupabaseUrl, getSupabaseAnonKey } from './env';

/**
 * Create a Supabase server client bound to the request's cookies.
 *
 * We deliberately do NOT inject a custom `global.fetch`. The previous version
 * wrapped fetch in a retry/timeout loop whose retry branch was dead code (fetch
 * never throws a `Response`), and — more importantly — replacing fetch opts
 * every Supabase query OUT of Next.js's automatic per-render request
 * memoisation. Using the platform fetch lets identical queries within a single
 * render be deduplicated for free.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — middleware refreshes the session instead.
          }
        },
      },
    },
  );
}
