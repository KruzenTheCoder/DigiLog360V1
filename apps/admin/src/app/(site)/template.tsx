'use client';

import type { ReactNode } from 'react';

/**
 * A template (not a layout) re-mounts on every navigation, which is exactly
 * what a page transition needs — the animation replays each time instead of
 * running once and never again.
 *
 * The page now arrives as a card rather than as a slab: it rises slightly,
 * un-tilts and settles, which reads as the deck dealing the next page out.
 * The cards further down the page have their own scroll-triggered entrances,
 * so this only has to handle what is already on screen.
 *
 * Anyone who has asked for reduced motion gets the content with none of the
 * travel; the keyframe is neutralised in globals.css.
 */
export default function SiteTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-deck-in">{children}</div>;
}
