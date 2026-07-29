/**
 * Copy our patched expo-camera Kotlin files over the copies in node_modules.
 *
 * WHY THIS EXISTS (and why it is not patch-package)
 * -------------------------------------------------
 * An SA driver's licence PDF417 carries an ENCRYPTED binary payload, so it can
 * only be decrypted from the barcode's exact bytes. Stock expo-camera decodes
 * ML Kit's result into a UTF-8 string, which destroys those bytes permanently.
 * Our change adds a `rawBase64` field that carries them intact across the
 * native bridge. Without it, licence scanning cannot work at all — the app
 * reports an unrecognised barcode forever.
 *
 * This was previously applied by patch-package from a `postinstall` script.
 * That shipped two production APKs with no patch in them, silently, because:
 *
 *   1. `apps/mobile` is not a member of the root npm workspaces, so an install
 *      driven from the repo root never runs this package's postinstall; and
 *   2. the script invoked the bare `patch-package` binary, which is not
 *      resolvable unless devDependencies happen to be installed — when it is
 *      missing the script fails rather than patching.
 *
 * Plain file copies with Node builtins have neither failure mode: no binary to
 * resolve, no fuzzy patch context to drift, and nothing to skip. Run from both
 * `postinstall` (local installs) and `eas-build-post-install` (EAS runs that
 * hook explicitly, in the project directory, regardless of workspace layout).
 *
 * TRADE-OFF: whole-file copies would silently mask an upstream update, so the
 * expo-camera version is pinned below and a mismatch is a hard failure. If you
 * bump expo-camera, re-vendor these files from the new version and update PINNED.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const PINNED = '17.0.10';
const MARKER = 'rawBase64';

const CAMERA = 'node_modules/expo-camera';
const BASE = `${CAMERA}/android/src/main/java/expo/modules/camera`;

const FILES = [
  ['BarCodeScannerResult.kt', `${BASE}/utils/BarCodeScannerResult.kt`],
  ['BarcodeScannerResultSerializer.kt', `${BASE}/analyzers/BarcodeScannerResultSerializer.kt`],
  ['BarcodeAnalyzer.kt', `${BASE}/analyzers/BarcodeAnalyzer.kt`],
];

function die(lines) {
  console.error('\n=============================================================');
  console.error(' NATIVE OVERRIDE FOR expo-camera COULD NOT BE APPLIED');
  console.error('=============================================================');
  console.error(lines.join('\n'));
  console.error('\nAn APK built without it compiles and runs, but driver\'s licence');
  console.error('scanning can NEVER work — the barcode bytes never reach JS.');
  console.error('=============================================================\n');
  process.exit(1);
}

// Nothing to do if expo-camera is not installed yet (e.g. a bare `npm ci` in a
// context that does not need it). Only fail when it is present but wrong.
const pkgPath = `${root}${CAMERA}/package.json`;
if (!existsSync(pkgPath)) {
  console.log('apply-native-overrides: expo-camera not installed, skipping');
  process.exit(0);
}

const installed = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
if (installed !== PINNED) {
  die([
    `  expo-camera is ${installed} but the vendored files were taken from ${PINNED}.`,
    '  Copying them over a different version could revert upstream fixes.',
    '',
    `  Fix: re-vendor from ${installed} into apps/mobile/native-overrides/expo-camera,`,
    '       then set PINNED in this script.',
  ]);
}

const copied = [];
for (const [src, dest] of FILES) {
  const srcPath = `${root}native-overrides/expo-camera/${src}`;
  const destPath = `${root}${dest}`;
  if (!existsSync(srcPath)) die([`  MISSING vendored file: native-overrides/expo-camera/${src}`]);
  if (!existsSync(destPath)) die([`  MISSING target in node_modules: ${dest}`]);
  writeFileSync(destPath, readFileSync(srcPath));
  copied.push(src);
}

// Read back from node_modules — proves the copy landed, not just that we tried.
const unverified = FILES
  .filter(([, dest]) => !readFileSync(`${root}${dest}`, 'utf8').includes(MARKER))
  .map(([src]) => src);
if (unverified.length > 0) {
  die([`  Copied but "${MARKER}" is still absent from: ${unverified.join(', ')}`]);
}

console.log(`apply-native-overrides: expo-camera ${installed} patched ✔ (${copied.length} files, "${MARKER}" verified)`);
