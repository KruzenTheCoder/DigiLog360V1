import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { HeroShell, Stage, MaskLine } from './hero-shell';

/**
 * /console — the board, full bleed.
 *
 * A product page should show the product before it describes it. So the
 * interface is not a screenshot sitting on a marketing background; it is the
 * background, running behind the headline, with the copy overlaid on its
 * upper-left the way a caption sits on an image.
 *
 * The frame draws first as an empty outline, then fills, then the rows deal in
 * bottom-up — the same order the real board populates when a shift starts.
 * Severity chips resolve from grey to colour last, because that is the piece
 * of information the control room actually reads.
 *
 * A server component: the whole sequence is CSS, and the live board with its
 * running clocks already exists further down the page. Repeating that here
 * would mean two independent timers on one route for no gain.
 */

const ROWS = [
  { ref: 'OB11430', what: 'Alarm activation', where: 'Plant room', sev: 'Critical', tone: 'bg-red-500', text: 'text-red-300', clock: '00:41', at: 420 },
  { ref: 'OB11431', what: 'Attempted break-in', where: 'Loading bay', sev: 'High', tone: 'bg-orange-500', text: 'text-orange-300', clock: '02:34', at: 500 },
  { ref: 'OB11429', what: 'Suspicious vehicle', where: 'Visitor entrance', sev: 'Medium', tone: 'bg-amber-500', text: 'text-amber-300', clock: '11:28', at: 580 },
  { ref: 'OB11427', what: 'Lighting fault', where: 'Yard', sev: 'Low', tone: 'bg-sky-500', text: 'text-sky-300', clock: '2d 04h', at: 660 },
] as const;

export function ConsoleHero() {
  return (
    <HeroShell ground="bg-slate-900 text-white" height="full">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(900px 500px at 78% 8%, rgba(102,126,234,0.22), transparent 62%), radial-gradient(700px 420px at 8% 100%, rgba(2,6,23,0.6), transparent 60%)',
        }}
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-center lg:gap-14">
        <div className="min-w-0">
          <Stage at={0}>
            <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.22em] text-white/45">
              The console
            </p>
          </Stage>

          <h1 className="mt-6 max-w-[15ch] text-[clamp(2.1rem,4.6vw,3.6rem)] font-extrabold leading-[1.05] tracking-[-0.036em]">
            <MaskLine at={140}>The screen</MaskLine>
            <MaskLine at={240} className="text-white/45">the control room</MaskLine>
            <MaskLine at={340}>never looks away from.</MaskLine>
          </h1>

          <Stage at={560} as="p" className="mt-7 max-w-[46ch] text-base leading-relaxed text-white/65">
            Open incidents ranked by how close they are to breaching their response
            target. The clocks run in real time, and a new critical arrives without
            anybody refreshing anything.
          </Stage>

          <Stage at={700} className="mt-8">
            <Link
              href="/login"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-white px-5 text-base font-semibold text-slate-900 shadow-[0_12px_30px_-10px_rgba(2,6,23,0.5)] transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              Sign in to the console <ArrowRight className="h-4 w-4" />
            </Link>
          </Stage>
        </div>

        {/* The board. Height reserved so the deal-in cannot shift the page. */}
        <div
          className="frame-draw min-h-[300px] min-w-0 overflow-hidden rounded-2xl border border-white/18 bg-white/[0.05] backdrop-blur-md lg:min-h-[360px]"
          style={{ '--t': '80ms' } as CSSProperties}
        >
          <div className="flex items-center gap-2 border-b border-white/12 px-4 py-3">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-white/70">
              Live occurrences
            </span>
            <span className="ml-auto font-mono text-[0.62rem] text-white/45">18 open · 3 critical</span>
          </div>

          {/* Column headings, so the rows read as a board rather than a list. */}
          <div
            className="row-deal grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-white/10 px-4 py-2 font-mono text-[0.58rem] font-bold uppercase tracking-[0.14em] text-white/40 sm:grid-cols-[auto_1fr_auto_auto]"
            style={{ '--t': '260ms' } as CSSProperties}
          >
            <span>Ref</span>
            <span>Occurrence</span>
            <span className="hidden sm:block">Location</span>
            <span className="text-right">To breach</span>
          </div>

          <ul>
            {ROWS.map((r) => (
              <li
                key={r.ref}
                className="row-deal grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-white/[0.07] px-4 py-2.5 last:border-0 sm:grid-cols-[auto_1fr_auto_auto]"
                style={{ '--t': `${r.at}ms` } as CSSProperties}
              >
                <span className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.tone}`} />
                  <span className="font-mono text-[0.66rem] text-white/55">{r.ref}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-white/95">{r.what}</span>
                  <span className="mt-0.5 block text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-white/35 sm:hidden">
                    {r.where}
                  </span>
                </span>
                <span className="hidden shrink-0 text-xs text-white/50 sm:block">{r.where}</span>
                <span className={`shrink-0 text-right font-mono text-sm font-bold tabular-nums ${r.text}`}>
                  {r.clock}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </HeroShell>
  );
}
