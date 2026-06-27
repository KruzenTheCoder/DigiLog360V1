#!/usr/bin/env node
/**
 * Build the definitive DigiLog launcher icon set from the transparent brand
 * mark. This keeps the round arrows large enough to read well in the Android
 * app drawer without baking in an extra frame around them.
 *
 * Outputs:
 *   assets/branding/digilog-icon.png             square icon on navy
 *   assets/branding/digilog-icon-foreground.png  transparent adaptive layer
 *
 * Source:
 *   assets/branding/digilog-logo.png
 *
 * Run: node scripts/build-icon.mjs
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const A = resolve(here, '../assets/branding');
const SIZE = 1024;
const SOURCE = resolve(A, 'digilog-logo.png');
const APP_OUT = resolve(A, 'digilog-icon.png');
const FG_OUT = resolve(A, 'digilog-icon-foreground.png');
const NAVY = { r: 11, g: 16, b: 32, alpha: 1 }; // #0b1020
const LOGO_FRACTION = 0.84;

async function main() {
  const logo = await sharp(SOURCE)
    .trim()
    .resize({ width: Math.round(SIZE * LOGO_FRACTION), fit: 'inside' })
    .toBuffer();

  const icon = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: NAVY } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer();

  const foreground = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer();

  await sharp(icon).toFile(APP_OUT);
  await sharp(foreground).toFile(FG_OUT);
  console.log('✓ Wrote digilog-icon.png and digilog-icon-foreground.png');
}

main().catch((e) => { console.error('✗ failed:', e); process.exit(1); });
