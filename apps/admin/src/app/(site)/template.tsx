'use client';

import type { ReactNode } from 'react';

/**
 * A template (not a layout) re-mounts on every navigation, which is exactly
 * what a page transition needs — the animation replays each time instead of
 * running once and never again.
 *
 * The slide is short and travels left-to-right, so the eye follows the
 * content in rather than being asked to re-read a page that simply appeared.
 * Anyone who has asked for reduced motion gets the fade only; the keyframe
 * itself is neutralised in globals.css.
 */
export default function SiteTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
