'use client';

import { useEffect, useState } from 'react';

// Sample incidents only — generic locations, no real site or person is named.
const FEED = [
  { ref: 'OB11432', what: 'Perimeter breach', where: 'North fence line', seconds: 3552, total: 3600 },
  { ref: 'OB11433', what: 'Panic button', where: 'Reception desk', seconds: 2410, total: 3600 },
  { ref: 'OB11434', what: 'Alarm activation', where: 'Plant room', seconds: 1145, total: 3600 },
];

function mmss(total: number) {
  if (total <= 0) return 'BREACHED';
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * The hero's control-room readout: a running response clock that cycles
 * through a few incidents, with the remaining window drawn underneath. The
 * realtime promise shown rather than claimed.
 */
export function LiveTicker() {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [clocks, setClocks] = useState(() => FEED.map((f) => f.seconds));

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const tick = setInterval(() => {
      setClocks((prev) => prev.map((c) => (c > 0 ? c - 1 : 0)));
    }, 1000);

    const cycle = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIndex((i) => (i + 1) % FEED.length);
        setFading(false);
      }, 400);
    }, 5200);

    return () => {
      clearInterval(tick);
      clearInterval(cycle);
    };
  }, []);

  const item = FEED[index]!;
  const left = clocks[index]!;
  const pct = Math.max(0, Math.min(100, (left / item.total) * 100));
  const urgent = pct < 25;

  return (
    <div className="w-full max-w-xl rounded-2xl border border-white/25 bg-white/[0.10] shadow-[0_24px_60px_-24px_rgba(2,6,23,0.6)] backdrop-blur-md">
      {/* Window chrome, echoing the console section further down the page */}
      <div className="flex items-center gap-2 border-b border-white/15 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-white/35" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="ml-2 font-mono text-[0.66rem] font-bold uppercase tracking-[0.18em] text-white/70">
          Control room · live feed
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-white/80">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          Live
        </span>
      </div>

      {/* Fixed height so the cycle never nudges the layout */}
      <div
        className={`min-h-[8.5rem] px-5 py-5 transition-opacity duration-300 ${
          fading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-sm font-bold tracking-wide text-white/90">{item.ref}</p>
            <p className="mt-1.5 truncate text-lg font-semibold leading-snug">{item.what}</p>
            <p className="mt-0.5 truncate text-sm text-white/70">{item.where}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-white/60">
              Resolve within
            </p>
            <p
              className={`mt-1 font-mono text-2xl font-extrabold tabular-nums ${
                left <= 0 ? 'text-red-200' : 'text-white'
              }`}
            >
              {mmss(left)}
            </p>
          </div>
        </div>

        {/* Remaining response window */}
        <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-white/20">
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
              urgent ? 'bg-red-300' : 'bg-white/80'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
