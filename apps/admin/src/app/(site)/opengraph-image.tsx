import { ImageResponse } from 'next/og';
import { BRAND } from '@digilog/shared';

/**
 * The card a shared link unfurls into.
 *
 * Generated rather than exported from a design tool, so it can never go stale
 * against the brand tokens — the gradient and the wordmark come from the same
 * BRAND constant the site renders with. Drawn once per deploy and cached at
 * the edge; no request cost worth thinking about.
 *
 * Composition mirrors the home hero: the brand gradient as the world, the
 * wordmark, the one-line pitch, and the stat that carries the whole argument.
 * Everything is system-drawable — no fonts to load, no images to fetch —
 * because a preview bot gives this route about a second of patience.
 */

export const alt = `${BRAND.name} — ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 84px',
          background: `linear-gradient(135deg, ${BRAND.gradientFrom} 0%, ${BRAND.gradientTo} 100%)`,
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Wordmark, set like the logo: bold name, light suffix. */}
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: '-0.02em' }}>DigiLog</span>
          <span style={{ fontSize: 56, fontWeight: 300, opacity: 0.85 }}>360</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 88,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
              maxWidth: 900,
            }}
          >
            Know what happened. While it is still happening.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 54, fontWeight: 800 }}>&lt;60s</span>
            <span style={{ fontSize: 22, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Field to control room
            </span>
          </div>
          <div style={{ width: 2, height: 72, background: 'rgba(255,255,255,0.35)' }} />
          <span style={{ fontSize: 28, opacity: 0.9, maxWidth: 620, lineHeight: 1.4 }}>
            The occurrence book, patrol clock, visitor register and key ledger — one live system.
          </span>
        </div>
      </div>
    ),
    size,
  );
}
