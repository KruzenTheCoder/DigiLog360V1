/**
 * The site's motion tokens — one source of truth for every duration, curve,
 * stagger and viewport threshold used by the marketing site.
 *
 * Why this file exists: before it, timing was decided at the call site.
 * `animationDelay: '180ms'`, `'300ms'`, `'420ms'`, `duration-700`, and four
 * different cubic-beziers spread through globals.css with no names. That is
 * survivable while one person holds it in their head and unmaintainable the
 * moment anyone else touches it — and it means the site has no recognisable
 * motion signature, because nothing is deliberately shared.
 *
 * The values below are the ones already in use, named and grouped. Adopting
 * this file is therefore a refactor, not a redesign: existing animations keep
 * their exact feel.
 *
 * ── The idea the motion carries ──────────────────────────────────────────
 * This is a security operations platform and its proposition is time: an
 * incident reaches the control room while it is still happening. So the motion
 * language is arrival and resolution — things enter with intent, settle
 * precisely, and then hold still. Almost no overshoot, no bounce, no aimless
 * drift. `EASE.enter` is the spine of that idea and should be the default
 * choice unless there is a reason to reach for another curve.
 *
 * ── Keeping CSS and TS in step ───────────────────────────────────────────
 * Most of the site animates in CSS, so globals.css carries a mirror of these
 * values as custom properties under `:root`. This module is the source of
 * truth; if you change a number here, change it there. They are checked
 * against each other by `motion.test.ts` so the two cannot drift silently.
 */

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

/**
 * Milliseconds. The scale is deliberately coarse — seven steps, not a
 * continuum. If a value between two steps feels necessary, the animation is
 * usually doing something the hierarchy did not intend.
 */
export const DURATION = {
  /** Focus rings, pressed states. Below this the change is not perceived. */
  instant: 90,
  /** Hover, icon travel, nav underline. Must feel like a direct response. */
  micro: 160,
  /** Buttons, chips, small toggles. */
  quick: 260,
  /** Cards, list rows, images entering. The workhorse. */
  element: 420,
  /** Section content and editorial text arriving. */
  reveal: 640,
  /** Hero lines, mask wipes — a move you are meant to watch. */
  sequence: 900,
  /** Hero establishing shots and scene changes. Use sparingly. */
  cinematic: 1200,
} as const;

/** Ambient loops. Long, and deliberately not multiples of one another. */
export const AMBIENT = {
  /** Hero aurora drift. */
  aurora: 26_000,
  /** Radar sweep. */
  sweep: 19_000,
  /** Edge sheen on panels. */
  sheen: 6_000,
  /** Scroll cue run. */
  cue: 2_400,
} as const;

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

/**
 * Each curve has a job. The names describe the job, not the shape, so a call
 * site reads as intent: `EASE.enter` rather than `cubic-bezier(0.16, 1, …)`.
 *
 * One rule worth stating plainly: `linear` belongs to scroll-linked animation
 * and nowhere else. Time-based linear motion is the single most reliable way
 * to make an interface feel mechanical.
 */
export const EASE = {
  /** Leaving — accelerates away. Nothing should exit slowly. */
  exit: 'cubic-bezier(0.55, 0, 1, 0.45)',
  /** Arriving — decisive, settles firmly, no overshoot. The spine. */
  enter: 'cubic-bezier(0.16, 1, 0.30, 1)',
  /** Travelling in place — symmetric, for things that move rather than appear. */
  move: 'cubic-bezier(0.65, 0, 0.35, 1)',
  /** Hover and press. Fast out of the gate, no overshoot at all. */
  ui: 'cubic-bezier(0.30, 0, 0.20, 1)',
  /** Slow ambient loops — sinusoidal, so a repeat is not visible as a beat. */
  ambient: 'cubic-bezier(0.45, 0, 0.55, 1)',
  /** Scroll-linked only. Progress is the clock; the curve must not fight it. */
  scrub: 'linear',
} as const;

// ---------------------------------------------------------------------------
// Stagger
// ---------------------------------------------------------------------------

/**
 * The gap between consecutive children in a sequence.
 *
 * Stagger is what turns a group of elements into a sentence — the eye follows
 * the order instead of being handed everything at once. Too tight and it reads
 * as a single event; too loose and the visitor starts waiting.
 */
export const STAGGER = {
  /** Chips, dense list rows. */
  tight: 45,
  /** Cards, stat columns. */
  normal: 80,
  /** Hero headline lines — slow enough to read as separate statements. */
  editorial: 120,
  /** Between whole stages of a choreographed hero entrance. */
  scene: 220,
} as const;

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------

/**
 * When a scroll-triggered reveal fires.
 *
 * The negative bottom margin holds the trigger back slightly, so an element
 * animates as it comes properly into view rather than the instant its top edge
 * crosses the fold — which reads as firing early.
 */
export const VIEWPORT = {
  /** Fraction of the element that must be visible. */
  threshold: 0.18,
  rootMargin: '0px 0px -8% 0px',
} as const;

/** Headings use a higher threshold so the wipe starts when the line is read. */
export const VIEWPORT_HEADING = {
  threshold: 0.35,
  rootMargin: '0px 0px -8% 0px',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Delay for the nth item in a staggered group.
 *
 * `stagger(2, 'normal', 400)` → the third item, 80ms apart, after a 400ms lead.
 */
export function stagger(
  index: number,
  gap: keyof typeof STAGGER = 'normal',
  base = 0,
): number {
  return base + index * STAGGER[gap];
}

/** `transition` shorthand built from the tokens, for inline styles. */
export function transition(
  property: string,
  duration: keyof typeof DURATION = 'element',
  ease: keyof typeof EASE = 'enter',
): string {
  return `${property} ${DURATION[duration]}ms ${EASE[ease]}`;
}

export type DurationToken = keyof typeof DURATION;
export type EaseToken = keyof typeof EASE;
export type StaggerToken = keyof typeof STAGGER;
