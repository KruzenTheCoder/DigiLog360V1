'use client';

// A 3-D stage for the hero board.
//
// The board is the one thing on the page that should feel like an object
// rather than a picture: it enters from an angle, settles, drifts, and leans
// toward the pointer as you move across the hero. Its rows sit at different
// depths, so leaning separates them the way real layers would.
//
// Three rules keep it safe:
//
//   • The rotation is small and lives inside the hero's own overflow-hidden,
//     so a 3-D projection can never widen the page. Full-width 3-D is exactly
//     what put a horizontal scrollbar on the page transition.
//   • The pointer writes to custom properties, not to React state. This fires
//     every frame and a re-render per frame would be indefensible.
//   • Touch devices and reduced-motion get the board flat and still. There is
//     no pointer to lean toward, and the entrance is decoration.

import {
  useCallback, useEffect, useRef, useState, type ReactNode,
} from 'react';

export function TiltStage({
  children, className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    setLive(
      window.matchMedia('(hover: hover) and (pointer: fine)').matches
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
  }, []);

  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = stage.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // −1..1 across the stage, so the lean follows the pointer rather than
    // jumping when it crosses the centre.
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    // Deliberately shallow. Past about eight degrees the text on the board
    // starts to shear and it reads as a gimmick rather than as depth.
    el.style.setProperty('--ry', `${px * 9}deg`);
    el.style.setProperty('--rx', `${-py * 7}deg`);
  }, []);

  const onLeave = useCallback(() => {
    const el = stage.current;
    if (!el) return;
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--rx', '0deg');
  }, []);

  return (
    <div
      ref={stage}
      onPointerMove={live ? onMove : undefined}
      onPointerLeave={live ? onLeave : undefined}
      className={`hero-stage ${className ?? ''}`}
    >
      <div className="hero-enter">
        <div className="hero-tilt">{children}</div>
      </div>
    </div>
  );
}

/**
 * Lifts a slice of the board toward the viewer.
 *
 * Depth is only visible while the board is leaning, which is the point: at
 * rest it is a flat panel, and it gains dimension exactly when you interact
 * with it.
 */
export function Depth({
  z = 20, children, className,
}: {
  z?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className} style={{ transform: `translateZ(${z}px)` }}>
      {children}
    </div>
  );
}
