'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@digilog/shared';
import { getSupabaseUrl, getSupabaseAnonKey } from './env';

export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey());
}
