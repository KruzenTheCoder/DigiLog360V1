import type { ReactNode } from 'react';
import { SiteNav } from '@/components/landing/site-nav';

// Shell for the public marketing site. The nav persists across navigations;
// only the page body animates, which is what makes moving between pages feel
// like one site rather than a series of full reloads.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    // The sections paint themselves edge to edge, so this only shows through
    // where a page is shorter than the viewport.
    <div className="site-root min-h-screen bg-[hsl(var(--background))]">
      {/* First tab stop on every page. Invisible until focused, then a pill
          over the nav — a keyboard visitor should not have to walk seven nav
          links to reach the headline. */}
      <a href="#site-content" className="skip-link">
        Skip to content
      </a>
      <SiteNav />
      <div id="site-content">{children}</div>
    </div>
  );
}
