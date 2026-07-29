/**
 * Offline diagnostic: decode a PDF417 from a photo and run it through the
 * app's REAL licence decoder. Lets you test a licence scan without a phone.
 *
 *   npx vite-node scripts/scan-licence-image.mts -- <path-to-photo.jpg>
 *
 * Personal data is redacted by default. Add --show to print actual values
 * (do that only on your own machine — it prints a real ID number).
 *
 * IMPORTANT: use the ORIGINAL camera file. Images sent through WhatsApp or
 * similar are downscaled to ~720px and lose the fine bar detail a PDF417
 * needs — nothing can decode those, however good the decoder.
 */
import './zxing-node.mts';
import { Jimp } from 'jimp';
import { readBarcodes } from 'zxing-wasm/reader';
import { decodeSADriversLicenseFromBytes } from '../apps/mobile/src/lib/sa-drivers-license';
import { detectAndParse } from '../apps/mobile/src/lib/parse-barcodes';

const args = process.argv.slice(2).filter((a) => a !== '--');
const SHOW = args.includes('--show');
const path = args.find((a) => !a.startsWith('--'));

if (!path) {
  console.error('usage: npx vite-node scripts/scan-licence-image.mts -- <image> [--show]');
  process.exit(2);
}

const V1_HEADER = [0x01, 0xe1, 0x02, 0x45];
const V2_HEADER = [0x01, 0x9b, 0x09, 0x45];

const base = await Jimp.read(path);
const { width: W, height: H } = base.bitmap;
console.log(`image: ${W}x${H}  (${path})`);
if (Math.max(W, H) <= 1280) {
  console.log('WARNING: this looks like a messenger-compressed image. An SA licence');
  console.log('         PDF417 needs roughly 2500px on the long edge to survive.');
}

// A laminated card under room light is a hard target: glare washes out part of
// the symbol and the plastic sleeve adds scratches. No single preprocessing
// wins on every photo, so sweep a range. Crops matter too — restricting to the
// barcode band removes the pink category table, which otherwise dominates the
// binarizer's global threshold and flattens the bars.
const crops: { name: string; box: [number, number, number, number] | null }[] = [
  { name: 'full', box: null },
  // The barcode occupies roughly the top third of the card in either
  // orientation, so try both bands rather than guessing the rotation.
  { name: 'top-45%', box: [0, 0, 1, 0.45] },
  { name: 'left-45%', box: [0, 0, 0.45, 1] },
];

const tones: { name: string; apply: (i: ReturnType<typeof base.clone>) => void }[] = [
  { name: 'grey', apply: (i) => { i.greyscale(); } },
  { name: 'normalize', apply: (i) => { i.greyscale().normalize(); } },
  { name: 'contrast.3', apply: (i) => { i.greyscale().contrast(0.3); } },
  { name: 'contrast.6', apply: (i) => { i.greyscale().contrast(0.6); } },
  { name: 'norm+contrast', apply: (i) => { i.greyscale().normalize().contrast(0.35); } },
];

// Aim for a working long edge rather than blind 2x — upscaling an already-large
// photo just burns memory, and the decoder wants ~3px per module, not more.
const targets = [2600, 3600, 1800];

const variants: { name: string; build: () => ReturnType<typeof base.clone> }[] = [];
for (const c of crops) {
  for (const t of targets) {
    for (const tone of tones) {
      variants.push({
        name: `${c.name}/${t}px/${tone.name}`,
        build: () => {
          const img = base.clone();
          if (c.box) {
            const { width: w, height: h } = img.bitmap;
            img.crop({
              x: Math.round(c.box[0] * w), y: Math.round(c.box[1] * h),
              w: Math.round(c.box[2] * w), h: Math.round(c.box[3] * h),
            });
          }
          const longEdge = Math.max(img.bitmap.width, img.bitmap.height);
          if (longEdge !== t) img.scale(t / longEdge);
          tone.apply(img);
          return img;
        },
      });
    }
  }
}

let bytes: Uint8Array | null = null;
let how = '';
outer:
for (const v of variants) {
  for (const deg of [0, 90, 180, 270]) {
    const img = v.build();
    if (deg) img.rotate(deg);
    const { width, height, data } = img.bitmap;
    try {
      const res = await readBarcodes(
        { data: new Uint8ClampedArray(data), width, height },
        { tryHarder: true, formats: ['PDF417'], maxNumberOfSymbols: 1 },
      );
      if (res.length > 0 && res[0].bytes?.length) {
        bytes = res[0].bytes;
        how = `variant="${v.name}" rotate=${deg}°`;
        break outer;
      }
    } catch {
      /* try next variant */
    }
  }
}

if (!bytes) {
  console.log('\nNO BARCODE DECODED at any orientation or preprocessing variant.');
  console.log('Most likely the image resolution is too low. Retake with the card out');
  console.log('of its plastic sleeve, barcode filling the frame, and transfer the');
  console.log('ORIGINAL file (USB / Drive / email as full size — not WhatsApp).');
  process.exit(1);
}

const hdr = [...bytes.subarray(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
const version = V1_HEADER.every((b, i) => bytes![i] === b) ? 'v1'
  : V2_HEADER.every((b, i) => bytes![i] === b) ? 'v2' : 'UNKNOWN';

console.log(`\nDECODED: ${how}`);
console.log(`payload: ${bytes.length} bytes`);
console.log(`header : ${hdr}  -> ${version}`);
console.log('         (expected 01 e1 02 45 = v1, or 01 9b 09 45 = v2)');

if (version === 'UNKNOWN') {
  console.log('\nHeader not recognised — the app rejects this before decrypting.');
  process.exit(1);
}

const parsed = decodeSADriversLicenseFromBytes(bytes);
if (!parsed) {
  console.log('\nDECRYPT/PARSE RETURNED NULL — this is the bug to chase.');
  process.exit(1);
}

const redact = (v?: string) =>
  !v ? '(empty)' : SHOW ? v : `${'*'.repeat(Math.max(0, v.length - 2))}${v.slice(-2)} (len ${v.length})`;

console.log('\nFIELDS EXTRACTED:');
console.log('  surname      :', redact(parsed.surname));
console.log('  initials     :', redact(parsed.initials));
console.log('  idNumber     :', redact(parsed.idNumber));
console.log('  licenseNumber:', redact(parsed.licenseNumber));
console.log('  birthDate    :', parsed.birthDate ?? '(none)');
console.log('  gender       :', parsed.gender ?? '(none)');
console.log('  validFrom    :', parsed.validFrom ?? '(none)');
console.log('  validTo      :', parsed.validTo ?? '(none)');

// Exactly what the sign-in sheet would do with this scan.
const text = String.fromCharCode(...bytes);
const routed = detectAndParse(text, null, Buffer.from(bytes).toString('base64'));
console.log('\nAPP WOULD ROUTE AS:', routed.kind);
if (routed.kind === 'license') {
  console.log('  form "Full name" :', redact([parsed.initials, parsed.surname].filter(Boolean).join(' ')));
  console.log('  form "ID number" :', redact(routed.data.id_number));
}
