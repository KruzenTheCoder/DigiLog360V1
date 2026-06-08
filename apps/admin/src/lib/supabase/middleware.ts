import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env';

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
  // Create response with optimized headers
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Create Supabase client with middleware-specific optimizations
  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
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

  // Refresh session if needed
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  // Handle authentication redirects
  const pathname = request.nextUrl.pathname;
  
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
