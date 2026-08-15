'use client';

import { useEffect, useState } from 'react';

/**
 * Whether this visitor has asked for reduced motion.
 *
 * Two things this gets right that the ad-hoc `matchMedia` calls scattered
 * through the landing components did not:
 *
 *   • It starts as `false`, not as the real value. The server cannot know the
 *     preference, so any other initial state guarantees a hydration mismatch.
 *     Components must therefore treat `false` as "not known yet" and stay in
 *     their visible, un-animated state until the effect has run — which is the
 *     same fail-safe rule the existing `Reveal` follows.
 *
 *   • It subscribes to changes. The preference is a system setting and can be
 *     toggled while the page is open; a one-shot read leaves the page animating
 *     at someone who has just asked it to stop.
 *
 * The query itself is module-level so every consumer shares one MediaQueryList
 * rather than allocating one each.
 */

const QUERY = '(prefers-reduced-motion: reduce)';

let shared: MediaQueryList | null = null;

function query(): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  shared ??= window.matchMedia(QUERY);
  return shared;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = query();
    if (!mq) return;

    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Whether this device has a real pointer that can hover.
 *
 * Pointer-driven effects — the hero tilt, magnetic buttons, cursor labels —
 * have nothing to respond to on a touch screen, and attaching them there costs
 * work for no result. Combined with the reduced-motion check, this is the gate
 * every such effect should sit behind.
 */
export function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    setFine(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setFine(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return fine;
}

/**
 * Convenience for the common gate: run the effect only for a visitor who has a
 * fine pointer and has not asked for reduced motion.
 */
export function usePointerMotion(): boolean {
  const reduced = useReducedMotion();
  const fine = useFinePointer();
  return fine && !reduced;
}
