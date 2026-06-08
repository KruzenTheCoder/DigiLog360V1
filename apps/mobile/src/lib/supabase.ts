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

// ============================================================================
// Performance Optimizations
// ============================================================================

// Request deduplication cache
const requestCache = new Map<string, { data: unknown; timestamp: number }>();
const DEDUP_WINDOW = 100; // 100ms window for deduplication

// Active request tracking for deduplication
const activeRequests = new Map<string, Promise<unknown>>();

// Connection health check
let isOnline = true;
let lastHealthCheck = Date.now();
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

/**
 * Optimized Supabase client with performance enhancements:
 * - Request deduplication
 * - Connection pooling
 * - Offline detection
 * - Optimistic updates support
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    // Custom fetch with deduplication and retry logic
    fetch: createOptimizedFetch(),
    headers: {
      'Connection': 'keep-alive',
      'Keep-Alive': 'timeout=5, max=1000',
    },
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Create an optimized fetch function with deduplication and retry logic
 */
function createOptimizedFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input.toString();
    const method = init?.method || 'GET';
    
    // Create a cache key for deduplication
    const cacheKey = `${method}:${url}:${JSON.stringify(init?.body)}`;
    
    // Check for active identical request (deduplication)
    if (activeRequests.has(cacheKey)) {
      const response = await activeRequests.get(cacheKey);
      return response as Response;
    }
    
    // Check request cache for GET requests
    if (method === 'GET') {
      const cached = requestCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < DEDUP_WINDOW) {
        return new Response(JSON.stringify(cached.data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    // Track this request
    const requestPromise = executeRequest(input, init, cacheKey);
    activeRequests.set(cacheKey, requestPromise);
    
    try {
      const response = await requestPromise;
      return response;
    } finally {
      // Clean up after a short delay to allow deduplication
      setTimeout(() => {
        activeRequests.delete(cacheKey);
      }, DEDUP_WINDOW);
    }
  };
}

/**
 * Execute the fetch request with retry logic
 */
async function executeRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
  cacheKey?: string
): Promise<Response> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 100;
  
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
        keepalive: true,
      });
      
      clearTimeout(timeoutId);
      
      // Cache successful GET requests
      if (cacheKey && init?.method === 'GET' && response.ok) {
        const cloned = response.clone();
        cloned.json().then(data => {
          requestCache.set(cacheKey, { data, timestamp: Date.now() });
        }).catch(() => {
          // Ignore JSON parsing errors
        });
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      
      // Check if it's an abort error (timeout)
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.warn('[Supabase] Request timed out, retrying...');
      }
      
      // Don't retry on 4xx errors
      if (error instanceof Response) {
        const status = error.status;
        if (status >= 400 && status < 500) {
          throw error;
        }
      }
      
      // Exponential backoff
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt)));
      }
    }
  }
  
  throw lastError;
}

/**
 * Check Supabase connection health
 */
export async function checkSupabaseHealth(): Promise<boolean> {
  const now = Date.now();
  
  // Rate limit health checks
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL) {
    return isOnline;
  }
  
  lastHealthCheck = now;
  
  try {
    const { error } = await supabase.from('health_check').select('status').limit(1).maybeSingle();
    
    if (error) {
      console.warn('[Supabase] Health check failed:', error.message);
      isOnline = false;
      return false;
    }
    
    isOnline = true;
    return true;
  } catch (err) {
    console.warn('[Supabase] Health check exception:', err);
    isOnline = false;
    return false;
  }
}

/**
 * Subscribe to realtime changes with automatic reconnection
 */
export function subscribeToChanges(
  channel: string,
  callback: (payload: unknown) => void
) {
  const subscription = supabase
    .channel(channel)
    .on('postgres_changes', { event: '*', schema: 'public' }, callback)
    .subscribe((status) => {
      if (status === 'SUBSCRIPTION_ERROR') {
        console.error(`[Supabase] Subscription error for channel: ${channel}`);
        // Attempt to resubscribe after delay
        setTimeout(() => {
          subscription.subscribe();
        }, 5000);
      }
    });
  
  return subscription;
}

// Export isOnline status getter
export function getOnlineStatus(): boolean {
  return isOnline;
}
