'use client';

// A figure that counts up to itself once, on arrival.
//
// Driven by requestAnimationFrame against a real timestamp rather than by an
// interval. An interval assumes every tick lands on schedule; when the main
// thread is busy — which on this page it is, while a dozen other things are
// animating in — the ticks bunch up and the count stutters or overruns. Timing
// against the clock means a dropped frame costs a frame, not the count.
//
// The value is rendered server-side at its final figure, so the number is
// correct before any JS runs and correct for anyone who never gets it. The
// count-down to the start only happens once we know we can animate back up.

import { useEffect, useRef, useState } from 'react';

export function CountUp({
  value,
  duration = 1400,
  delay = 0,
  className,
}: {
  /** The literal to show, e.g. "<60s", "3", "0". Digits animate; the rest does not. */
  value: string;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const frame = useRef<number>(0);

  useEffect(() => {
    const digits = value.match(/\d+/);
    // Nothing to count, or counting to zero — which is not a count, it is a
    // number sitting still pretending to be one.
    if (!digits || Number(digits[0]) === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const target = Number(digits[0]);
    const prefix = value.slice(0, digits.index ?? 0);
    const suffix = value.slice((digits.index ?? 0) + digits[0].length);
    const pad = digits[0].length;

    // Deliberately NOT resetting the display to zero here. requestAnimationFrame
    // is paused in a background tab, so zeroing up front would leave the figure
    // reading "00s" until the tab is focused. The first frame writes the start
    // value instead, which means a count that never runs never shows.
    let start = 0;
    const timer = setTimeout(() => {
      const step = (now: number) => {
        if (!start) start = now;
        const t = Math.min(1, (now - start) / duration);
        // Ease-out cubic: fast at first, settling into the final figure, which
        // reads as a counter arriving rather than a linear ramp.
        const eased = 1 - (1 - t) ** 3;
        const n = Math.round(eased * target);
        setDisplay(`${prefix}${String(n).padStart(pad, '0')}${suffix}`);
        if (t < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    }, delay);

    return () => { clearTimeout(timer); cancelAnimationFrame(frame.current); };
  }, [value, duration, delay]);

  // tabular-nums so the figure does not jiggle as digits change width.
  return <span className={`tabular-nums ${className ?? ''}`}>{display}</span>;
}
