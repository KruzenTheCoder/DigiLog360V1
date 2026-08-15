/**
 * The artwork behind an emphasised phrase.
 *
 * A single path with uneven edges and slightly heavy ends, stretched to
 * whatever it sits behind (`preserveAspectRatio="none"`), so one shape serves
 * every phrase length. It is used as a background image rather than a mask,
 * because a mask would apply to the letterforms as well as the fill.
 *
 * This lives apart from the component that uses it for two reasons: it is data
 * and a string builder rather than anything React needs, and keeping it free
 * of path-aliased imports lets the drift test load it directly.
 */

export type Tone = 'brand' | 'dark' | 'light' | 'red' | 'green' | 'violet' | 'amber';

/** Flat fill per tone — also the fallback when the artwork cannot resolve. */
export const FILL: Record<Tone, string> = {
  brand: 'hsl(var(--brand))',
  dark: '#0f172a',
  light: '#ffffff',
  red: '#ef4444',
  green: '#10b981',
  violet: '#8b5cf6',
  amber: '#f59e0b',
};

/**
 * A data URI cannot contain a CSS variable, so the brand colour has to be
 * written into the artwork as a literal — and the token is a different
 * lightness per theme, so there are two.
 *
 * These are copies of a design token living where the token system cannot
 * reach them, which is exactly what drifts silently. `tests/mark-splash.test.ts`
 * converts `--brand` out of globals.css and asserts both match.
 */
const BRAND_HEX = '#7267e9';       // hsl(245 75% 66%) — :root
const BRAND_HEX_DARK = '#8379ec';  // hsl(245 75% 70%) — html.dark

/** Exposed so the drift test can check the literals above. */
export const MARK_BRAND_HEX = { light: BRAND_HEX, dark: BRAND_HEX_DARK } as const;

const SPLASH_PATH =
  'M8,44 C2,24 16,10 44,12 C78,2 112,18 150,10 C192,2 236,16 276,8 '
  + 'C304,4 322,18 318,40 C324,60 302,76 272,70 C234,80 192,64 152,72 '
  + 'C110,80 64,66 34,74 C14,76 2,62 8,44 Z';

export function splash(tone: Tone, dark = false): string {
  const fill = tone === 'brand'
    ? (dark ? BRAND_HEX_DARK : BRAND_HEX)
    : FILL[tone];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 326 84" preserveAspectRatio="none">`
    + `<path d="${SPLASH_PATH}" fill="${fill}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
