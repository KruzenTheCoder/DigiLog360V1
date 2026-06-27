#!/usr/bin/env node
/**
 * Regenerate the NATIVE Android launcher icons from the padded brand images.
 *
 * This project is prebuilt (has an android/ folder), so the launcher icon
 * comes from android/app/src/main/res/mipmap-*  — NOT app.json. We rewrite
 * every density's ic_launcher / ic_launcher_round (legacy) and
 * ic_launcher_foreground (adaptive) as webp, from the padded sources, so the
 * whole logo shows with a border and nothing clips.
 *
 * Run: node scripts/regen-native-icons.mjs
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const A = resolve(here, '../assets/branding');
const RES = resolve(here, '../android/app/src/main/res');

const LEGACY_SRC = resolve(A, 'digilog-app-icon-padded.png');        // navy bg + border + logo
const FG_SRC = resolve(A, 'digilog-adaptive-foreground-padded.png'); // transparent + logo (~64%)

// Legacy launcher icon densities (48dp base).
const LAUNCHER = { 'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96, 'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192 };
// Adaptive foreground densities (108dp base).
const FOREGROUND = { 'mipmap-mdpi': 108, 'mipmap-hdpi': 162, 'mipmap-xhdpi': 216, 'mipmap-xxhdpi': 324, 'mipmap-xxxhdpi': 432 };

async function main() {
  for (const [dir, px] of Object.entries(LAUNCHER)) {
    const buf = await sharp(LEGACY_SRC).resize(px, px).webp({ quality: 95 }).toBuffer();
    await sharp(buf).toFile(resolve(RES, dir, 'ic_launcher.webp'));
    await sharp(buf).toFile(resolve(RES, dir, 'ic_launcher_round.webp'));
  }
  for (const [dir, px] of Object.entries(FOREGROUND)) {
    const buf = await sharp(FG_SRC).resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 95 }).toBuffer();
    await sharp(buf).toFile(resolve(RES, dir, 'ic_launcher_foreground.webp'));
  }
  console.log('✓ Regenerated native launcher icons (ic_launcher / _round / _foreground) for all densities');
}

main().catch((e) => { console.error('✗ regen-native-icons failed:', e); process.exit(1); });
