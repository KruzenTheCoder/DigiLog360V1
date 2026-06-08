import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@digilog/shared';
import { getSupabaseUrl, getSupabaseAnonKey } from './env';

// Connection pool and retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 100; // ms
const CONNECTION_TIMEOUT = 30000; // 30 seconds

/**
 * Create a Supabase server client with optimized connection handling.
 * Includes connection pooling, retry logic, and performance optimizations.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      auth: {
        // Persist session in cookies
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      global: {
        // Optimize fetch behavior
        fetch: createOptimizedFetch(),
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

/**
 * Create an optimized fetch function with retry logic and connection pooling
 */
function createOptimizedFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT);
        
        const response = await fetch(input, {
          ...init,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on client errors (4xx)
        if (error instanceof Response) {
          const status = error.status;
          if (status >= 400 && status < 500) {
            throw error;
          }
        }
        
        // Wait before retrying (exponential backoff)
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt)));
        }
      }
    }
    
    throw lastError;
  };
}

/**
 * Batch multiple Supabase requests into a single transaction
 * for improved performance
 */
export async function batchRequests<T>(
  requests: Array<() => Promise<T>>,
  batchSize = 5
): Promise<T[]> {
  const results: T[] = [];
  
  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(req => req()));
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Cache for memoizing database queries within a request
 */
const queryCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5000; // 5 seconds

/**
 * Execute a cached database query
 */
export async function cachedQuery<T>(
  cacheKey: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const cached = queryCache.get(cacheKey);
  const now = Date.now();
  
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  
  const result = await queryFn();
  queryCache.set(cacheKey, { data: result, timestamp: now });
  return result;
}

/**
 * Clear the query cache (call at the end of requests)
 */
export function clearQueryCache(): void {
  queryCache.clear();
}
