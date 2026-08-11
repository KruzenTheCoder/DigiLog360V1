'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Fades its children in the first time they scroll into view. Falls back to
 * "always visible" when IntersectionObserver is missing or the visitor has
 * asked for reduced motion, so content is never hidden behind an effect.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          const t = setTimeout(() => setShown(true), delay);
          io.disconnect();
          return () => clearTimeout(t);
        }
      },
      { threshold: 0.2, rootMargin: '0px 0px -6% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 motion-reduce:transition-none ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      } ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
