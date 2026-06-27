#!/usr/bin/env node
/**
 * Build the definitive DigiLog launcher icon set from the approved DigiLogIconV2
 * artwork supplied by the user. This keeps the APK/app-drawer icon chain tied
 * to one source file only, while adding explicit adaptive-icon padding so
 * Android does not visually zoom the icon too far in.
 *
 * Outputs:
 *   assets/branding/digilog-icon.png             square store/app icon
 *   assets/branding/digilog-icon-foreground.png  transparent adaptive layer
 *
 * Source:
 *   assets/branding/DigilogIconV2.jpg
 *
 * Run: node scripts/build-icon.mjs
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const A = resolve(here, '../assets/branding');
const SIZE = 1024;
const SOURCE = resolve(A, 'DigilogIconV2.jpg');
const APP_OUT = resolve(A, 'digilog-icon.png');
const FG_OUT = resolve(A, 'digilog-icon-foreground.png');
const ADAPTIVE_FRACTION = 0.82;

async function main() {
  const { data } = await sharp(SOURCE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bg = {
    r: data[0],
    g: data[1],
    b: data[2],
  };

  const square = await sharp(SOURCE)
    .resize(SIZE, SIZE, {
      fit: 'contain',
      background: { ...bg, alpha: 1 },
    })
    .png()
    .toBuffer();

  const inset = Math.round(SIZE * ADAPTIVE_FRACTION);
  const insetIcon = await sharp(SOURCE)
    .resize(inset, inset, {
      fit: 'contain',
      background: { ...bg, alpha: 1 },
    })
    .png()
    .toBuffer();

  const foreground = await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: insetIcon, gravity: 'center' }])
    .png()
    .toBuffer();

  await sharp(square).toFile(APP_OUT);
  await sharp(foreground).toFile(FG_OUT);
  console.log(`✓ Wrote digilog-icon.png and digilog-icon-foreground.png from DigilogIconV2.jpg with bg rgb(${bg.r}, ${bg.g}, ${bg.b}) and adaptive fraction ${ADAPTIVE_FRACTION}`);
}

main().catch((e) => { console.error('✗ failed:', e); process.exit(1); });
