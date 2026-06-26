#!/usr/bin/env node
/**
 * Generate the DigiLog 360 mobile app icon — a bright blue circle with a soft
 * radial glow on a deep navy background, with a white shield mark centred.
 * Mirrors the reference image the user supplied.
 *
 * Outputs (all 1024×1024 PNG):
 *   assets/icon.png            — iOS / general app icon
 *   assets/adaptive-icon.png   — Android adaptive foreground
 *   assets/notification-icon.png (96×96, white shield on transparent)
 *
 * Run:  node scripts/gen-icon.mjs
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../assets');

const SIZE = 1024;

// Shield path scaled into a 1024 canvas, centred. Classic security shield:
// flat top, curved shoulders, pointed bottom, with a check-tick cut-out.
const shieldPath = `
  M512 250
  C512 250 660 300 700 312
  C712 316 716 322 716 334
  L716 560
  C716 680 620 752 512 800
  C404 752 308 680 308 560
  L308 334
  C308 322 312 316 324 312
  C364 300 512 250 512 250
  Z
`;

// White check-tick inside the shield.
const tickPath = `
  M430 520
  L488 580
  L600 460
`;

const svg = `
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bgGlow" cx="50%" cy="46%" r="55%">
      <stop offset="0%"  stop-color="#15407f"/>
      <stop offset="45%" stop-color="#0e2350"/>
      <stop offset="100%" stop-color="#0b1020"/>
    </radialGradient>
    <radialGradient id="discGlow" cx="50%" cy="42%" r="60%">
      <stop offset="0%"  stop-color="#3b82f6"/>
      <stop offset="60%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </radialGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="60" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
      </feMerge>
    </filter>
  </defs>

  <!-- deep navy background -->
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bgGlow)"/>

  <!-- blurred glow halo behind the disc -->
  <circle cx="512" cy="470" r="300" fill="#2563eb" opacity="0.55" filter="url(#soft)"/>

  <!-- the bright blue disc -->
  <circle cx="512" cy="470" r="250" fill="url(#discGlow)"/>
  <circle cx="512" cy="470" r="250" fill="none" stroke="#60a5fa" stroke-opacity="0.35" stroke-width="6"/>

  <!-- white shield mark -->
  <g transform="translate(0 -10) scale(0.62) translate(316 300)">
    <path d="${shieldPath}" fill="#ffffff"/>
    <path d="${tickPath}" fill="none" stroke="#2563eb" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
`;

// Notification icon — flat white shield on transparent (Android tints it).
const notifSvg = `
<svg width="96" height="96" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <g transform="scale(0.78) translate(144 130)">
    <path d="${shieldPath}" fill="#ffffff"/>
  </g>
</svg>
`;

async function main() {
  await sharp(Buffer.from(svg)).png().toFile(resolve(assets, 'icon.png'));
  await sharp(Buffer.from(svg)).png().toFile(resolve(assets, 'adaptive-icon.png'));
  await sharp(Buffer.from(notifSvg)).resize(96, 96).png().toFile(resolve(assets, 'notification-icon.png'));
  console.log('✓ Wrote icon.png, adaptive-icon.png (1024×1024) + notification-icon.png (96×96)');
}

main().catch((e) => { console.error('✗ icon gen failed:', e); process.exit(1); });
