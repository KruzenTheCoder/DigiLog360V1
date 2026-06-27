#!/usr/bin/env node
/**
 * Build the single, definitive DigiLog launcher icon:
 *   navy background + the guard/book logo zoomed out (fully visible inside the
 *   adaptive-icon safe zone) + a soft brand border.
 *
 * The logo is extracted from the existing launcher foreground (it sits on navy
 * inside a purple card there) and re-composited bigger on a clean canvas.
 *
 * Output (ONE image, used for both icon + adaptive foreground):
 *   assets/branding/digilog-icon.png
 *
 * Source: assets/branding/digilog-launcher-foreground.png (keep it).
 * Run: node scripts/build-icon.mjs
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const A = resolve(here, '../assets/branding');
const SIZE = 1024;
// Match the navy INSIDE the source logo card (#1c243e) so the cropped logo's
// background blends seamlessly into the canvas (no visible box).
const NAVY = { r: 28, g: 36, b: 62, alpha: 1 }; // #1c243e

// Crop just the logo out of the foreground (it's on navy inside the card),
// then scale it onto a clean navy canvas at a safe, fully-visible size.
const CROP = { left: 430, top: 418, width: 190, height: 200 };
const LOGO_FRACTION = 0.60; // ~60% of the canvas → whole logo inside the mask

async function main() {
  const logo = await sharp(resolve(A, 'digilog-launcher-foreground.png'))
    .extract(CROP)
    .resize({ width: Math.round(SIZE * LOGO_FRACTION), fit: 'inside' })
    .toBuffer();

  const ring = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
       <rect x="64" y="64" width="${SIZE - 128}" height="${SIZE - 128}" rx="210"
             fill="none" stroke="#3a5da0" stroke-opacity="0.7" stroke-width="12"/>
     </svg>`,
  );

  const out = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: NAVY } })
    .composite([{ input: logo, gravity: 'center' }, { input: ring, gravity: 'center' }])
    .png()
    .toBuffer();

  await sharp(out).toFile(resolve(A, 'digilog-icon.png'));
  console.log('✓ Wrote digilog-icon.png');
}

main().catch((e) => { console.error('✗ failed:', e); process.exit(1); });
