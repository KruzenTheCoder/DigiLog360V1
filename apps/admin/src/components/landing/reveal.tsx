'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Fades its children in the first time they scroll into view.
 *
 * Fails safe: the hidden state is only applied once the component has mounted
 * and we know an observer is available to reveal it again. Server-rendered
 * output, no-JS visitors and reduced-motion visitors therefore see the content
 * immediately rather than an invisible page.
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
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    // Only now do we take responsibility for hiding it.
    setArmed(true);

    let timer: ReturnType<typeof setTimeout>;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        timer = setTimeout(() => setShown(true), delay);
      },
      { threshold: 0.15, rootMargin: '0px 0px -5% 0px' },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, [delay]);

  const hidden = armed && !shown;

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${
        hidden ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'
      } ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
