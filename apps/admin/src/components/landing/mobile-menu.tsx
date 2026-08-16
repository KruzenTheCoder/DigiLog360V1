'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, X } from 'lucide-react';
import { SITE_LINKS } from './site-links';
import { Logo } from '@/components/brand/logo';

/**
 * The mobile navigation, rebuilt as a designed surface.
 *
 * What it replaced was a `{open && <nav>}` dropdown: no overlay, no focus
 * management, no Escape, no scroll lock, and it vanished on close with no
 * exit. On a phone — most first visits to a marketing site — that was the
 * weakest interaction on the page, and it failed the accessibility bar the
 * rest of the site is held to.
 *
 * The contract this one keeps:
 *
 *   • It is a real dialog: `role="dialog"`, `aria-modal`, labelled, focus
 *     moves in on open, is trapped while open, and returns to the button
 *     that opened it.
 *   • Escape closes it. So does the backdrop, and so does choosing a link.
 *   • The page behind it cannot scroll while it is open, and keeps its exact
 *     scroll position when it closes.
 *   • It leaves the way it arrived: the exit animation completes before the
 *     element unmounts, instead of the surface blinking out of existence.
 *
 * Links are set large with generous hit areas — this is a thumb surface, not
 * a shrunk desktop nav.
 */

/** Matches --dur-quick. The unmount must wait for the exit to finish. */
const EXIT_MS = 260;

export function MobileMenu({
  open,
  onClose,
  /** The burger button, so focus can go back where it came from. */
  triggerRef,
}: {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const mounted = open || closing;

  /** Close = play the exit, then unmount and hand focus back. */
  const close = useCallback(() => {
    setClosing(true);
    const t = setTimeout(() => {
      setClosing(false);
      onClose();
      triggerRef.current?.focus();
    }, EXIT_MS);
    return () => clearTimeout(t);
  }, [onClose, triggerRef]);

  // Scroll lock. `overflow: hidden` on the root element holds the position
  // without the position:fixed dance that loses it.
  useEffect(() => {
    if (!open) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = prev; };
  }, [open]);

  // Focus in on open; trap while open; Escape closes.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusables = () =>
      [...panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')]
        .filter((el) => el.offsetParent !== null);

    // Land on the first page link, not the first thing in the DOM — that is
    // the invisible backdrop button, and "where am I" should have an answer.
    (panel.querySelector<HTMLElement>('nav a') ?? focusables()[0])?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-[60] lg:hidden ${closing ? 'menu-leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Site navigation"
    >
      {/* Backdrop — its own element so a tap outside the panel closes. */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={close}
        className="menu-backdrop absolute inset-0 h-full w-full cursor-default bg-slate-950/60"
      />

      <div
        ref={panelRef}
        className="menu-panel absolute inset-x-0 top-0 flex max-h-full flex-col overflow-y-auto rounded-b-3xl bg-[hsl(var(--surface))] pb-6 shadow-[0_24px_60px_-24px_rgba(2,6,23,0.5)]"
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Logo className="text-lg" />
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--background))]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-2 px-3">
          {SITE_LINKS.map((l, i) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={close}
                aria-current={active ? 'page' : undefined}
                className={`menu-item flex min-h-[56px] items-center justify-between rounded-2xl px-4 text-xl font-semibold tracking-tight transition ${
                  active
                    ? 'bg-[hsl(var(--brand))]/10 text-[hsl(var(--brand))]'
                    : 'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background))]'
                }`}
                style={{ '--i': i } as CSSProperties}
              >
                {l.label}
                <ArrowRight
                  aria-hidden
                  className={`h-4 w-4 ${active ? 'opacity-100' : 'opacity-25'}`}
                />
              </Link>
            );
          })}
        </nav>

        <div className="menu-item mt-4 px-5" style={{ '--i': SITE_LINKS.length } as CSSProperties}>
          <Link
            href="/login"
            onClick={close}
            className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--brand))] text-base font-semibold text-white transition hover:opacity-90"
          >
            Sign in to the console <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
