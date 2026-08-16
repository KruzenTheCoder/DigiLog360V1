import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseUrl, getSupabaseAnonKey } from './env';

// ============================================================================
// Performance Optimizations
// ============================================================================

// Routes anyone may view without signing in.
const PUBLIC_PATHS = new Set([
  '/', '/reset-password',
  // The marketing site — several short pages instead of one long scroll.
  '/why', '/platform', '/story', '/console', '/answers',
]);

/**
 * Machine-facing files that must never bounce to /login.
 *
 * Before this, a crawler requesting /robots.txt or /sitemap.xml got a 307 to
 * the sign-in page — the middleware treated them like any other protected
 * route. A search engine reads that as "this site has no robots policy and no
 * sitemap", and a link-preview bot reads the OG image URL the same way, so
 * shares rendered without a card.
 */
function isMachinePath(pathname: string): boolean {
  return (
    pathname === '/robots.txt'
    || pathname === '/sitemap.xml'
    || pathname === '/manifest.webmanifest'
    // The generated social cards (opengraph-image / twitter-image routes).
    || pathname.includes('/opengraph-image')
    || pathname.includes('/twitter-image')
  );
}

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

  // Crawlers and preview bots first — no session, no auth round-trip.
  if (isMachinePath(pathname)) return NextResponse.next({ request });

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

  // getUser() does TWO things we need:
  //   1. Validates the JWT signature with the auth server.
  //   2. Auto-refreshes the access token if it's about to expire, writing
  //      the refreshed tokens back to the cookie store via setAll.
  //
  // We previously switched to getSession() to skip the network round-trip,
  // but that meant expired access tokens kept flowing through — middleware
  // saw "session exists", let the request through, and then PostgREST
  // rejected the JWT (RLS sees auth.uid() = null and returns 0 rows).
  // Symptom: empty task lists, missing data, "logged in but app blank".
  //
  // Wrapped in try/catch so a transient auth-server hiccup is non-fatal:
  // treat any failure as "no user" and bounce to /login.
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

  // Handle login page.
  //
  // Redirect to /menu only when the visit is "clean" — no query params at
  // all. Any params (especially `?error=` or `?next=`) mean the user was
  // bounced here on purpose (profile gate failed, deactivated, no web role,
  // etc.) — auto-redirecting them back into the app would just bounce them
  // straight back to /login and produce ERR_TOO_MANY_REDIRECTS.
  if (pathname === '/login') {
    const hasParams = request.nextUrl.searchParams.size > 0;
    if (user && !userError && !hasParams) {
      return NextResponse.redirect(new URL('/menu', request.url));
    }
    return supabaseResponse;
  }

  // Public pages — viewable without a session. The landing page at `/` is the
  // product's front door: anyone can read what the platform does. Signed-in
  // visitors are sent on to /menu by the page itself, not here.
  if (PUBLIC_PATHS.has(pathname)) {
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
