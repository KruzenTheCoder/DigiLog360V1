import type { MetadataRoute } from 'next';

/**
 * The six public pages, in the order the site tells its story.
 *
 * Only the marketing routes belong here — a sitemap is an invitation to
 * index, and everything else on this host is behind sign-in. lastModified is
 * deliberately omitted: we do not track per-page content dates, and a
 * fabricated timestamp that updates on every deploy teaches crawlers to
 * ignore the field.
 */
const BASE = 'https://www.digilog360.co.za';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, priority: 1 },
    { url: `${BASE}/why`, priority: 0.9 },
    { url: `${BASE}/platform`, priority: 0.9 },
    { url: `${BASE}/story`, priority: 0.8 },
    { url: `${BASE}/console`, priority: 0.8 },
    { url: `${BASE}/answers`, priority: 0.7 },
  ];
}
