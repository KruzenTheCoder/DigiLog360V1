'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A template (not a layout) re-mounts on every navigation, which is what a
 * page transition needs — it replays each time instead of running once.
 *
 * It used to be a 460ms rise-and-fade of the whole page. That was right when
 * the pages opened cold, and wrong the moment every route gained a
 * choreographed hero: the hero's first stages were playing INSIDE a wrapper
 * that was itself still travelling, so two entrances ran stacked and the
 * opening beat of every hero was muted by the fade over it. Now the template
 * is a fast opacity-only crossfade — just enough to stop the swap reading as
 * a flash — and the travel belongs to the heroes alone.
 *
 * The other job a route change has is one no animation does: telling a
 * screen reader the page changed. A client-side navigation swaps the DOM
 * silently, so focus is moved to the new page's <h1>. Focusing a heading
 * makes assistive tech announce it — which is exactly the announcement — and
 * puts the tab order at the top of the new content instead of wherever the
 * old page left it. Skipped on the initial load: the browser's own document
 * focus is correct there, and stealing it would be worse than doing nothing.
 */

// Module scope, so it survives template remounts but resets on a full load.
let hasNavigated = false;

export default function SiteTemplate({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasNavigated) {
      hasNavigated = true;
      return;
    }
    const h1 = ref.current?.querySelector('h1');
    if (h1 instanceof HTMLElement) {
      h1.tabIndex = -1;
      h1.focus({ preventScroll: true });
    }
  }, []);

  return <div ref={ref} className="animate-route-fade">{children}</div>;
}
