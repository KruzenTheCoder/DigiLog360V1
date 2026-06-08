// Validates the Supabase environment once, with a clear error if misconfigured.
// Uses lazy evaluation to support static site generation (SSG) builds.

let _url: string | null = null;
let _anonKey: string | null = null;
let _initialized = false;

function initEnvVars() {
  if (_initialized) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // During static build (SSG), allow placeholder values
    const isBuildTime =
      process.env.NEXT_PHASE === 'phase-production-build' ||
      process.env.CI;

    if (isBuildTime) {
      console.warn('[env.ts] Using placeholder Supabase values for build/SSG');
      _url = 'https://placeholder.supabase.co';
      _anonKey = 'placeholder-key-for-build-only';
    } else {
      throw new Error(
        'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and ' +
          'NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/admin/.env.local (see .env.example).'
      );
    }
  } else {
    _url = url;
    _anonKey = anonKey;
  }

  _initialized = true;
}

// Lazy getters that initialize on first call
export function getSupabaseUrl(): string {
  initEnvVars();
  return _url!;
}

export function getSupabaseAnonKey(): string {
  initEnvVars();
  return _anonKey!;
}

// For backward compatibility - these are now getter functions
export const SUPABASE_URL: string = 'https://placeholder.supabase.co';
export const SUPABASE_ANON_KEY: string = 'placeholder-key';

// Re-export the getter functions as the recommended approach
export { getSupabaseUrl as SUPABASE_URL_LAZY, getSupabaseAnonKey as SUPABASE_ANON_KEY_LAZY };
