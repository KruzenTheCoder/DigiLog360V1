'use client';

// Top navigation for the marketing site.
//
// The site used to be one very long scroll. It is now several short pages, so
// there has to be somewhere to go — this is that, plus the sign-in call to
// action that was previously buried at the bottom of the scroll.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Logo } from '@/components/brand/logo';

export const SITE_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/why', label: 'Why it matters' },
  { href: '/platform', label: 'Platform' },
  { href: '/story', label: 'One night' },
  { href: '/console', label: 'The console' },
  { href: '/answers', label: 'Answers' },
];

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[92rem] items-center gap-6 px-5 py-3 sm:px-8 lg:px-12">
        <Link href="/" className="shrink-0" aria-label="Digilog360 home">
          <Logo className="text-2xl" onDark />
        </Link>

        <nav className="ml-auto hidden items-center gap-1 lg:flex">
          {SITE_LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? 'text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {l.label}
                {/* The underline travels with the active page rather than
                    appearing and disappearing, so the nav feels continuous. */}
                {active && (
                  <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-[#667eea] to-[#764ba2]" />
                )}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/login"
          className="ml-auto rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-slate-100 lg:ml-3"
        >
          Sign in
        </Link>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-white lg:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-white/10 bg-slate-950 px-5 py-2 lg:hidden">
          {SITE_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`block rounded-lg px-3 py-2.5 text-sm font-medium ${
                pathname === l.href ? 'bg-white/10 text-white' : 'text-slate-400'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
