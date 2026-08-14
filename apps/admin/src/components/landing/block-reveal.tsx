'use client';

// Editorial reveals for headings.
//
// Two moves, both scroll-triggered:
//
//   BlockReveal   a solid block sweeps across the words and leaves them
//                 behind it — grows from the left edge, then retreats off
//                 the right, with the text appearing under it halfway.
//
//   Mark          a filled block grows in behind one word, the way a marker
//                 pen would, so a heading has a single emphasised term.
//
// Both are one scaleX on the compositor: no width animation, no layout pass,
// no repaint. The keyframes live in globals.css so the reduced-motion rules
// sit next to every other animation rather than being scattered.
//
// Fails safe in the same way Reveal does: the text renders visible and is
// only held back once JS has armed the effect and an observer exists to
// release it. A no-JS visitor reads the heading normally.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

type Tone = 'brand' | 'dark' | 'light' | 'red' | 'green' | 'violet' | 'amber';

/** The wipe block is an element, so it can take a utility class. */
const BLOCK: Record<Tone, string> = {
  brand: 'bg-[hsl(var(--brand))]',
  dark: 'bg-slate-900',
  light: 'bg-white',
  red: 'bg-red-500',
  green: 'bg-emerald-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
};

/** The marker fill is a background image, so it needs a colour value. */
const FILL: Record<Tone, string> = {
  brand: 'hsl(var(--brand))',
  dark: '#0f172a',
  light: '#ffffff',
  red: '#ef4444',
  green: '#10b981',
  violet: '#8b5cf6',
  amber: '#f59e0b',
};

/** Shared scroll trigger: fires once, the first time the element is seen. */
function usePlayOnce(delay = 0) {
  const ref = useRef<HTMLSpanElement>(null);
  const [armed, setArmed] = useState(false);
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') { setRun(true); return; }
    const el = ref.current;
    if (!el) return;
    setArmed(true);

    let timer: ReturnType<typeof setTimeout>;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      io.disconnect();
      timer = setTimeout(() => setRun(true), delay);
    }, { threshold: 0.35, rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(timer); };
  }, [delay]);

  return { ref, armed, run };
}

export function BlockReveal({
  children, tone = 'brand', delay = 0, className,
}: {
  children: ReactNode;
  tone?: Tone;
  delay?: number;
  className?: string;
}) {
  const { ref, armed, run } = usePlayOnce(delay);

  return (
    <span
      ref={ref}
      className={`wipe ${armed && !run ? 'wipe-armed' : ''} ${run ? 'wipe-run' : ''} ${className ?? ''}`}
      style={run ? { animationDelay: `${delay}ms` } : undefined}
    >
      <span className="wipe-ink">{children}</span>
      <span aria-hidden className={`wipe-block ${BLOCK[tone]}`} />
    </span>
  );
}

/**
 * One emphasised word, with a filled block behind it.
 *
 * The text colour is the caller's job: a dark fill needs light text, and only
 * the caller knows which ground the heading sits on.
 */
export function Mark({
  children, tone = 'brand', className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const { ref, run } = usePlayOnce(0);

  return (
    <span
      ref={ref}
      className={`mark ${run ? 'mark-run' : ''} ${className ?? ''}`}
      // The fill is a background on the text itself so the phrase can wrap;
      // the colour travels as a custom property rather than a utility class.
      style={{ '--mark-fill': FILL[tone] } as CSSProperties}
    >
      <span className="mark-ink">{children}</span>
    </span>
  );
}
