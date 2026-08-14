'use client';

// Top navigation for the marketing site.
//
// No bar of its own. It sits on the SAME brand gradient the hero uses, so on
// the home page the two read as one surface and the links appear to float on
// the hero rather than under a separate strip. Links carry no background —
// only a colour shift and an underline that grows on hover, with the active
// page's underline already drawn.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
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

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="relative z-40 w-full bg-brand-gradient">
      <div className="mx-auto flex w-full max-w-[92rem] items-center gap-6 px-5 py-5 sm:px-8 lg:px-12">
        <Link href="/" className="min-w-0 shrink-0" aria-label={`${BRAND.name} home`}>
          <Logo className="text-xl sm:text-2xl" onDark />
          <p className="mt-0.5 truncate text-[0.7rem] text-white/75 sm:text-xs">{BRAND.tagline}</p>
        </Link>

        <nav className="ml-auto hidden items-center gap-7 lg:flex">
          {SITE_LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`group relative text-sm font-medium transition-colors duration-200 ${
                  active ? 'text-white' : 'text-white/70 hover:text-white'
                }`}
              >
                {l.label}
                {/* Grows from the centre on hover; already full width on the
                    page you are on, so the nav shows where you are without a
                    filled pill. */}
                <span
                  className={`absolute -bottom-1.5 left-0 h-0.5 rounded-full bg-white/90 transition-all duration-300 ${
                    active ? 'w-full' : 'w-0 group-hover:w-full'
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        <Link
          href="/login"
          className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-slate-100 lg:ml-8"
        >
          Sign in <ArrowRight className="h-4 w-4" />
        </Link>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-white lg:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-white/15 px-5 pb-3 lg:hidden">
          {SITE_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`block py-2.5 text-sm font-medium transition ${
                pathname === l.href ? 'text-white' : 'text-white/70 hover:text-white'
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
