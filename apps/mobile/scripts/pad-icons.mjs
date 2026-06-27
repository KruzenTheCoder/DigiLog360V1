#!/usr/bin/env node
/**
 * Pad the DigiLog brand icon so the WHOLE image is visible on the launcher
 * (Android masks the adaptive foreground to a circle/squircle and zooms ~10%,
 * so content must live in the inner "safe zone"). We shrink the logo, centre
 * it on a navy background with a subtle border, and write padded variants:
 *
 *   digilog-app-icon-padded.png          → app.json  expo.icon  (iOS + dialog)
 *   digilog-adaptive-foreground-padded.png → android.adaptiveIcon.foregroundImage
 *
 * Originals are left untouched. Run: node scripts/pad-icons.mjs
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const A = resolve(here, '../assets/branding');
const SIZE = 1024;
const NAVY = { r: 11, g: 16, b: 32, alpha: 1 }; // #0b1020 — matches splash + adaptiveIcon bg

// The transparent logo (no baked background) — best source to re-pad.
const LOGO = resolve(A, 'digilog-adaptive-foreground.png');

async function compose({ logoFraction, navyBg, border }) {
  const target = Math.round(SIZE * logoFraction);
  // Trim the wide transparent margin baked into the source FIRST, otherwise
  // "resize to 60%" shrinks the whole padded canvas and the logo ends up tiny.
  const logo = await sharp(LOGO)
    .trim()
    .resize(target, target, { fit: 'inside', withoutEnlargement: false })
    .toBuffer();

  const layers = [{ input: logo, gravity: 'center' }];
  if (border) {
    const ring = Buffer.from(
      `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
         <rect x="44" y="44" width="${SIZE - 88}" height="${SIZE - 88}" rx="190"
               fill="none" stroke="#33538a" stroke-opacity="0.85" stroke-width="14"/>
       </svg>`,
    );
    layers.push({ input: ring, gravity: 'center' });
  }

  return sharp({
    create: {
      width: SIZE, height: SIZE, channels: 4,
      background: navyBg ? NAVY : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(layers).png().toBuffer();
}

async function main() {
  // App icon (iOS + install dialog): navy bg, logo ~72% (trimmed), soft border.
  const icon = await compose({ logoFraction: 0.72, navyBg: true, border: true });
  await sharp(icon).toFile(resolve(A, 'digilog-app-icon-padded.png'));

  // Android adaptive foreground: transparent, logo ~64% so it sits just inside
  // the mask's safe zone after the ~10% system zoom — nothing clips. Navy comes
  // from the adaptiveIcon.backgroundColor.
  const fg = await compose({ logoFraction: 0.64, navyBg: false, border: false });
  await sharp(fg).toFile(resolve(A, 'digilog-adaptive-foreground-padded.png'));

  console.log('✓ Wrote digilog-app-icon-padded.png + digilog-adaptive-foreground-padded.png');
}

main().catch((e) => { console.error('✗ pad-icons failed:', e); process.exit(1); });
