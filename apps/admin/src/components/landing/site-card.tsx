'use client';

// The marketing site's card system.
//
// The site reads as a deck rather than a wall of prose: each idea gets its own
// surface, and the surfaces arrive rather than simply being there. Three
// behaviours do the work:
//
//   • a spotlight that tracks the pointer across a card, so the page feels lit
//     rather than printed;
//   • a lift on hover, which tells you the thing is a thing;
//   • a staggered 3-D entrance as cards scroll into view, so a grid deals
//     itself out instead of appearing all at once.
//
// Everything animates transform and opacity only, which keeps it on the
// compositor and off the main thread — the difference between smooth and
// juddering on a mid-range phone. The spotlight is skipped entirely on touch
// devices, where there is no pointer to track and the listener would only cost
// battery. Anyone who has asked for reduced motion gets the content with none
// of the travel.

import {
  useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode,
} from 'react';

type Tone = 'default' | 'brand' | 'red' | 'green' | 'violet' | 'amber' | 'dark';

/**
 * Accent for the spotlight and the hover border.
 *
 * Kept separate from the surface, because the same accent is needed on both
 * grounds: a red-toned card sits on the light "what you get" panel and on the
 * dark "problem" panel, and only its background should differ.
 */
const TONE: Record<Tone, { glow: string; ringLight: string; ringDark: string }> = {
  default: { glow: 'rgba(37,99,235,0.16)', ringLight: 'hover:border-[hsl(var(--brand))]/40', ringDark: 'hover:border-white/25' },
  brand:   { glow: 'rgba(37,99,235,0.20)', ringLight: 'hover:border-[hsl(var(--brand))]/60', ringDark: 'hover:border-sky-400/40' },
  red:     { glow: 'rgba(239,68,68,0.18)', ringLight: 'hover:border-red-500/50', ringDark: 'hover:border-red-500/40' },
  green:   { glow: 'rgba(16,185,129,0.18)', ringLight: 'hover:border-emerald-500/50', ringDark: 'hover:border-emerald-500/40' },
  violet:  { glow: 'rgba(139,92,246,0.18)', ringLight: 'hover:border-violet-500/50', ringDark: 'hover:border-violet-500/40' },
  amber:   { glow: 'rgba(245,158,11,0.18)', ringLight: 'hover:border-amber-500/50', ringDark: 'hover:border-amber-500/40' },
  dark:    { glow: 'rgba(255,255,255,0.10)', ringLight: 'hover:border-slate-400', ringDark: 'hover:border-white/25' },
};

/**
 * Cards sit ON a panel, so they take the recessed ground rather than the
 * panel's own white. White-on-white leaves only the border doing the work and
 * the whole deck flattens.
 */
const SURFACE = {
  // A resting shadow does most of the separating. The two surface tokens are
  // only two points of lightness apart, so border alone left the deck flat.
  light: 'bg-[hsl(var(--background))] border-[hsl(var(--border))] shadow-[0_1px_2px_rgba(2,6,23,0.05),0_10px_24px_-18px_rgba(2,6,23,0.22)]',
  dark: 'bg-white/[0.045] border-white/10 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.8)]',
};

