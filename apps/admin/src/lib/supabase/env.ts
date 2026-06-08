// Validates the Supabase environment lazily to support SSG/ISR builds.
// Values are resolved when first accessed, not at module load time.

function getEnvVars() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // During build/SSG, return dummy values to allow static generation
    if (process.env.NEXT_PHASE === 'phase-production-build' || typeof window === 'undefined') {
      return {
        url: 'https://placeholder.supabase.co',
        anonKey: 'placeholder-key',
      };
    }
    
    throw new Error(
      'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/admin/.env.local (see .env.example).',
    );
  }

  return { url, anonKey };
}

// Lazy getters that resolve on first access
let _url: string | undefined;
let _anonKey: string | undefined;

export const SUPABASE_URL: string = new Proxy({} as string, {
  get() {
    if (!_url) {
      _url = getEnvVars().url;
    }
    return _url;
  },
}) as unknown as string;

export const SUPABASE_ANON_KEY: string = new Proxy({} as string, {
  get() {
    if (!_anonKey) {
      _anonKey = getEnvVars().anonKey;
    }
    return _anonKey;
  },
}) as unknown as string;
