import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { Reveal } from './reveal';
import { BlockReveal, Mark } from './block-reveal';
import { BRAND } from '@digilog/shared';

/**
 * The last scene, not a strip of small print.
 *
 * The footer used to be one row: a logo, the tagline, and a confidentiality
 * line. That was fine when every page ended in a wall of prose, but each route
 * now opens with a composition, and closing on a caption undoes it — the site
 * would look designed at the top and abandoned at the bottom.
 *
 * So it closes the argument instead. The whole site turns on one idea, that
 * the cost of the old way is the wait, and the last line says it plainly.
 * Underneath, the pages are listed as an index with a reason to open each,
 * rather than the nav repeated as chrome.
 *
 * Everything here reveals on scroll rather than on load. The hero `Stage`
 * primitive fires as the page paints, which is right for something in the
 * first viewport and pointless for something two screens down — it would
 * finish long before anybody reached it. `Reveal` and `BlockReveal` are the
 * scroll-triggered pair, so the footer arrives when it is actually seen.
 */

const OUTLINE = [
  { label: 'Why it matters', href: '/why', note: 'What the delay costs' },
  { label: 'Platform', href: '/platform', note: 'Four books, one system' },
  { label: 'One night', href: '/story', note: 'The same incident, minute by minute' },
  { label: 'The console', href: '/console', note: 'The screen the control room watches' },
  { label: 'Answers', href: '/answers', note: 'Data, signal, lock-in' },
] as const;

export function SiteFooter() {
  return (
    <footer className="relative isolate w-full overflow-hidden bg-[#05070B] text-white">
      {/* The same low grain the /why hero opens on, so the site closes on the
          surface it made its argument on. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.05]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, #fff 0 1px, transparent 1px 3px)',
          maskImage: 'radial-gradient(100% 70% at 20% 0%, #000 5%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(100% 70% at 20% 0%, #000 5%, transparent 70%)',
        }}
      />

      <div className="site-w pb-10 pt-20 lg:pb-12 lg:pt-28">
        {/* ── The closing statement ─────────────────────────────────────── */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end lg:gap-16">
          <div className="min-w-0">
            <Reveal>
              <p className="font-mono text-[0.66rem] font-bold uppercase tracking-[0.22em] text-white/35">
                The whole argument, in one line
              </p>
            </Reveal>

            <h2 className="mt-6 max-w-[17ch] text-[clamp(2rem,5vw,3.8rem)] font-extrabold leading-[1.04] tracking-[-0.038em]">
              {/* The wipe block is white and the heading is white, so the
                  heading keeps its own colour — only the marked phrase flips
                  to dark, because that one sits ON the fill. */}
              <BlockReveal tone="light">
                Nothing waits for <Mark tone="light" className="text-[#05070B]">the morning</Mark>.
              </BlockReveal>
            </h2>
          </div>

          <Reveal delay={140} className="min-w-0 lg:pb-3">
            <p className="max-w-[42ch] text-base leading-relaxed text-white/55">
              An incident on a dark perimeter reaches the control room while it is
              still happening, with the evidence already attached and a clock
              already running against it.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex h-12 items-center gap-2 rounded-lg bg-white px-5 text-base font-semibold text-slate-900 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.6)] transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              Sign in to the console <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>

        <span
          aria-hidden
          className="mt-14 block h-px w-full bg-gradient-to-r from-white/25 via-white/10 to-transparent lg:mt-20"
        />

        {/* ── The index ─────────────────────────────────────────────────── */}
        <nav aria-label="All pages" className="mt-10">
          <ul className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
            {OUTLINE.map((p, i) => (
              <li key={p.href} className="bg-[#05070B]">
                <Reveal delay={i * 45} className="h-full">
                  <Link
                    href={p.href}
                    className="group flex h-full flex-col justify-between gap-3 px-5 py-5 transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-[0.97rem] font-semibold text-white">{p.label}</span>
                      <ArrowRight
                        aria-hidden
                        className="h-3.5 w-3.5 shrink-0 text-white/30 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-white/70"
                      />
                    </span>
                    <span className="text-[0.8rem] leading-snug text-white/40">{p.note}</span>
                  </Link>
                </Reveal>
              </li>
            ))}
          </ul>
        </nav>

        {/* ── The small print ───────────────────────────────────────────── */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-white/10 pt-7">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Logo className="text-lg" onDark />
            <span className="text-sm text-white/35">— {BRAND.tagline}</span>
          </span>

          <span className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-white/35">
            <span>
              © {new Date().getFullYear()} {BRAND.company}
            </span>
            <span aria-hidden className="hidden h-3 w-px bg-white/15 sm:block" />
            <span>Proprietary &amp; confidential</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
