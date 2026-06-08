import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseUrl, getSupabaseAnonKey } from './env';

// ============================================================================
// Performance Optimizations
// ============================================================================

// Cache duration in seconds
const CACHE_DURATION = {
  static: 60 * 60 * 24 * 365, // 1 year for static assets
  api: 5, // 5 seconds for API responses
  page: 30, // 30 seconds for pages
};

// ============================================================================
// Middleware Function
// ============================================================================

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Resolve Supabase config up front. If it's missing/misconfigured we must NOT
  // let the middleware throw — an unhandled throw here surfaces as a site-wide
  // 500 (MIDDLEWARE_INVOCATION_FAILED). Instead we fail CLOSED: everything goes
  // to /login (which renders without a session) rather than exposing protected
  // routes or 500-ing the whole app.
  let supabaseUrl: string;
  let supabaseAnonKey: string;
  try {
    supabaseUrl = getSupabaseUrl();
    supabaseAnonKey = getSupabaseAnonKey();
  } catch (err) {
    console.error('[middleware] Supabase env not configured:', err);
    if (pathname === '/login') return NextResponse.next({ request });
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Create response with optimized headers
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Create Supabase client with middleware-specific optimizations
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
          });
          
          supabaseResponse = NextResponse.next({
            request,
          });
          
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh session if needed. getUser() makes a network call to the auth
  // server, which can reject on a transient error — never let that throw out
  // of the middleware and 500 the whole site. Treat any failure as "no user".
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] = null;
  let userError: unknown = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    userError = result.error;
  } catch (err) {
    console.error('[middleware] auth.getUser failed:', err);
    userError = err;
  }

  // Skip middleware for static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.gif') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.woff') ||
    pathname.endsWith('.woff2')
  ) {
    // Add cache headers for static assets
    const staticResponse = NextResponse.next();
    staticResponse.headers.set(
      'Cache-Control',
      `public, max-age=${CACHE_DURATION.static}, immutable`
    );
    return staticResponse;
  }

  // Handle login page
  if (pathname === '/login') {
    if (user && !userError) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return supabaseResponse;
  }

  // Protect all routes except public ones
  if (!user || userError) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}
