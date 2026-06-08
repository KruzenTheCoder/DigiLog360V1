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
    // These will be replaced at runtime with real values
    const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || 
                        process.env.CI || 
                        !process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    if (isBuildTime) {
      console.warn('[env.ts] Using placeholder Supabase values for build/SSG');
      _url = 'https://placeholder.supabase.co';
      _anonKey = 'placeholder-key-for-build-only';
    } else {
      throw new Error(
        'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/admin/.env.local (see .env.example).',
      );
    }
  } else {
    _url = url;
    _anonKey = anonKey;
  }
  
  _initialized = true;
}

// Export getters that lazily initialize
export function getSupabaseUrl(): string {
  initEnvVars();
  return _url!;
}

export function getSupabaseAnonKey(): string {
  initEnvVars();
  return _anonKey!;
}

// For backward compatibility - these will work but lazy-load
export const SUPABASE_URL: string = new Proxy('' as string, {
  get(target, prop) {
    if (prop === 'toString' || prop === 'valueOf') {
      return () => getSupabaseUrl();
    }
    const url = getSupabaseUrl();
    return (url as any)[prop];
  },
}) as unknown as string;

export const SUPABASE_ANON_KEY: string = new Proxy('' as string, {
  get(target, prop) {
    if (prop === 'toString' || prop === 'valueOf') {
      return () => getSupabaseAnonKey();
    }
    const key = getSupabaseAnonKey();
    return (key as any)[prop];
  },
}) as unknown as string;
