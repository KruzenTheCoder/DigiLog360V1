// Parsers for the two barcodes we read off South African gate-visitor docs:
//
//  1. Vehicle licence disk (PDF417) — plaintext, %-separated. The header
//     starts with MVL... or VR... followed by ~12 fields with vehicle data.
//
//  2. Driver's licence card (PDF417) — RSA-encrypted binary. Government does
//     not publish the keys; we only attempt a soft extraction of anything we
//     can identify (a 13-digit SA ID number) and otherwise return null so
//     the operator falls back to manual entry.

// ============================================================================
// Vehicle licence disk
// ============================================================================

export interface VehicleDiskData {
  vehicle_reg?: string;
  license_disc_no?: string;
  license_no?: string;
  vin?: string;
  engine_no?: string;
  description?: string;
  make?: string;
  model?: string;
  color?: string;
  expires?: string;
  /** Anything we couldn't slot into a known field — kept for debugging. */
  unmatched: string[];
}

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i; // ISO 3779 excludes I, O, Q
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SA_REG_RE = /^[A-Z]{1,3}[\s-]?\d{1,4}[\s-]?[A-Z]{0,3}([\s-]?[A-Z]{2})?$/i;

/**
 * Parse the %-delimited string from a SA vehicle licence disk PDF417.
 * Returns null if the text doesn't look like a licence disk.
 */
export function parseVehicleLicenseDisk(text: string): VehicleDiskData | null {
  if (!text || !text.includes('%')) return null;

  // Strip the header. Common ones: MVL1CC2010, MVL1CR2008, VR1, etc.
  // Defensive: skip leading parts until we get past anything matching ^[A-Z]+
  // with numbers — i.e. the metadata tokens.
  const all = text.split('%').filter((p) => p.length > 0);
  if (all.length < 5) return null;

  let startIdx = 0;
  for (let i = 0; i < Math.min(3, all.length); i++) {
    if (/^(MVL|VR)/i.test(all[i])) {
      startIdx = i + 1;
      // Some disks have a second metadata token right after (e.g. "4WP000…").
      if (startIdx < all.length && /^[A-Z0-9]{6,12}$/i.test(all[startIdx])) {
        startIdx += 1;
      }
      break;
    }
  }
  const fields = all.slice(startIdx);

  const data: VehicleDiskData = { unmatched: [] };

  for (const raw of fields) {
    const f = raw.trim();
    if (!f) continue;

    if (!data.vin && VIN_RE.test(f)) {
      data.vin = f.toUpperCase();
      continue;
    }
    if (!data.expires && DATE_RE.test(f)) {
      data.expires = f;
      continue;
    }
    if (!data.vehicle_reg && SA_REG_RE.test(f)) {
      data.vehicle_reg = f.toUpperCase().replace(/\s+/g, ' ');
      continue;
    }
    // Engine number is usually 5–17 chars alphanumeric, no spaces. Try once.
    if (!data.engine_no && /^[A-Z0-9-]{5,17}$/i.test(f) && f !== data.vin) {
      data.engine_no = f.toUpperCase();
      continue;
    }
    // Anything purely letters (with optional spaces) we treat as a text field:
    // make → model → colour, in that order.
    if (/^[A-Z][A-Z\s./-]{2,}$/i.test(f)) {
      if (!data.make) { data.make = titleCase(f); continue; }
      if (!data.model) { data.model = titleCase(f); continue; }
      if (!data.color) { data.color = titleCase(f); continue; }
    }
    data.unmatched.push(f);
  }

  // If we didn't manage to grab even a reg or VIN, it's probably not a disk.
  if (!data.vehicle_reg && !data.vin) return null;
  return data;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
}

// ============================================================================
// SA Driver's Licence
// ============================================================================

export interface DriversLicenseData {
  id_number?: string;
  /** Raw scan text, kept for diagnostics — never displayed to the user. */
  raw: string;
}

/**
 * Try to pull anything useful out of a SA driver's licence PDF417. The actual
 * personal data is RSA-encrypted with keys the government does not publish,
 * so the most we can reliably extract is a 13-digit South African ID number
 * if it happens to appear in unencrypted bytes. Returns the raw text so the
 * operator can confirm a scan happened even when extraction fails.
 */
export function parseDriversLicenseBarcode(text: string): DriversLicenseData {
  const data: DriversLicenseData = { raw: text };

  // SA ID: 13 digits, first 6 are YYMMDD (must be a plausible date), 11th
  // digit is citizenship (0 or 1), 13th is a Luhn-style checksum.
  const matches = text.match(/\d{13}/g) ?? [];
  for (const candidate of matches) {
    if (isValidSouthAfricanId(candidate)) {
      data.id_number = candidate;
      break;
    }
  }
  return data;
}

export function isValidSouthAfricanId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  // Birthday plausibility.
  const yy = Number(id.slice(0, 2));
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  // Citizenship marker.
  const ci = id[10];
  if (ci !== '0' && ci !== '1') return false;
  // Luhn checksum (Mod10).
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let n = Number(id[i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  void yy;
  return sum % 10 === 0;
}

// ============================================================================
// Auto-detect — call once on the scanned text and route to the right parser.
// ============================================================================

export type ScanResult =
  | { kind: 'disk'; data: VehicleDiskData }
  | { kind: 'license'; data: DriversLicenseData }
  | { kind: 'unknown'; raw: string };

export function detectAndParse(text: string): ScanResult {
  const disk = parseVehicleLicenseDisk(text);
  if (disk) return { kind: 'disk', data: disk };
  // Driver's licence barcodes are binary, so the string we get will be
  // largely unprintable — but the parser is forgiving and just looks for
  // an embedded ID number. We treat as "license" if we got one OR if the
  // content has many control characters (heuristic for the binary format).
  const dl = parseDriversLicenseBarcode(text);
  if (dl.id_number) return { kind: 'license', data: dl };
  const controlRatio = countControlChars(text) / Math.max(text.length, 1);
  if (controlRatio > 0.2) return { kind: 'license', data: dl };
  return { kind: 'unknown', raw: text };
}

function countControlChars(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127) n += 1;
  }
  return n;
}
