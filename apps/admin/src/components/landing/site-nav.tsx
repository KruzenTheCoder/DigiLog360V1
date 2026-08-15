'use client';

// Top navigation for the marketing site.
//
// No bar. At the top of a page the nav is nothing but its links, sitting
// directly on whatever the page opens with — the hero gradient, or a pale
// section. Only once you scroll does a narrow frosted pill fade in behind
// them, so the links stay readable over moving content without a strip of
// chrome being parked there the whole time.
//
// Two grounds, so two ink colours. Pages that open dark get white links;
// pages that open pale get slate. Once the pill appears the ink is always
// slate, because the pill is always pale.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { BRAND } from '@digilog/shared';

export const SITE_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/why', label: 'Why it matters' },
  { href: '/platform', label: 'Platform' },
  { href: '/story', label: 'One night' },
  { href: '/console', label: 'The console' },
  { href: '/answers', label: 'Answers' },
];

/**
 * Routes whose hero opens dark, and therefore need pale links until the pill
 * appears behind them.
 *
 * Every route except /answers now opens on a dark hero — /answers is
 * deliberately the quiet one, on the app's own pale ground.
 */
const DARK_OPENING = new Set(['/', '/why', '/platform', '/story', '/console']);

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 28);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Over a dark opening AND not yet behind the pill.
  const onDark = DARK_OPENING.has(pathname) && !scrolled;
  const ink = onDark ? 'text-white' : 'text-slate-900 dark:text-slate-100';
  const inkMuted = onDark
    ? 'text-white/70 hover:text-white'
    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white';

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div className="site-w pt-3">
        <div
          className={[
            'pointer-events-auto flex items-center gap-6 rounded-full px-4 py-2.5 sm:px-5',
            'transition-[background-color,box-shadow,backdrop-filter] duration-300 motion-reduce:transition-none',
            scrolled
              ? 'bg-[hsl(var(--surface))]/80 shadow-[0_8px_30px_-12px_rgba(2,6,23,0.25)] backdrop-blur-xl'
              : 'bg-transparent shadow-none',
          ].join(' ')}
        >
          <Link href="/" className="min-w-0 shrink-0" aria-label={`${BRAND.name} home`}>
            <Logo className="text-lg sm:text-xl" onDark={onDark} />
          </Link>

          <nav className="ml-auto hidden items-center gap-7 lg:flex">
            {SITE_LINKS.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`group relative text-sm font-medium transition-colors duration-200 ${
                    active ? ink : inkMuted
                  }`}
                >
                  {l.label}
                  {/* Grows from the left on hover; already drawn on the page
                      you are on, so the nav shows where you are without a
                      filled pill competing with the one behind it. */}
                  <span
                    className={`absolute -bottom-1 left-0 h-px rounded-full transition-all duration-300 ${
                      onDark ? 'bg-white/80' : 'bg-[hsl(var(--brand))]'
                    } ${active ? 'w-full' : 'w-0 group-hover:w-full'}`}
                  />
                </Link>
              );
            })}
          </nav>

          <Link
            href="/login"
            className={[
              'ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5',
              'text-sm font-semibold transition duration-200 lg:ml-8',
              onDark
                ? 'bg-white/15 text-white ring-1 ring-inset ring-white/30 hover:bg-white/25'
                : 'bg-[hsl(var(--brand))] text-white hover:opacity-90',
            ].join(' ')}
          >
            Sign in <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`${ink} lg:hidden`}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <nav className="pointer-events-auto mt-2 rounded-2xl bg-[hsl(var(--surface))]/95 p-2 shadow-lg backdrop-blur-xl lg:hidden">
            {SITE_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`block rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  pathname === l.href
                    ? 'bg-[hsl(var(--brand))]/10 text-[hsl(var(--brand))]'
                    : 'text-slate-600 hover:bg-[hsl(var(--background))] dark:text-slate-300'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
