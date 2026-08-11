'use client';

import { useEffect, useState } from 'react';

// Sample incidents only — generic locations, no real site or person is named.
const FEED = [
  { ref: 'OB11432', what: 'Perimeter breach', where: 'North fence line', seconds: 3552 },
  { ref: 'OB11433', what: 'Panic button', where: 'Reception desk', seconds: 2410 },
  { ref: 'OB11434', what: 'Alarm activation', where: 'Plant room', seconds: 1145 },
];

function mmss(total: number) {
  if (total <= 0) return 'BREACHED';
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * The hero's control-room readout: a running response clock that cycles
 * through a few incidents. The realtime promise, shown rather than claimed.
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

  return (
    <div className="mt-8 max-w-xl rounded-xl border border-white/25 bg-white/[0.13] p-1 backdrop-blur-sm sm:mt-10">
      <p className="px-3 pb-1 pt-2 text-[0.66rem] font-bold uppercase tracking-[0.16em] text-white/75">
        Control room · live feed
      </p>
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-white/[0.14] px-3 py-2.5 text-sm transition-opacity duration-300 ${
          fading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <span className="font-mono font-bold tabular-nums">{item.ref}</span>
        <span className="text-white/50">·</span>
        <span>{item.what}</span>
        <span className="text-white/50">·</span>
        <span>{item.where}</span>
        <span className="ml-auto rounded-full bg-white px-2.5 py-0.5 font-mono text-xs font-bold tabular-nums text-red-600">
          {left > 0 ? `SLA ${mmss(left)}` : 'BREACHED'}
        </span>
      </div>
    </div>
  );
}
