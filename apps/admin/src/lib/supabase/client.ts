'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@digilog/shared';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env';

export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}
