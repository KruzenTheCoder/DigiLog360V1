/**
 * Fail the install/build loudly if a required native patch is missing.
 *
 * The SA driver's licence payload is encrypted binary, so it can only be read
 * from the barcode's exact bytes. Stock expo-camera decodes ML Kit's result
 * into a UTF-8 string, which destroys those bytes; our patch adds a `rawBase64`
 * field carrying them intact.
 *
 * That patch lives in node_modules and is applied by patch-package on
 * postinstall. If it silently fails to apply — a skipped postinstall, a
 * dev-dependency-free install, a partially restored cache — the build still
 * succeeds and ships an APK whose licence scanner can never work, with no
 * error anywhere. That has already cost us a release cycle, so check it.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const REQUIRED = [
  {
    file: 'node_modules/expo-camera/android/src/main/java/expo/modules/camera/utils/BarCodeScannerResult.kt',
    marker: 'rawBase64',
    why: 'carries the barcode\'s exact bytes so an encrypted SA licence can be decrypted',
  },
  {
    file: 'node_modules/expo-camera/android/src/main/java/expo/modules/camera/analyzers/BarcodeScannerResultSerializer.kt',
    marker: 'rawBase64',
    why: 'passes rawBase64 across the native bridge for both live and still-image scans',
  },
];

const failures = [];
for (const { file, marker, why } of REQUIRED) {
  const path = root + file;
  if (!existsSync(path)) {
    failures.push(`  MISSING FILE  ${file}`);
    continue;
  }
  if (!readFileSync(path, 'utf8').includes(marker)) {
    failures.push(`  NOT PATCHED   ${file}\n                (${why})`);
  }
}

if (failures.length > 0) {
  console.error('\n=============================================================');
  console.error(' REQUIRED NATIVE PATCH IS NOT APPLIED');
  console.error('=============================================================');
  console.error(failures.join('\n'));
  console.error('\nAn APK built like this compiles and runs, but driver\'s licence');
  console.error('scanning can NEVER work in it — the bytes never reach JS.');
  console.error('\nFix: run `npx patch-package` in apps/mobile, then rebuild.');
  console.error('=============================================================\n');
  process.exit(1);
}

console.log('verify-patches: expo-camera rawBase64 patch applied ✔');
