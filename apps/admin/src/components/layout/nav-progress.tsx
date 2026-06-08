'use client';

/**
 * Tiny top-of-screen progress bar that fires whenever the App Router
 * navigates. Next.js 15 doesn't expose router events, so we watch the
 * pathname + searchParams: when they change, we run a CSS-driven
 * "ease toward done" animation that lands at 100% before fading.
 *
 * It's not a real network indicator — it's a perception lever. Users
 * see SOMETHING happen the instant they click, so the page transition
 * feels snappy even if the server-component render takes 400ms.
 */
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const FADE_MS = 220;

export function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const firstRender = useRef(true);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const easeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset any in-flight animation timers.
  function clearTimers() {
    if (fadeTimer.current) { clearTimeout(fadeTimer.current); fadeTimer.current = null; }
    if (easeTimer.current) { clearTimeout(easeTimer.current); easeTimer.current = null; }
  }

  useEffect(() => {
    // Don't show on the very first paint of the app — only on subsequent
    // navigations. Otherwise every cold load flashes a bar.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    clearTimers();
    setVisible(true);
    setProgress(8);

    // Ease toward 80% over ~600ms — fast enough to feel responsive,
    // never reaching 100% because we want the SERVER render to be what
    // actually completes the bar.
    const ease = (target: number, ms: number) => {
      easeTimer.current = setTimeout(() => setProgress(target), ms);
    };
    ease(35, 120);
    ease(60, 320);
    ease(78, 580);

    // The new pathname/searchParams effect run is itself the "navigation
    // complete" signal — by the time this effect cleanup runs, the new
    // page is rendered. Snap to 100, fade, reset.
    return () => {
      clearTimers();
      setProgress(100);
      fadeTimer.current = setTimeout(() => {
        setVisible(false);
        // Reset progress AFTER fade so the bar is invisible when it
        // resets to 0 — otherwise we'd see it snap back.
        setTimeout(() => setProgress(0), FADE_MS);
      }, 80);
    };
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        height: 3,
        pointerEvents: 'none',
        zIndex: 100,
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease-out`,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, hsl(var(--brand)) 0%, hsl(var(--brand-purple, 263 70% 60%)) 100%)',
          transition: 'width 220ms cubic-bezier(0.22, 1, 0.36, 1)',
          boxShadow: '0 0 8px hsl(var(--brand) / 0.6)',
        }}
      />
    </div>
  );
}
