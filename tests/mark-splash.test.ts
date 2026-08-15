import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MARK_BRAND_HEX } from '../apps/admin/src/components/landing/mark-splash';

/**
 * The marker splash is an SVG data URI, and a data URI cannot contain a CSS
 * variable — so the brand colour has to be written into the artwork as a
 * literal. That is a copy of a design token living somewhere the token system
 * cannot reach it, which is exactly the kind of thing that drifts silently:
 * somebody adjusts `--brand`, every button and link follows, and the one
 * highlighted phrase on the page quietly stays the old colour.
 *
 * So the literals are asserted against the tokens they were derived from.
 */

const CSS = readFileSync(
  resolve(__dirname, '../apps/admin/src/app/globals.css'),
  'utf8',
);

/** Pull `--brand: <h> <s>% <l>%` out of a named block. */
function brandToken(block: 'root' | 'dark'): [number, number, number] {
  const scope = block === 'root' ? ':root\\s*{' : 'html\\.dark\\s*{';
  const m = CSS.match(new RegExp(`${scope}[^}]*?--brand:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`, 's'));
  if (!m) throw new Error(`--brand not found in ${block}`);
  return [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100];
}

/** The same conversion a browser does for `hsl()`. */
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const [r, g, b] = (
    [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]] as const
  )[seg]!;
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

describe('mark splash: baked brand colour matches the token', () => {
  it('light theme literal equals --brand in :root', () => {
    const [h, s, l] = brandToken('root');
    expect(
      MARK_BRAND_HEX.light.toLowerCase(),
      'BRAND_HEX in block-reveal.tsx has drifted from --brand',
    ).toBe(hslToHex(h, s, l));
  });

  it('dark theme literal equals --brand in html.dark', () => {
    const [h, s, l] = brandToken('dark');
    expect(
      MARK_BRAND_HEX.dark.toLowerCase(),
      'BRAND_HEX_DARK in block-reveal.tsx has drifted from --brand',
    ).toBe(hslToHex(h, s, l));
  });

  it('the two themes really are different, or one of the copies is pointless', () => {
    expect(MARK_BRAND_HEX.light).not.toBe(MARK_BRAND_HEX.dark);
  });
});