export function SiteCard({
  children,
  tone = 'default',
  surface = 'light',
  className,
  padded = true,
  lift = true,
  spotlight = true,
  as: Tag = 'div',
}: {
  children: ReactNode;
  tone?: Tone;
  /** Which ground the card sits on — a dark panel needs a dark card. */
  surface?: 'light' | 'dark';
  className?: string;
  padded?: boolean;
  /** Off for cards inside a hairline grid, where a lift would break the seam. */
  lift?: boolean;
  spotlight?: boolean;
  as?: 'div' | 'article' | 'li';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverCapable, setHoverCapable] = useState(false);

  useEffect(() => {
    // A finger has no hover state, so tracking it would light the card at the
    // moment of the tap and then strand the highlight there.
    setHoverCapable(
      window.matchMedia('(hover: hover) and (pointer: fine)').matches
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
  }, []);

  const onMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Written straight to custom properties rather than through state: this
    // fires on every pointer move, and a re-render per frame would be absurd.
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  }, []);

  const t = TONE[tone];

  return (
    <Tag
      // The element type is chosen by the caller, so the ref and the handler
      // are widened to HTMLElement rather than named per tag.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onPointerMove={(hoverCapable ? onMove : undefined) as any}
      className={[
        'group/card relative isolate min-w-0 overflow-hidden rounded-2xl border',
        SURFACE[surface], surface === 'dark' ? t.ringDark : t.ringLight,
        'transition-[transform,box-shadow,border-color] duration-300 ease-out',
        'motion-reduce:transition-none',
        lift ? 'hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(2,6,23,0.35)] motion-reduce:hover:translate-y-0' : '',
        padded ? 'p-6 lg:p-7' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      style={{ '--glow': t.glow } as CSSProperties}
    >
      {spotlight && hoverCapable && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100"
          style={{
            background:
              'radial-gradient(320px circle at var(--mx,50%) var(--my,50%), var(--glow), transparent 70%)',
          }}
        />
      )}
      {children}
    </Tag>
  );
}

/**
 * A grid whose children deal themselves in one after another.
 *
 * The stagger is capped: past about ten cards a per-index delay stops reading
 * as choreography and starts reading as a slow page.
 */
export function CardDeck({
  children,
  className,
  step = 70,
}: {
  children: ReactNode[];
  className?: string;
  step?: number;
}) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <DealtCard key={i} delay={Math.min(i, 9) * step}>{child}</DealtCard>
      ))}
    </div>
  );
}

/**
 * One card's entrance: it rises, un-tilts and settles.
 *
 * Fails safe in the same way Reveal does — the hidden state is only applied
 * once we know an observer exists to undo it, so no-JS and reduced-motion
 * visitors get the content immediately rather than an invisible page.
 */
export function DealtCard({
  children, delay = 0, className,
}: {
  children: ReactNode; delay?: number; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches
        || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    setArmed(true);

    let timer: ReturnType<typeof setTimeout>;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      io.disconnect();
      timer = setTimeout(() => setShown(true), delay);
    }, { threshold: 0.12, rootMargin: '0px 0px -4% 0px' });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(timer); };
  }, [delay]);

  const hidden = armed && !shown;

  return (
    <div
      ref={ref}
      className={[
        'min-w-0 transition-all duration-[620ms] motion-reduce:transition-none',
        '[transition-timing-function:cubic-bezier(0.22,1,0.36,1)]',
        hidden ? 'translate-y-6 scale-[0.97] opacity-0' : 'translate-y-0 scale-100 opacity-100',
        className ?? '',
      ].join(' ')}
      // The perspective lives on the child so a tilted card has depth without
      // the parent grid needing a 3-D context of its own.
      style={hidden
        ? { transform: 'perspective(900px) rotateX(7deg) translate3d(0,24px,0) scale(0.97)' }
        : { transform: 'perspective(900px) rotateX(0deg) translate3d(0,0,0) scale(1)' }}
    >
      {children}
    </div>
  );
}

/**
 * The page-level panel. Each section sits on its own raised surface, which is
 * what turns a run of full-bleed bands into a stack of cards.
 */
export function SitePanel({
  children, className, tone = 'light', id,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'light' | 'dark' | 'gradient';
  id?: string;
}) {
  const surface = tone === 'dark'
    ? 'bg-slate-950 text-white border-white/10'
    : tone === 'gradient'
      ? 'bg-brand-gradient text-white border-transparent'
      : 'bg-[hsl(var(--surface))] border-[hsl(var(--border))]';

  return (
    <section
      id={id}
      className={[
        'relative isolate mx-auto w-full max-w-[92rem] scroll-mt-24 overflow-hidden',
        'rounded-3xl border shadow-[0_24px_60px_-30px_rgba(2,6,23,0.28)]',
        surface,
        'px-5 py-12 sm:px-8 lg:px-12 lg:py-16',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </section>
  );
}
