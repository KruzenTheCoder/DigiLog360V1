/**
 * Config plugin: apply our expo-camera native override so it survives EAS.
 *
 * WHY THIS IS HARD
 * ----------------
 * A South African driver's licence PDF417 carries an ENCRYPTED payload, so it
 * can only be decrypted from the barcode's exact bytes. Stock expo-camera
 * decodes ML Kit's result into a UTF-8 string, destroying them. Our override
 * adds a `rawBase64` field (plus a never-null `rawBytesSupport` sentinel) that
 * carries them intact. Without it, licence scanning cannot work at all.
 *
 * Several mechanisms were tried and each shipped a broken APK:
 *   - patch-package postinstall — never ran (apps/mobile isn't a root workspace
 *     member) and used an unresolvable bare binary;
 *   - a hand-edited android/build.gradle — wiped, because EAS regenerates the
 *     native project with `expo prebuild --clean` (proven locally: the marker
 *     block went from 5 lines to 0);
 *   - a withDangerousMod that patches node_modules during prebuild — insufficient
 *     on its own, because dependencies can be installed AFTER prebuild, which
 *     restores stock expo-camera before Gradle compiles it.
 *
 * ROBUST APPROACH (two layers)
 * ----------------------------
 * 1. withProjectBuildGradle — inject a copy step into the GENERATED root
 *    build.gradle. Prebuild regenerates that file, so the injection is re-added
 *    on every prebuild, and it executes at Gradle CONFIGURATION time: after any
 *    npm install, after prebuild, immediately before expo-camera compiles. It
 *    copies from the committed native-overrides/ (which npm never touches) into
 *    node_modules/expo-camera, then verifies the marker and fails the build if
 *    it is absent. This is the layer that guarantees correctness regardless of
 *    EAS's install/prebuild ordering.
 * 2. withDangerousMod — also copy during prebuild, so local `expo run:android`
 *    and any flow that compiles straight after prebuild is covered too.
 */
const { withDangerousMod, withProjectBuildGradle } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PINNED = '17.0.10';
const MARKER = 'rawBase64';

// vendored file -> path within node_modules/expo-camera/android/src/main/java/expo/modules/camera
const FILES = [
  ['BarCodeScannerResult.kt', 'utils/BarCodeScannerResult.kt'],
  ['BarcodeScannerResultSerializer.kt', 'analyzers/BarcodeScannerResultSerializer.kt'],
  ['BarcodeAnalyzer.kt', 'analyzers/BarcodeAnalyzer.kt'],
];

const BEGIN = '// >>> expo-camera-rawbytes override (injected by withExpoCameraRawBytes)';
const END = '// <<< expo-camera-rawbytes override';

function applyToNodeModules(projectRoot) {
  const overrideDir = path.join(projectRoot, 'native-overrides', 'expo-camera');
  const cameraRoot = path.join(projectRoot, 'node_modules', 'expo-camera');
  const pkg = path.join(cameraRoot, 'package.json');
  if (!fs.existsSync(pkg)) throw new Error('[expo-camera-rawbytes] expo-camera not installed at ' + cameraRoot);
  const version = JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
  if (version !== PINNED) {
    throw new Error(`[expo-camera-rawbytes] expo-camera is ${version} but vendored files are ${PINNED}. Re-vendor and update PINNED.`);
  }
  const base = path.join(cameraRoot, 'android/src/main/java/expo/modules/camera');
  for (const [src, rel] of FILES) {
    const from = path.join(overrideDir, src);
    const to = path.join(base, rel);
    if (!fs.existsSync(from)) throw new Error(`[expo-camera-rawbytes] missing vendored file: ${from}`);
    if (!fs.existsSync(to)) throw new Error(`[expo-camera-rawbytes] missing target: ${to}`);
    fs.copyFileSync(from, to);
    if (!fs.readFileSync(to, 'utf8').includes(MARKER)) {
      throw new Error(`[expo-camera-rawbytes] copied but "${MARKER}" absent from ${rel}`);
    }
  }
  return version;
}

/**
 * Groovy injected into the generated root build.gradle. Runs at configuration
 * time (after installs, before expo-camera compiles), copies from the committed
 * native-overrides/ into node_modules, and fails the build if the marker is
 * absent — so a broken build never ships silently.
 */
function gradleSnippet() {
  const pairs = FILES.map(([s, r]) => `["${s}", "${r}"]`).join(', ');
  return `
${BEGIN}
def _ecOverrideDir = new File(rootDir, "../native-overrides/expo-camera")
def _ecCameraBase = new File(rootDir, "../node_modules/expo-camera/android/src/main/java/expo/modules/camera")
if (!_ecCameraBase.exists()) {
  throw new GradleException("expo-camera-rawbytes: expo-camera sources not found at " + _ecCameraBase)
}
if (!_ecOverrideDir.exists()) {
  throw new GradleException("expo-camera-rawbytes: native-overrides/expo-camera missing; cannot build a working licence scanner")
}
[${pairs}].each { pair ->
  def s = new File(_ecOverrideDir, pair[0])
  def d = new File(_ecCameraBase, pair[1])
  if (!s.exists()) throw new GradleException("expo-camera-rawbytes: missing override " + s)
  if (!d.exists()) throw new GradleException("expo-camera-rawbytes: missing target " + d)
  if (d.text != s.text) { d.text = s.text }
}
def _ecCheck = new File(_ecCameraBase, "analyzers/BarcodeScannerResultSerializer.kt")
if (!_ecCheck.text.contains("${MARKER}")) {
  throw new GradleException("expo-camera-rawbytes: override did not take effect; refusing to ship a broken licence scanner")
}
logger.lifecycle("expo-camera-rawbytes: override applied at gradle config time OK")
${END}
`;
}

module.exports = function withExpoCameraRawBytes(config) {
  // Layer 1: inject the copy into the generated root build.gradle.
  config = withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('[expo-camera-rawbytes] expected a groovy build.gradle');
    }
    let contents = cfg.modResults.contents;
    if (contents.includes(BEGIN)) {
      contents = contents.replace(new RegExp(`\\n?${escapeRe(BEGIN)}[\\s\\S]*?${escapeRe(END)}\\n?`), '\n');
    }
    cfg.modResults.contents = contents.trimEnd() + '\n' + gradleSnippet();
    return cfg;
  });

  // Layer 2: also copy during prebuild (covers local compile-after-prebuild).
  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const version = applyToNodeModules(cfg.modRequest.projectRoot);
      // eslint-disable-next-line no-console
      console.log(`[expo-camera-rawbytes] override applied to expo-camera ${version} during prebuild ✔`);
      return cfg;
    },
  ]);

  return config;
};

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
