/**
 * Generate the production icon / adaptive-icon / splash assets from the
 * DigiLog brand source art. Run with: `node scripts/gen-brand-assets.js`.
 *
 * Source art:
 *   assets/branding/digilog-logo.png  — the shield "mark" (transparent)
 *   assets/branding/digilog-mark.png  — the "DigiLog360" wordmark (transparent)
 *
 * Outputs (committed, referenced from app.json):
 *   assets/icon.png            1024×1024  store / iOS icon (gradient + shield)
 *   assets/adaptive-icon.png   1024×1024  Android adaptive foreground (shield, safe-zone padded)
 *   assets/notification-icon.png 96×96    Android status-bar icon (white silhouette)
 *   assets/splash.png          1284×2778  premium splash (gradient + glow + shield + wordmark)
 *   assets/splash-bg.png       1284×2778  gradient-only backdrop (used by the in-app splash)
 */
const sharp = require('sharp');
const path = require('path');

const BRAND = { from: '#667eea', to: '#764ba2' };
const DARK = { top: '#141b33', mid: '#0e1426', bottom: '#0b1020' };

const dir = (...p) => path.join(__dirname, '..', ...p);
const SHIELD = dir('assets', 'branding', 'digilog-logo.png');
const WORDMARK = dir('assets', 'branding', 'digilog-mark.png');

// ---- icon.png : 1024 square, diagonal brand gradient + centered shield ----
async function icon() {
  const SIZE = 1024;
  const bg = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0" stop-color="${BRAND.from}"/>
           <stop offset="1" stop-color="${BRAND.to}"/>
         </linearGradient>
         <radialGradient id="glow" cx="0.5" cy="0.42" r="0.6">
           <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/>
           <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
         </radialGradient>
       </defs>
       <rect width="${SIZE}" height="${SIZE}" rx="0" fill="url(#g)"/>
       <rect width="${SIZE}" height="${SIZE}" fill="url(#glow)"/>
     </svg>`,
  );
  const shieldW = 660;
  const shield = await sharp(SHIELD).resize({ width: shieldW }).toBuffer();
  const meta = await sharp(shield).metadata();
  await sharp(bg)
    .composite([{ input: shield, left: Math.round((SIZE - shieldW) / 2), top: Math.round((SIZE - meta.height) / 2) }])
    .png()
    .toFile(dir('assets', 'icon.png'));
}

// ---- adaptive-icon.png : full-bleed gradient (matches iOS icon) with the
// shield kept inside Android's inner 66% safe zone so the launcher mask
// (circle / squircle / rounded-square) never clips it. ----
async function adaptiveIcon() {
  const SIZE = 1024;
  const bg = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0" stop-color="${BRAND.from}"/>
           <stop offset="1" stop-color="${BRAND.to}"/>
         </linearGradient>
         <radialGradient id="glow" cx="0.5" cy="0.42" r="0.6">
           <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/>
           <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
         </radialGradient>
       </defs>
       <rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>
       <rect width="${SIZE}" height="${SIZE}" fill="url(#glow)"/>
     </svg>`,
  );
  const shieldW = 520; // well within the 66% safe zone (~676px)
  const shield = await sharp(SHIELD).resize({ width: shieldW }).toBuffer();
  const meta = await sharp(shield).metadata();
  await sharp(bg)
    .composite([{ input: shield, left: Math.round((SIZE - shieldW) / 2), top: Math.round((SIZE - meta.height) / 2) }])
    .png()
    .toFile(dir('assets', 'adaptive-icon.png'));
}

// ---- notification-icon.png : 96px white silhouette of the shield ----
async function notificationIcon() {
  const SIZE = 96;
  // Android renders notification icons as a flat white mask using the alpha
  // channel only. Take the shield's alpha and paint it solid white.
  const shield = await sharp(SHIELD).resize({ width: Math.round(SIZE * 0.86) }).ensureAlpha();
  const { data, info } = await shield.raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = 255; out[i + 1] = 255; out[i + 2] = 255; out[i + 3] = data[i + 3];
  }
  const white = await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: white, gravity: 'center' }])
    .png()
    .toFile(dir('assets', 'notification-icon.png'));
}

// ---- splash backdrop : premium dark gradient + soft brand glow ----
function splashBackgroundSvg(W, H) {
  return Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
       <defs>
         <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0" stop-color="${DARK.top}"/>
           <stop offset="0.55" stop-color="${DARK.mid}"/>
           <stop offset="1" stop-color="${DARK.bottom}"/>
         </linearGradient>
         <radialGradient id="brandGlow" cx="0.5" cy="0.4" r="0.55">
           <stop offset="0" stop-color="${BRAND.from}" stop-opacity="0.30"/>
           <stop offset="0.6" stop-color="${BRAND.to}" stop-opacity="0.10"/>
           <stop offset="1" stop-color="${BRAND.to}" stop-opacity="0"/>
         </radialGradient>
       </defs>
       <rect width="${W}" height="${H}" fill="url(#bg)"/>
       <rect width="${W}" height="${H}" fill="url(#brandGlow)"/>
     </svg>`,
  );
}

async function splashBg() {
  const W = 1284, H = 2778;
  await sharp(splashBackgroundSvg(W, H)).png().toFile(dir('assets', 'splash-bg.png'));
}

// ---- splash.png : native splash — gradient + shield + wordmark, centered ----
async function splash() {
  const W = 1284, H = 2778;
  const bg = splashBackgroundSvg(W, H);
  const shieldW = 460;
  const shield = await sharp(SHIELD).resize({ width: shieldW }).toBuffer();
  const sMeta = await sharp(shield).metadata();
  const markW = 620;
  const mark = await sharp(WORDMARK).resize({ width: markW }).toBuffer();
  const mMeta = await sharp(mark).metadata();

  const blockH = sMeta.height + 56 + mMeta.height;
  const top = Math.round((H - blockH) / 2) - 80;
  await sharp(bg)
    .composite([
      { input: shield, left: Math.round((W - shieldW) / 2), top },
      { input: mark, left: Math.round((W - markW) / 2), top: top + sMeta.height + 56 },
    ])
    .png()
    .toFile(dir('assets', 'splash.png'));
}

(async () => {
  await icon();
  await adaptiveIcon();
  await notificationIcon();
  await splashBg();
  await splash();
  console.log('✓ brand assets generated into apps/mobile/assets/');
})().catch((e) => { console.error(e); process.exit(1); });
