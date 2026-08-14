import type { ReactNode } from 'react';
import { SiteNav } from '@/components/landing/site-nav';

// Shell for the public marketing site. The nav persists across navigations;
// only the page body animates, which is what makes moving between pages feel
// like one site rather than a series of full reloads.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteNav />
      {children}
    </div>
  );
}
