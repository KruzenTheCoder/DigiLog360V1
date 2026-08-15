'use client';

import type { ReactNode } from 'react';
import { useReveal } from '@/lib/animation/use-reveal';
import { DURATION, EASE } from '@/config/motion';

/**
 * Fades its children in the first time they scroll into view.
 *
 * Fails safe: the hidden state is only applied once the component has mounted
 * and we know an observer is available to reveal it again. Server-rendered
 * output, no-JS visitors and reduced-motion visitors therefore see the content
 * immediately rather than an invisible page.
 *
 * The trigger now comes from the shared observer in `lib/animation/use-reveal`
 * rather than one `IntersectionObserver` per instance — a content page carries
 * dozens of these, and they all want the same callback.
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
  const { ref, shown, armed } = useReveal<HTMLDivElement>({ delay });
  const hidden = armed && !shown;

  return (
    <div
      ref={ref}
      style={{
        transitionProperty: 'opacity, transform',
        transitionDuration: `${DURATION.reveal}ms`,
        transitionTimingFunction: EASE.enter,
      }}
      className={`motion-reduce:transition-none ${
        hidden ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'
      } ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
