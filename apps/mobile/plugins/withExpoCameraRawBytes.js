/**
 * Config plugin: apply our expo-camera native override during prebuild.
 *
 * WHY A CONFIG PLUGIN (and not patch-package / a Gradle edit)
 * ----------------------------------------------------------
 * A South African driver's licence PDF417 carries an ENCRYPTED payload, so it
 * can only be decrypted from the barcode's exact bytes. Stock expo-camera
 * decodes ML Kit's result into a UTF-8 string, destroying them. Our override
 * adds a `rawBase64` field (plus a never-null `rawBytesSupport` sentinel) that
 * carries them intact across the bridge. Without it, licence scanning cannot
 * work at all.
 *
 * EAS Build regenerates the native `android/` project with `expo prebuild
 * --clean` before compiling. That was proven locally: `--clean` wiped a manual
 * android/build.gradle edit (5 marker lines -> 0). So ANY change made outside
 * the Expo config — a patch-package postinstall, a hand-edited build.gradle —
 * is discarded before the native build. Three production APKs shipped without
 * the override for exactly this reason.
 *
 * A config plugin runs DURING prebuild, every time, so its effect is present in
 * the freshly generated project that actually gets compiled. This copies the
 * three vendored Kotlin files over expo-camera's sources in node_modules (which
 * autolinking compiles from) and then reads them back, throwing if the marker
 * is absent — so a broken prebuild fails loudly instead of producing an APK
 * whose licence scanner silently cannot work.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PINNED = '17.0.10';
const MARKER = 'rawBase64';

// vendored file -> path within node_modules/expo-camera
const FILES = [
  ['BarCodeScannerResult.kt', 'android/src/main/java/expo/modules/camera/utils/BarCodeScannerResult.kt'],
  ['BarcodeScannerResultSerializer.kt', 'android/src/main/java/expo/modules/camera/analyzers/BarcodeScannerResultSerializer.kt'],
  ['BarcodeAnalyzer.kt', 'android/src/main/java/expo/modules/camera/analyzers/BarcodeAnalyzer.kt'],
];

module.exports = function withExpoCameraRawBytes(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const root = cfg.modRequest.projectRoot;
      const overrideDir = path.join(root, 'native-overrides', 'expo-camera');
      const cameraRoot = path.join(root, 'node_modules', 'expo-camera');
      const pkg = path.join(cameraRoot, 'package.json');

      if (!fs.existsSync(pkg)) {
        throw new Error('[expo-camera-rawbytes] expo-camera is not installed at ' + cameraRoot);
      }
      const version = JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
      if (version !== PINNED) {
        throw new Error(
          `[expo-camera-rawbytes] expo-camera is ${version} but the vendored files are from ${PINNED}. ` +
          `Re-vendor apps/mobile/native-overrides/expo-camera from ${version} and update PINNED.`,
        );
      }

      const applied = [];
      for (const [src, rel] of FILES) {
        const from = path.join(overrideDir, src);
        const to = path.join(cameraRoot, rel);
        if (!fs.existsSync(from)) throw new Error(`[expo-camera-rawbytes] missing vendored file: ${from}`);
        if (!fs.existsSync(to)) throw new Error(`[expo-camera-rawbytes] missing expo-camera target: ${to}`);
        fs.copyFileSync(from, to);
        if (!fs.readFileSync(to, 'utf8').includes(MARKER)) {
          throw new Error(`[expo-camera-rawbytes] copied but "${MARKER}" absent from ${rel}`);
        }
        applied.push(src);
      }
      // eslint-disable-next-line no-console
      console.log(`[expo-camera-rawbytes] applied override to expo-camera ${version} (${applied.length} files) ✔`);
      return cfg;
    },
  ]);
};
