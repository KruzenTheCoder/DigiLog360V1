import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DURATION, EASE, STAGGER, stagger, transition,
} from '../apps/admin/src/config/motion';

/**
 * The motion tokens exist twice: as TypeScript in config/motion.ts, and as CSS
 * custom properties in globals.css. They have to, because most of the site
 * animates in a stylesheet while delays and staggers are computed in TS.
 *
 * Two copies of the same numbers is a drift risk, and drift here is the kind
 * that nobody notices — a heading easing slightly differently to the card
 * beneath it does not throw, it just quietly stops feeling designed. So the
 * copies are asserted against each other, in the same spirit as the existing
 * email-template sync check in CI.
 */

const CSS = readFileSync(
  resolve(__dirname, '../apps/admin/src/app/globals.css'),
  'utf8',
);

/** Read one custom property out of the `:root` block. */
function cssVar(name: string): string | null {
  const m = CSS.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  return m ? m[1]!.trim() : null;
}

describe('motion tokens: CSS mirrors TypeScript', () => {
  it('every duration token exists in CSS with the same value', () => {
    for (const [name, ms] of Object.entries(DURATION)) {
      const declared = cssVar(`dur-${name}`);
      expect(declared, `--dur-${name} missing from globals.css`).not.toBeNull();
      expect(declared, `--dur-${name} disagrees with DURATION.${name}`).toBe(`${ms}ms`);
    }
  });

  it('every easing token exists in CSS with the same curve', () => {
    for (const [name, curve] of Object.entries(EASE)) {
      const declared = cssVar(`ease-${name}`);
      expect(declared, `--ease-${name} missing from globals.css`).not.toBeNull();
      // Whitespace inside cubic-bezier(...) is not meaningful.
      expect(
        declared!.replace(/\s+/g, ''),
        `--ease-${name} disagrees with EASE.${name}`,
      ).toBe(curve.replace(/\s+/g, ''));
    }
  });

  it('every stagger token exists in CSS with the same value', () => {
    for (const [name, ms] of Object.entries(STAGGER)) {
      const declared = cssVar(`stagger-${name}`);
      expect(declared, `--stagger-${name} missing from globals.css`).not.toBeNull();
      expect(declared, `--stagger-${name} disagrees with STAGGER.${name}`).toBe(`${ms}ms`);
    }
  });
});

describe('motion language rules', () => {
  it('only the scrub easing is linear', () => {
    // Time-based linear motion is the most reliable way to make an interface
    // feel mechanical. It belongs to scroll-linked animation and nowhere else.
    const linear = Object.entries(EASE).filter(([, v]) => v === 'linear');
    expect(linear.map(([k]) => k)).toEqual(['scrub']);
  });

  it('durations increase monotonically through the scale', () => {
    // The scale is a hierarchy, not a bag of numbers: a "micro" interaction
    // must never be slower than an "element" one.
    const order = [
      'instant', 'micro', 'quick', 'element', 'reveal', 'sequence', 'cinematic',
    ] as const;
    const values = order.map((k) => DURATION[k]);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size, 'duration steps must be distinct').toBe(values.length);
  });

  it('no entrance easing overshoots', () => {
    // An overshoot puts the second control point's y above 1. The brief calls
    // for arrival and resolution, not bounce, so only deliberate exceptions
    // should ever exceed it — and there are currently none.
    for (const [name, curve] of Object.entries(EASE)) {
      if (curve === 'linear') continue;
      const nums = curve.match(/-?[\d.]+/g)!.map(Number);
      expect(nums, `${name} is not a 4-point cubic-bezier`).toHaveLength(4);
      expect(nums[3], `EASE.${name} overshoots`).toBeLessThanOrEqual(1);
      expect(nums[1], `EASE.${name} undershoots`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('helpers', () => {
  it('stagger spaces items by the named gap', () => {
    expect(stagger(0)).toBe(0);
    expect(stagger(1)).toBe(STAGGER.normal);
    expect(stagger(2, 'tight')).toBe(STAGGER.tight * 2);
    expect(stagger(2, 'normal', 400)).toBe(400 + STAGGER.normal * 2);
  });

  it('transition composes a valid shorthand from tokens', () => {
    expect(transition('opacity')).toBe(
      `opacity ${DURATION.element}ms ${EASE.enter}`,
    );
    expect(transition('transform', 'micro', 'ui')).toBe(
      `transform ${DURATION.micro}ms ${EASE.ui}`,
    );
  });
});
