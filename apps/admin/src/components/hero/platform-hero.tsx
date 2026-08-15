import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, Clock, IdCard, KeyRound } from 'lucide-react';
import { HeroShell, Stage, MaskLine } from './hero-shell';

/**
 * /platform — four ledgers become one.
 *
 * The page has to establish scope before it lists features, and the scope is
 * the thing worth showing rather than saying: four separate paper systems,
 * each with its own book and its own cupboard, collapsing into a single live
 * panel.
 *
 * Four artefacts fly in from four edges, hold long enough to be read as four
 * distinct things, then converge and hand over to the console panel underneath
 * them. One keyframe serves all four — each carries its own offset, angle and
 * timing as custom properties.
 *
 * Deliberately a server component. The whole sequence is CSS, so this ships no
 * JavaScript at all: the convergence costs the visitor nothing beyond the
 * markup it is drawn with.
 */

const LEDGERS = [
  {
    label: 'Occurrence book',
    detail: 'Handwritten · one copy',
    icon: BookOpen,
    // Where it starts, relative to its resting place. Short travel on purpose:
    // four long crossing paths read as clutter, not as convergence.
    fx: '-34%', fy: '-26%', fr: '-5deg', at: 0,
  },
  {
    label: 'Patrol clock',
    detail: 'Punched · read weekly',
    icon: Clock,
    fx: '36%', fy: '-24%', fr: '4deg', at: 130,
  },
  {
    label: 'Visitor register',
    detail: 'At the gate · unsearchable',
    icon: IdCard,
    fx: '-32%', fy: '28%', fr: '4deg', at: 260,
  },
  {
    label: 'Key ledger',
    detail: 'Signed out · rarely back',
    icon: KeyRound,
    fx: '34%', fy: '26%', fr: '-5deg', at: 390,
  },
] as const;

/** The rows the console panel resolves into once the four have merged. */
/**
 * The rows the panel fills with.
 *
 * Timed to land as the ledgers dissolve rather than before them — the last
 * artefact starts leaving around 1s, and each row arrives just behind its
 * paper equivalent, so the sequence reads as four things becoming one rather
 * than as two animations sharing a box.
 */
const ROWS = [
  { ref: 'OB11430', what: 'Alarm activation', where: 'Plant room', tone: 'bg-red-500', at: 760 },
  { ref: 'OB11431', what: 'Attempted break-in', where: 'Loading bay', tone: 'bg-orange-500', at: 850 },
  { ref: 'OB11429', what: 'Visitor signed in', where: 'Main gate', tone: 'bg-sky-500', at: 940 },
  { ref: 'OB11427', what: 'Key issued · K-14', where: 'Control room', tone: 'bg-emerald-500', at: 1030 },
] as const;

export function PlatformHero() {
  return (
    <HeroShell ground="bg-slate-950 text-white" height="full">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(110% 85% at 60% 30%, #000 15%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(110% 85% at 60% 30%, #000 15%, transparent 75%)',
        }}
      />

      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-16">
        <div className="min-w-0">
          <Stage at={0}>
            <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.22em] text-white/45">
              The platform
            </p>
          </Stage>

          {/* The headline leads. The convergence to the right plays in
              parallel rather than before it — a visitor should be reading by
              ~350ms, not waiting for an illustration to finish. */}
          <h1 className="mt-6 max-w-[16ch] text-[clamp(2.2rem,5vw,3.9rem)] font-extrabold leading-[1.04] tracking-[-0.038em]">
            <MaskLine at={140}>Four books,</MaskLine>
            <MaskLine at={240} className="text-white/45">four cupboards,</MaskLine>
            <MaskLine at={340}>one live system.</MaskLine>
          </h1>

          <Stage at={560} as="p" className="mt-7 max-w-[52ch] text-base leading-relaxed text-white/65 lg:text-lg">
            The occurrence book, the patrol clock, the visitor register and the key
            ledger stop being four separate records nobody can cross-reference, and
            become one board the control room is already watching.
          </Stage>

          <Stage at={700} className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/console"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-white px-5 text-base font-semibold text-slate-900 shadow-[0_12px_30px_-10px_rgba(2,6,23,0.5)] transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              See the console <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/story"
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/25 px-5 text-base font-medium text-white transition hover:border-white/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              Watch it run for one night
            </Link>
          </Stage>
        </div>

        {/* The stage the convergence happens on. Height is reserved so nothing
            below it moves while the sequence plays. */}
        <div className="relative min-h-[320px] min-w-0 lg:min-h-[400px]">
          {/* The four artefacts. They end the sequence at opacity 0, having
              handed over to the panel. `aria-hidden` because the same four
              names are in the paragraph above — this is illustration, and a
              screen reader should not have to sit through it. */}
          {LEDGERS.map((l) => {
            const Icon = l.icon;
            return (
              <div
                key={l.label}
                aria-hidden
                // `pointer-events-none` because the sequence ends with these
                // at opacity 0 while they are still laid over the panel — an
                // invisible card that eats clicks and blocks text selection is
                // the classic way a convergence effect breaks the thing it
                // converged into.
                className="ledger pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-[min(78%,300px)] -translate-y-1/2 rounded-xl border border-white/20 bg-white/[0.07] p-4 backdrop-blur-sm"
                style={{
                  '--fx': l.fx, '--fy': l.fy, '--fr': l.fr, '--t': `${l.at}ms`,
                } as CSSProperties}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-white/70" />
                  <span className="text-sm font-semibold text-white">{l.label}</span>
                </div>
                <p className="mt-1.5 text-xs text-white/50">{l.detail}</p>
                {/* Ruled lines, so it reads as a page rather than a card. */}
                <div className="mt-3 space-y-1.5" aria-hidden>
                  <span className="block h-px w-full bg-white/12" />
                  <span className="block h-px w-[86%] bg-white/12" />
                  <span className="block h-px w-[93%] bg-white/12" />
                </div>
              </div>
            );
          })}

          {/* What they become.
              The panel is the RESTING state, not a stage in the sequence: it
              paints immediately and the ledgers converge and dissolve over it.
              Building it the other way round — panel hidden until the
              convergence lands — meant the main object on the page was
              invisible for well over a second, and left it permanently
              invisible in any environment where the animation timeline does
              not advance. Nothing on this site should be hidden by default. */}
          <div className="relative rounded-2xl border border-white/20 bg-white/[0.06] p-4 backdrop-blur-md">
            <div className="mb-3 flex items-center gap-2 border-b border-white/12 pb-2.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-white/65">
                Live occurrences
              </span>
              <span className="ml-auto font-mono text-[0.62rem] text-white/45">all sources</span>
            </div>
            <ul className="grid gap-2">
              {ROWS.map((r) => (
                <li
                  key={r.ref}
                  className="row-deal flex items-center gap-3 rounded-lg bg-white/[0.04] px-3 py-2"
                  style={{ '--t': `${r.at}ms` } as CSSProperties}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.tone}`} />
                  <span className="font-mono text-[0.68rem] text-white/55">{r.ref}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-white/90">{r.what}</span>
                  <span className="hidden shrink-0 text-xs text-white/45 sm:block">{r.where}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </HeroShell>
  );
}
