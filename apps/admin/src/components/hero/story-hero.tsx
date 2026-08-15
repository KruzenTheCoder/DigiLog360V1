'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { HeroShell, Stage, MaskLine } from './hero-shell';
import { useReducedMotion } from '@/lib/animation/use-reduced-motion';

/**
 * /story — the establishing shot.
 *
 * This page is a timeline of one night, and it used to begin with no night.
 * The hero is the frame before the first event: a perimeter rendered as
 * depth rather than as a photograph, a single light, and a clock that has
 * started running.
 *
 * The composition is built from gradients and transforms only — no images, no
 * `filter: blur()`. A large blurred surface is the most expensive thing
 * available on a phone, and a radial gradient reads the same at this scale for
 * none of the cost.
 *
 * The clock is the only element that keeps moving after the entrance, and it
 * is doing narrative work rather than decorating: the night is progressing
 * whether or not anybody is watching, which is exactly the page's argument.
 */

/** 23:47:12 — the moment the gate opens. */
const START = { h: 23, m: 47, s: 12 };

function pad(n: number) { return String(n).padStart(2, '0'); }

export function StoryHero() {
  const reduced = useReducedMotion();
  const [t, setT] = useState(START);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setT((p) => {
        const s = p.s + 1;
        if (s < 60) return { ...p, s };
        const m = p.m + 1;
        if (m < 60) return { ...p, m, s: 0 };
        return { h: (p.h + 1) % 24, m: 0, s: 0 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    <HeroShell ground="bg-[#05070B] text-white" height="full">
      {/* ── The night, in layers ─────────────────────────────────────────
          Three silhouette bands at different depths, a light source, and two
          haze drifts on unequal periods. Furthest back first. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {/* Sky wash */}
        <div
          className="band absolute inset-0"
          style={{
            '--t': '300ms', '--band-o': 1,
            background:
              'radial-gradient(120% 70% at 50% 110%, rgba(30,41,59,0.85), transparent 70%), linear-gradient(180deg, #05070B 0%, #080C14 60%, #0A0F18 100%)',
          } as CSSProperties}
        />
        {/* The light on the perimeter — a bloom, not a blur filter. */}
        <div
          className="bloom absolute right-[14%] top-[26%] h-[26rem] w-[26rem] -translate-y-1/2 rounded-full"
          style={{
            '--t': '900ms',
            background:
              'radial-gradient(circle, rgba(251,191,36,0.30) 0%, rgba(251,191,36,0.10) 32%, transparent 68%)',
          } as CSSProperties}
        />
        <div
          className="bloom absolute right-[15.6%] top-[26%] h-3 w-3 -translate-y-1/2 rounded-full bg-amber-200"
          style={{ '--t': '900ms', boxShadow: '0 0 24px 6px rgba(251,191,36,0.55)' } as CSSProperties}
        />
        {/* Haze */}
        <div
          className="haze-a absolute inset-x-[-10%] top-[38%] h-40 opacity-45"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(148,163,184,0.13), transparent)' }}
        />
        <div
          className="haze-b absolute inset-x-[-10%] top-[54%] h-32 opacity-35"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(148,163,184,0.10), transparent)' }}
        />
        {/* Three ground bands, back to front. */}
        <div
          className="band parallax-back absolute inset-x-[-6%] bottom-[26%] h-40"
          style={{
            '--t': '480ms', '--band-o': 0.55,
            background: 'linear-gradient(180deg, transparent, #0B1220 62%)',
            clipPath: 'polygon(0 62%, 12% 48%, 26% 58%, 41% 40%, 58% 54%, 73% 44%, 88% 56%, 100% 46%, 100% 100%, 0 100%)',
          } as CSSProperties}
        />
        <div
          className="band absolute inset-x-[-4%] bottom-[12%] h-44"
          style={{
            '--t': '640ms', '--band-o': 0.8,
            background: 'linear-gradient(180deg, transparent, #070C15 58%)',
            clipPath: 'polygon(0 54%, 16% 66%, 33% 50%, 49% 63%, 66% 47%, 81% 60%, 100% 52%, 100% 100%, 0 100%)',
          } as CSSProperties}
        />
        <div
          className="band parallax-fore absolute inset-x-0 bottom-0 h-40"
          style={{
            '--t': '800ms', '--band-o': 1,
            background: 'linear-gradient(180deg, transparent, #05070B 55%)',
            clipPath: 'polygon(0 44%, 22% 58%, 44% 42%, 63% 56%, 82% 40%, 100% 54%, 100% 100%, 0 100%)',
          } as CSSProperties}
        />
      </div>

      <Stage at={0}>
        <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.22em] text-white/40">
          One night, minute by minute
        </p>
      </Stage>

      <h1 className="mt-8 max-w-[19ch] text-[clamp(2.1rem,5.2vw,4.1rem)] font-extrabold leading-[1.04] tracking-[-0.038em]">
        <MaskLine at={140}>A gate opens</MaskLine>
        <MaskLine at={240} className="text-white/45">that should not</MaskLine>
        <MaskLine at={340}>be open.</MaskLine>
      </h1>

      <Stage at={560} as="p" className="mt-7 max-w-[52ch] text-base leading-relaxed text-white/60 lg:text-lg">
        What follows is the same incident, run through the platform, timestamp by
        timestamp — from the scan at the perimeter to the manager signing it off
        before the shift ends.
      </Stage>

      {/* The clock. Bottom-left, monospace, running. */}
      <Stage at={700} className="mt-12">
        <div className="inline-flex items-baseline gap-3 rounded-lg border border-white/15 bg-black/30 px-4 py-2.5 backdrop-blur-sm">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-300" />
          </span>
          <time
            className="font-mono text-[clamp(1.3rem,2.6vw,1.9rem)] font-bold leading-none tabular-nums tracking-tight text-white"
            dateTime={`${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`}
          >
            {pad(t.h)}:{pad(t.m)}:{pad(t.s)}
          </time>
          <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-white/40">
            Perimeter · east gate
          </span>
        </div>
      </Stage>

      {/* The first record, materialising under a scan line. */}
      <Stage at={820} className="mt-6 max-w-[30rem]">
        <div
          className="scan-wipe rounded-xl border border-white/18 bg-white/[0.06] p-4 backdrop-blur-sm"
          style={{ '--t': '900ms' } as CSSProperties}
        >
          <div className="flex items-center gap-2.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
            <span className="font-mono text-[0.66rem] text-white/55">OB11430</span>
            <span className="text-sm font-semibold text-white">Alarm activation</span>
            <span className="ml-auto font-mono text-[0.66rem] text-red-300">SLA 1h</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-white/55">
            Logged from a handset at the gate with two photographs attached. In the
            control room before the guard has finished walking back.
          </p>
        </div>
      </Stage>
    </HeroShell>
  );
}
