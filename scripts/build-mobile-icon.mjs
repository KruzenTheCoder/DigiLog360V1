#!/usr/bin/env node
/**
 * Generate the mobile launcher icon — a glowing shield in a blue circle
 * on a dark backdrop, matching the in-app login mark.
 *
 *   • assets/icon.png            — full square icon with backdrop + glow
 *   • assets/adaptive-icon.png   — foreground only (Android masks separately)
 *   • assets/notification-icon.png — single-colour silhouette for status bar
 *
 * Run:
 *   node scripts/build-mobile-icon.mjs
 */
import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../apps/mobile/assets');

// ---------------------------------------------------------------------------
// SVGs
// ---------------------------------------------------------------------------

// Full launcher icon — dark navy backdrop + radial blue glow + bright blue
// circle in the centre with a white shield inside.
function fullIconSvg(size) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${size}" height="${size}">
  <defs>
    <!-- Soft outer glow — bright at the orb edge, dissolves into the dark
         backdrop. Wide radius so it spreads almost to the canvas edges. -->
    <radialGradient id="glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%"   stop-color="#4ea1ff" stop-opacity="0.95"/>
      <stop offset="35%"  stop-color="#1e6ee0" stop-opacity="0.55"/>
      <stop offset="70%"  stop-color="#0e2a78" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#0b1020" stop-opacity="0"/>
    </radialGradient>
    <!-- Orb gradient — light top, deep bottom, off-centre for highlight. -->
    <radialGradient id="orb" cx="38%" cy="34%" r="80%">
      <stop offset="0%"   stop-color="#74b3ff"/>
      <stop offset="55%"  stop-color="#2278f4"/>
      <stop offset="100%" stop-color="#1153c7"/>
    </radialGradient>
  </defs>
  <!-- Dark navy backdrop. -->
  <rect width="1024" height="1024" fill="#0b1020"/>
  <!-- Glow halo. -->
  <circle cx="512" cy="512" r="500" fill="url(#glow)"/>
  <!-- Blue orb. -->
  <circle cx="512" cy="512" r="270" fill="url(#orb)"/>
  <!-- White shield mark, centred. -->
  ${shieldPath('#ffffff', 512, 512, 240)}
</svg>`;
}

// Adaptive (Android) — foreground only. Android applies its own bg colour
// + the OS mask, so we draw the orb + shield without the dark backdrop.
// We pad heavily because Android crops ~33% off the edges for safe area.
function adaptiveIconSvg(size) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${size}" height="${size}">
  <defs>
    <radialGradient id="orb" cx="38%" cy="34%" r="80%">
      <stop offset="0%"   stop-color="#74b3ff"/>
      <stop offset="55%"  stop-color="#2278f4"/>
      <stop offset="100%" stop-color="#1153c7"/>
    </radialGradient>
  </defs>
  <!-- Smaller orb to stay inside the Android safe area (~66% of the canvas). -->
  <circle cx="512" cy="512" r="220" fill="url(#orb)"/>
  ${shieldPath('#ffffff', 512, 512, 195)}
</svg>`;
}

// Notification icon — single-colour silhouette, transparent bg.
function notificationIconSvg(size) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="${size}" height="${size}">
  <rect width="96" height="96" fill="none"/>
  ${shieldPath('#ffffff', 48, 48, 36)}
</svg>`;
}

// Generic rounded-square shield centred at (cx, cy) with given height.
// White-filled by default; the icon's blue orb sits behind it.
function shieldPath(fill, cx, cy, height) {
  const w = height * 0.86;   // shield is slightly narrower than tall
  const x = cx - w / 2;
  const y = cy - height / 2;
  // Path: rounded top, tapered curved bottom (classic security-shield silhouette).
  return `
  <path
    d="M ${cx} ${y}
       Q ${cx + w / 2} ${y + height * 0.05} ${cx + w / 2} ${y + height * 0.18}
       L ${cx + w / 2} ${y + height * 0.55}
       Q ${cx + w / 2} ${y + height * 0.85} ${cx} ${y + height}
       Q ${x}        ${y + height * 0.85} ${x}        ${y + height * 0.55}
       L ${x}        ${y + height * 0.18}
       Q ${x}        ${y + height * 0.05} ${cx}      ${y}
       Z"
    fill="${fill}"
    stroke="${fill}"
    stroke-width="2"
    stroke-linejoin="round"
  />`;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

async function render(name, svg) {
  const out = resolve(assets, name);
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log('✓ wrote', out);
}

await render('icon.png',              fullIconSvg(1024));
await render('adaptive-icon.png',     adaptiveIconSvg(1024));
await render('notification-icon.png', notificationIconSvg(96));

console.log('\nDone. Run `npx expo start --clear` to flush the cached icon.');
