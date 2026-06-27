#!/usr/bin/env node
/**
 * Build the definitive DigiLog launcher icon set from the approved Play Store
 * artwork supplied by the user. This keeps the APK/app-drawer icon chain tied
 * to one source file only.
 *
 * Outputs:
 *   assets/branding/digilog-icon.png             square icon on navy
 *   assets/branding/digilog-icon-foreground.png  transparent adaptive layer
 *
 * Source:
 *   assets/branding/playstore (1).png
 *
 * Run: node scripts/build-icon.mjs
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const A = resolve(here, '../assets/branding');
const SIZE = 1024;
const SOURCE = resolve(A, 'playstore (1).png');
const APP_OUT = resolve(A, 'digilog-icon.png');
const FG_OUT = resolve(A, 'digilog-icon-foreground.png');
const BG_THRESHOLD = 12;

function nearBg(data, idx, bg) {
  return (
    Math.abs(data[idx] - bg.r) <= BG_THRESHOLD &&
    Math.abs(data[idx + 1] - bg.g) <= BG_THRESHOLD &&
    Math.abs(data[idx + 2] - bg.b) <= BG_THRESHOLD
  );
}

async function main() {
  const square = await sharp(SOURCE)
    .resize(SIZE, SIZE)
    .png()
    .toBuffer();

  const { data, info } = await sharp(square)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bg = {
    r: data[0],
    g: data[1],
    b: data[2],
  };

  // Remove only the light background that is connected to the outer edges,
  // so internal white details in the artwork stay intact.
  const visited = new Uint8Array(info.width * info.height);
  const stack = [];

  function push(x, y) {
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return;
    const pixelIndex = y * info.width + x;
    if (visited[pixelIndex]) return;
    visited[pixelIndex] = 1;
    const idx = pixelIndex * info.channels;
    if (nearBg(data, idx, bg)) {
      stack.push(pixelIndex);
    }
  }

  for (let x = 0; x < info.width; x += 1) {
    push(x, 0);
    push(x, info.height - 1);
  }
  for (let y = 0; y < info.height; y += 1) {
    push(0, y);
    push(info.width - 1, y);
  }

  while (stack.length) {
    const pixelIndex = stack.pop();
    const idx = pixelIndex * info.channels;
    data[idx + 3] = 0;

    const x = pixelIndex % info.width;
    const y = Math.floor(pixelIndex / info.width);
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  const foreground = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();

  await sharp(square).toFile(APP_OUT);
  await sharp(foreground).toFile(FG_OUT);
  console.log(`✓ Wrote digilog-icon.png and digilog-icon-foreground.png from playstore (1).png with bg rgb(${bg.r}, ${bg.g}, ${bg.b})`);
}

main().catch((e) => { console.error('✗ failed:', e); process.exit(1); });
