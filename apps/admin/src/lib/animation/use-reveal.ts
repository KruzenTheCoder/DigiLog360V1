'use client';

import { useEffect, useRef, useState } from 'react';
import { VIEWPORT } from '@/config/motion';
import { useReducedMotion } from './use-reduced-motion';

/**
 * Scroll-triggered reveal, on a shared observer.
 *
 * ── The problem this solves ──────────────────────────────────────────────
 * Every `Reveal`, `BlockReveal` and `Mark` on the marketing site used to
 * construct its own `IntersectionObserver`. A content-heavy page carries
 * dozens of them, and each one is a separate object the browser has to
 * evaluate against the viewport on every scroll-driven recalculation. They all
 * want the same thing — "tell me when this crosses the fold" — so they can
 * share one observer per distinct configuration.
 *
 * The registry below keys observers on their options. In practice the site
 * uses two configurations (body content and headings), so a page that
 * previously allocated forty observers now allocates two.
 *
 * ── The fail-safe rule ───────────────────────────────────────────────────
 * The hidden state is only applied once JS has mounted AND we know an observer
 * exists to reveal it again. Server-rendered output, a no-JS visitor and a
 * reduced-motion visitor all see the content immediately. Nothing on this site
 * is ever hidden by default — a reveal that fails to fire must degrade to
 * visible text, never to a blank page.
 */

interface Options {
  /** Fraction of the element visible before firing. */
  threshold?: number;
  rootMargin?: string;
  /** Delay after intersection, in ms. */
  delay?: number;
  /**
   * Fire every time it enters, rather than once. Off by default — a reveal
   * that replays as you scroll back up reads as a glitch, not as polish.
   */
  repeat?: boolean;
}

// ---------------------------------------------------------------------------
// Shared observer registry
// ---------------------------------------------------------------------------

type Entry = {
  observer: IntersectionObserver;
  targets: Map<Element, (entry: IntersectionObserverEntry) => void>;
};

const registry = new Map<string, Entry>();

function keyFor(threshold: number, rootMargin: string) {
  return `${threshold}|${rootMargin}`;
}

function entryFor(threshold: number, rootMargin: string): Entry {
  const key = keyFor(threshold, rootMargin);
  const existing = registry.get(key);
  if (existing) return existing;

  const targets: Entry['targets'] = new Map();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) targets.get(e.target)?.(e);
    },
    { threshold, rootMargin },
  );

  const created: Entry = { observer, targets };
  registry.set(key, created);
  return created;
}

/**
 * Watch one element. Returns the unsubscribe.
 *
 * The observer is deliberately NOT torn down when its last target leaves.
 *
 * That was the first implementation and it was wrong. React unmounts a page's
 * components one at a time, and in development StrictMode deliberately runs
 * every effect mount → cleanup → mount. Between those steps the target count
 * repeatedly touches zero, so an observer that disposes itself on empty gets
 * destroyed and rebuilt once per component — the exact churn the shared
 * registry exists to remove. Measured on /platform: 44 constructions for 9
 * consumers across a single client navigation.
 *
 * An IntersectionObserver watching nothing costs effectively nothing, and
 * there are only ever a handful of distinct configurations, so the entry stays
 * cached for the life of the document and is reused by whatever mounts next.
 */
function observe(
  el: Element,
  threshold: number,
  rootMargin: string,
  onEntry: (entry: IntersectionObserverEntry) => void,
): () => void {
  const entry = entryFor(threshold, rootMargin);
  entry.targets.set(el, onEntry);
  entry.observer.observe(el);

  return () => {
    entry.targets.delete(el);
    entry.observer.unobserve(el);
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface RevealState<T extends HTMLElement = HTMLDivElement> {
  ref: React.RefObject<T | null>;
  /** True once the element has been seen (and any delay has elapsed). */
  shown: boolean;
  /**
   * True while we are responsible for hiding it — i.e. JS has mounted, an
   * observer is watching, and it has not fired yet. Components should apply
   * their hidden styles on this, never on `!shown`, so the pre-mount and
   * reduced-motion cases render visible.
   */
  armed: boolean;
}

export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options: Options = {},
): RevealState<T> {
  const {
    threshold = VIEWPORT.threshold,
    rootMargin = VIEWPORT.rootMargin,
    delay = 0,
    repeat = false,
  } = options;

  const ref = useRef<T>(null);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    // Reduced motion, or a browser without the API: show it and do nothing.
    if (reduced || typeof IntersectionObserver === 'undefined') {
      setArmed(false);
      setShown(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    // Only now do we take responsibility for hiding it.
    setArmed(true);

    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: (() => void) | undefined;

    stop = observe(el, threshold, rootMargin, (entry) => {
      if (entry.isIntersecting) {
        timer = setTimeout(() => setShown(true), delay);
        if (!repeat) stop?.();
      } else if (repeat) {
        clearTimeout(timer);
        setShown(false);
      }
    });

    return () => {
      clearTimeout(timer);
      stop?.();
    };
  }, [threshold, rootMargin, delay, repeat, reduced]);

  return { ref, shown, armed };
}
