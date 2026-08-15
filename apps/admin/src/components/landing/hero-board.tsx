'use client';

import { useEffect, useState } from 'react';

// Sample incidents only — generic locations, nothing identifies a real site.
const ROWS = [
  { ref: 'OB11432', what: 'Perimeter breach', where: 'North fence line', sev: 'Critical', rail: 'bg-red-400', chip: 'bg-red-400/20 text-red-100', seconds: 2712, total: 3600 },
  { ref: 'OB11431', what: 'Attempted break-in', where: 'Loading bay', sev: 'High', rail: 'bg-orange-400', chip: 'bg-orange-400/20 text-orange-100', seconds: 8880, total: 14400 },
  { ref: 'OB11429', what: 'Suspicious vehicle', where: 'Visitor entrance', sev: 'Medium', rail: 'bg-amber-300', chip: 'bg-amber-300/20 text-amber-100', seconds: 41880, total: 86400 },
];

function clock(total: number) {
  if (total <= 0) return 'BREACHED';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * The hero's proof-of-life: a compact live board whose response clocks run in
 * real time. Denser and more convincing than a single cycling row — it shows
 * the product doing its job rather than describing it.
 */
export function HeroBoard() {
  const [secs, setSecs] = useState(() => ROWS.map((r) => r.seconds));

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setSecs((p) => p.map((s) => (s > 0 ? s - 1 : 0))), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="w-full rounded-2xl border border-white/25 bg-white/[0.10] shadow-[0_30px_70px_-25px_rgba(2,6,23,0.65)] backdrop-blur-md">
      <div className="hero-rise flex items-center gap-2 border-b border-white/15 px-4 py-3" style={{ animationDelay: '440ms' }}>
        <span className="h-2.5 w-2.5 rounded-full bg-white/35" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="ml-2 truncate font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-white/70">
          Live occurrences
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-white/85">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          Live
        </span>
      </div>

      <ul className="divide-y divide-white/10">
        {ROWS.map((r, i) => {
          const left = secs[i]!;
          const pct = Math.max(0, Math.min(100, (left / r.total) * 100));
          return (
            // The rows deal in behind the board itself, so the panel arrives
            // first and then fills — the order a real board loads in.
            <li
              key={r.ref}
              className="hero-rise flex items-center gap-3 px-4 py-3"
              style={{ animationDelay: `${520 + i * 110}ms` }}
            >
              <span className={`h-9 w-1 shrink-0 rounded-full ${r.rail}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[0.7rem] font-bold text-white/80">{r.ref}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide ${r.chip}`}>
                    {r.sev}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm font-semibold">{r.what}</p>
                <p className="truncate text-xs text-white/60">{r.where}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-sm font-extrabold tabular-nums">{clock(left)}</p>
                <div className="mt-1 h-0.5 w-14 overflow-hidden rounded-full bg-white/20">
                  <div
                    className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
                      pct < 25 ? 'bg-red-300' : 'bg-white/80'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div
        className="hero-rise flex items-center justify-between border-t border-white/15 px-4 py-2.5 text-[0.68rem] text-white/65"
        style={{ animationDelay: '860ms' }}
      >
        <span>Streaming over websockets</span>
        <span className="font-mono">no refresh</span>
      </div>
    </div>
  );
}
