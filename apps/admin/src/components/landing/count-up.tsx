'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Counts a number up once it scrolls into view. Renders the final value
 * immediately for reduced-motion visitors and when IntersectionObserver is
 * unavailable, so the figure is never missing.
 */
export function CountUp({
  to,
  suffix = '',
  prefix = '',
  duration = 1400,
  className,
}: {
  to: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      setValue(to);
      return;
    }
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || done.current) return;
        done.current = true;
        io.disconnect();

        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min((now - start) / duration, 1);
          // Ease-out cubic: fast then settling, which reads as deliberate.
          setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
          if (t < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {value}
      {suffix}
    </span>
  );
}
