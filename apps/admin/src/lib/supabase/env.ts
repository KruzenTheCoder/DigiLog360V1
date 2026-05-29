// Validates the Supabase environment once, with a clear error if misconfigured.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and ' +
    'NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/admin/.env.local (see .env.example).',
  );
}

export const SUPABASE_URL: string = url;
export const SUPABASE_ANON_KEY: string = anonKey;
