'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDown } from 'lucide-react';
import { HeroShell, Stage, MaskLine } from './hero-shell';
import { useReducedMotion } from '@/lib/animation/use-reduced-motion';

/**
 * /why — the gap.
 *
 * The page argues that the cost of the old way is the distance between an
 * incident happening and a manager finding out. So the hero is that distance,
 * drawn: two timestamps, and the measured space between them.
 *
 * There is no imagery and no gradient. The absence of anything comfortable to
 * look at is the point — this is the one page that should feel like a fact
 * rather than a pitch.
 *
 * The figure keeps counting after the entrance finishes and never resolves.
 * That is the argument, and it is why this hero has ambient motion at all.
 */

const INCIDENT = '23:47';
const READ_AT = '07:15';
/** 23:47 → 07:15 the following morning. */
const GAP_MINUTES = 7 * 60 + 28;

function format(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function WhyHero() {
  const reduced = useReducedMotion();
  // Starts at the real figure so the server render and the first paint agree;
  // the count is an enhancement layered on afterwards, never the source of
  // the number.
  const [minutes, setMinutes] = useState(GAP_MINUTES);

  useEffect(() => {
    if (reduced) return;

    // Count up to the figure once the rule has finished drawing, then keep
    // going. The first pass is the reveal; the drift afterwards is the point.
    let current = 0;
    setMinutes(0);
    const climb = setInterval(() => {
      current += Math.max(4, Math.round((GAP_MINUTES - current) / 12));
      if (current >= GAP_MINUTES) {
        current = GAP_MINUTES;
        clearInterval(climb);
        setMinutes(current);
        return;
      }
      setMinutes(current);
    }, 26);

    // …and then it simply keeps running, because nobody has looked yet.
    const drift = setInterval(() => {
      setMinutes((m) => (m >= GAP_MINUTES ? m + 1 : m));
    }, 9000);

    return () => { clearInterval(climb); clearInterval(drift); };
  }, [reduced]);

  return (
    <HeroShell
      ground="bg-[#07090C] text-white"
      height="full"
    >
      {/* A very low-frequency grain, so the black is a surface rather than a
          void. One repeating gradient, no image request. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.055]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, #fff 0 1px, transparent 1px 3px)',
          maskImage: 'radial-gradient(120% 80% at 50% 40%, #000 10%, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(120% 80% at 50% 40%, #000 10%, transparent 78%)',
        }}
      />

      <Stage at={0}>
        <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.22em] text-white/45">
          Why it matters
        </p>
      </Stage>

      {/* The measurement itself. */}
      <div className="mt-10 lg:mt-14">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
          <Stage at={220} className="shrink-0">
            <span className="block font-mono text-[clamp(2.6rem,7vw,5rem)] font-bold leading-none tracking-tight text-white">
              {INCIDENT}
            </span>
            <span className="mt-2 block text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-white/40">
              The gate opens
            </span>
          </Stage>

          {/* The rule, and the figure sitting on it. On a narrow screen this
              becomes a vertical run instead — the composition reads better
              stacked than squeezed. */}
          <div className="relative min-w-0 flex-1 py-6 sm:py-0">
            <span
              aria-hidden
              className="gap-rule absolute left-0 top-1/2 hidden h-px w-full -translate-y-1/2 bg-gradient-to-r from-white/50 via-white/20 to-white/50 sm:block"
              style={{ '--t': '520ms' } as CSSProperties}
            />
            <span
              aria-hidden
              className="gap-rule absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-white/50 via-white/20 to-white/50 sm:hidden"
              style={{ '--t': '520ms', transformOrigin: 'center top' } as CSSProperties}
            />
            <Stage at={1150} className="relative flex justify-center">
              <span className="bg-[#07090C] px-4 text-center">
                <span className="block font-mono text-[clamp(1.5rem,3.4vw,2.4rem)] font-bold leading-none tabular-nums text-[#FF7A59]">
                  {format(minutes)}
                </span>
                <span className="mt-1.5 block text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-white/40">
                  Nobody knows yet
                </span>
              </span>
            </Stage>
          </div>

          <Stage at={880} className="shrink-0 sm:text-right">
            <span className="stamp-land block font-mono text-[clamp(2.6rem,7vw,5rem)] font-light leading-none tracking-tight text-white/55" style={{ '--t': '880ms' } as CSSProperties}>
              {READ_AT}
            </span>
            <span className="mt-2 block text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-white/40">
              A manager reads about it
            </span>
          </Stage>
        </div>
      </div>

      <h1 className="mt-14 max-w-[22ch] text-[clamp(1.9rem,3.6vw,3rem)] font-extrabold leading-[1.08] tracking-[-0.03em] lg:mt-16">
        <MaskLine at={1050}>Everything that went wrong</MaskLine>
        <MaskLine at={1150} className="text-white/45">happened in the gap.</MaskLine>
      </h1>

      <Stage at={1300} as="p" className="mt-6 max-w-[56ch] text-base leading-relaxed text-white/60">
        Not the incident — the silence after it. Seven and a half hours in which
        nothing was decided, nobody was dispatched, and the only record was a
        line in a paper book somebody would read in the morning.
      </Stage>

      <Stage at={1420} className="mt-9">
        <a
          href="#problem"
          className="group inline-flex h-12 items-center gap-2 rounded-lg border border-white/25 px-5 text-base font-medium text-white transition hover:border-white/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          What the delay costs
          <ArrowDown className="h-4 w-4 transition-transform duration-300 group-hover:translate-y-0.5" />
        </a>
        <Link
          href="/platform"
          className="ml-3 inline-flex h-12 items-center text-base font-medium text-white/55 underline-offset-4 transition hover:text-white hover:underline"
        >
          Or see what replaces it
        </Link>
      </Stage>
    </HeroShell>
  );
}
