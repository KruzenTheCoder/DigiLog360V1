import type { MetadataRoute } from 'next';

/**
 * Crawl policy. Until this file existed, /robots.txt was a 307 to the sign-in
 * page — the middleware treated it like a protected route, and a crawler read
 * that as "no policy at all".
 *
 * The marketing pages are the product's shop window and are open. Everything
 * behind sign-in is disallowed: not as a security measure — the middleware is
 * the security — but so search results never fill with /login redirects and
 * half-indexed console URLs.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/login',
        '/menu',
        '/dashboard',
        '/occurrences',
        '/patrols',
        '/reports',
        '/tasks',
        '/users',
        '/sites',
        '/team',
        '/keys',
        '/visitors',
        '/shifts',
        '/manager/',
        '/super/',
        '/settings/',
        '/my-queue',
        '/notifications',
        '/print/',
        '/assistant',
      ],
    },
    sitemap: 'https://www.digilog360.co.za/sitemap.xml',
  };
}
