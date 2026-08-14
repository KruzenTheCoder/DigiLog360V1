import type { ReactNode } from 'react';
import { SiteNav } from '@/components/landing/site-nav';

// Shell for the public marketing site. The nav persists across navigations;
// only the page body animates, which is what makes moving between pages feel
// like one site rather than a series of full reloads.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    // A recessed ground so the panels above it read as raised. The two surface
    // tokens are only two points of lightness apart, which is not enough to
    // separate three layers, so the ground goes a step deeper than either.
    <div className="min-h-screen bg-slate-200/70 dark:bg-slate-950">
      <SiteNav />
      {children}
    </div>
  );
}
