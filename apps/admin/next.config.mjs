/** @type {import('next').NextConfig} */

// Build a per-request Content-Security-Policy. We allow the Supabase origin
// (from NEXT_PUBLIC_SUPABASE_URL) for API + websocket + storage, allow
// data: for inline QR/logo images, and forbid framing entirely.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseHost = supabaseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

const csp = [
  `default-src 'self'`,
  // Next.js needs 'unsafe-inline' for its bootstrap script and 'unsafe-eval'
  // in dev (turbopack/webpack). In production builds, prefer to drop them.
  `script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === 'production' ? '' : "'unsafe-eval'"}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' data: https://fonts.gstatic.com`,
  // Images: Supabase Storage signed URLs, inline QR/logos, OSM tiles, and
  // Leaflet's marker assets (unpkg) for the Guard Map.
  `img-src 'self' data: blob: https://${supabaseHost} https://*.supabase.co https://*.tile.openstreetmap.org https://unpkg.com`,
  // XHR + websocket to Supabase.
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://*.supabase.co wss://*.supabase.co`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@digilog/shared'],
  
  // ===== BUNDLE OPTIMIZATION =====
  // Enable production optimizations
  productionBrowserSourceMaps: false,
  
  // Compress output
  compress: true,
  
  // ===== IMAGE OPTIMIZATION =====
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
    // Modern image formats — Next will auto-negotiate AVIF/WebP per client.
    formats: ['image/avif', 'image/webp'],
    // Long-term cache the optimised images; we use signed URLs that already
    // expire, so the underlying source is naturally fingerprinted.
    minimumCacheTTL: 60 * 60 * 24,
    // Optimize device sizes for responsive images
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  
  poweredByHeader: false,
  
  // ===== EXPERIMENTAL OPTIMIZATIONS =====
  experimental: {
    // Tree-shake icon/utility libraries automatically — barrel files in these
    // packages otherwise pull the whole library into the bundle.
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      '@digilog/shared',
      'recharts',
      '@supabase/supabase-js',
      '@supabase/ssr',
    ],
    // Optimize memory usage
    serverMinification: true,
    // Hoist/dedupe React work in server components for faster SSR.
    optimizeServerReact: true,
    // Client Router Cache lifetimes. This is the single biggest app-wide
    // "instant" lever: a visited/prefetched route stays in the browser's
    // router cache for this long, so navigating BACK to any page (or to a
    // prefetched one) renders instantly with ZERO server round-trip — which
    // matters a lot for SA users hitting a US backend. Mutations call
    // router.refresh() to bust the cache, and realtime pages self-update, so
    // 2 minutes of revisit-freshness is a safe trade for the speed.
    staleTimes: {
      dynamic: 120,
      static: 300,
    },
  },

  // Fix Vercel file tracing issues (moved out of `experimental` in Next 15)
  outputFileTracingExcludes: {
    '*': [
      'node_modules/@swc/core-linux-x64-gnu',
      'node_modules/@swc/core-linux-x64-musl',
      'node_modules/@swc/core-darwin-x64',
      'node_modules/@swc/core-win32-x64-msvc',
    ],
  },
  
  // ===== TURBOPACK CONFIGURATION =====
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
  
  // ===== COMPILER OPTIMIZATIONS =====
  compiler: {
    // Strip console.log in production (keep console.warn/error)
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['warn', 'error'] } : false,
    // Remove React properties in production (smaller bundle)
    reactRemoveProperties: process.env.NODE_ENV === 'production',
  },
  
  // ===== CUSTOM WEBPACK CONFIG FOR ADVANCED OPTIMIZATIONS =====
  webpack: (config, { dev, isServer }) => {
    // Optimize bundle splitting
    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            // Vendor chunk for node_modules
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
              priority: 10,
            },
            // Recharts chunk
            recharts: {
              test: /[\\/]node_modules[\\/]recharts/,
              name: 'recharts',
              chunks: 'all',
              priority: 20,
            },
            // Leaflet chunk
            leaflet: {
              test: /[\\/]node_modules[\\/]leaflet/,
              name: 'leaflet',
              chunks: 'all',
              priority: 20,
            },
            // Supabase chunk
            supabase: {
              test: /[\\/]node_modules[\\/]@supabase/,
              name: 'supabase',
              chunks: 'all',
              priority: 15,
            },
          },
        },
        runtimeChunk: { name: 'runtime' },
      };
    }

    // Enable persistent caching for faster rebuilds
    if (dev) {
      config.cache = {
        type: 'filesystem',
      };
    }

    return config;
  },
  
  // ===== SECURITY HEADERS =====
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // CSP — the big one.
          { key: 'Content-Security-Policy', value: csp },
          // Forbid framing entirely (clickjacking).
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // HSTS — only honoured over HTTPS. 2 years, include subdomains.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          // No browser features the console doesn't need.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          // Cache control for static assets
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Dynamic pages should not be cached
      {
        source: '/(dashboard|occurrences|patrols|reports)/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
