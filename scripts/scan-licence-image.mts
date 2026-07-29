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

// A phone photo is usually rotated, and contrast/scale preprocessing makes a
// real difference on a laminated card.
const variants = [
  { name: 'as-is', build: () => base.clone() },
  { name: 'grey+contrast', build: () => base.clone().greyscale().contrast(0.4) },
  { name: '2x grey+contrast', build: () => base.clone().greyscale().contrast(0.4).scale(2) },
  { name: '2x normalized', build: () => base.clone().greyscale().normalize().scale(2) },
];

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
