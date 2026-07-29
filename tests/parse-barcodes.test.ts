import { describe, it, expect } from 'vitest';
import {
  parseVehicleLicenseDisk,
  parseDriversLicenseBarcode,
  isValidSouthAfricanId,
  detectAndParse,
} from '../apps/mobile/src/lib/parse-barcodes';
import {
  parseDecryptedPayload,
  decodeSADriversLicenseFromBytes,
  decodeSADriversLicenseFromBase64,
} from '../apps/mobile/src/lib/sa-drivers-license';

// A real SA vehicle-disk payload shape (the sample documented in
// parse-barcodes.ts), with the elided VIN/engine filled in with valid values.
const VIN = 'AHTKB3BF901234373'; // 17 chars, no I/O/Q per ISO 3779
const ENGINE = '2NRB1234552';
const DISK = `%MVL1CC12%0153%4025M09C%1%4025045HYS%TSR610GP%HTM540W%Hatch back / Luikrug%TOYOTA%ETIOS%Silver / Silwer%${VIN}%${ENGINE}%2021-06-30%`;

describe('parseVehicleLicenseDisk', () => {
  it('reads every field off a standard disk via the tail-anchored parse', () => {
    const d = parseVehicleLicenseDisk(DISK);
    expect(d).not.toBeNull();
    expect(d!.expires).toBe('2021-06-30');
    expect(d!.vin).toBe(VIN);
    expect(d!.engine_no).toBe(ENGINE);
    // The gate cares most about the plate — it must not pick up the disc number.
    expect(d!.vehicle_reg).toBe('TSR610GP');
    expect(d!.make).toBe('Toyota');
    expect(d!.model).toBe('Etios');
    // Bilingual fields keep the English half only.
    expect(d!.color).toBe('Silver');
    expect(d!.description).toBe('Hatch Back');
  });

  it('does not mistake the bilingual description for the make', () => {
    // This was the regression the tail-anchored parse was written to fix.
    const d = parseVehicleLicenseDisk(DISK);
    expect(d!.make).not.toMatch(/hatch/i);
  });

  it('rejects text that is not a disk payload', () => {
    expect(parseVehicleLicenseDisk('')).toBeNull();
    expect(parseVehicleLicenseDisk('no percent signs here')).toBeNull();
    expect(parseVehicleLicenseDisk('%a%b%c%')).toBeNull();
  });
});

describe('isValidSouthAfricanId', () => {
  it('accepts a well-formed ID', () => {
    expect(isValidSouthAfricanId('8001015009087')).toBe(true);
  });

  it('rejects a bad Luhn checksum', () => {
    expect(isValidSouthAfricanId('8001015009088')).toBe(false);
  });

  it('rejects an impossible birth date', () => {
    expect(isValidSouthAfricanId('8013015009087')).toBe(false); // month 13
  });

  it('rejects a bad citizenship digit', () => {
    // 11th digit must be 0 or 1.
    expect(isValidSouthAfricanId('8001015009287')).toBe(false);
  });

  it('rejects wrong lengths and non-digits', () => {
    expect(isValidSouthAfricanId('123')).toBe(false);
    expect(isValidSouthAfricanId('80010150090870')).toBe(false);
    expect(isValidSouthAfricanId('80010150090AB')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Synthetic DECRYPTED licence payload. We cannot forge an encrypted payload
// (that needs the private key), but the decrypted-block parser is where all the
// field-extraction logic lives, so it is exercised directly.
function buildDecryptedPayload(
  surname = 'SMITH',
  initials = 'J',
  lead = 'ZA\xe1ZA\xe1',
): Uint8Array {
  const strings = `${lead}${surname}\xe0${initials}\xe01234567890AB\xe08001015009087`;
  const stringBytes = Uint8Array.from([...strings].map((c) => c.charCodeAt(0)));

  // Binary section: idType, 4 absent vehicle dates ('a'), restriction, absent
  // PrDP ('a'), issue no, birth / valid-from / valid-to dates, gender.
  const hex = '02' + 'aaaa' + '01' + 'a' + '01' + '19800101' + '20200101' + '20300101' + '01' + '0';
  const binBytes = Uint8Array.from(
    (hex.match(/../g) ?? []).map((h) => parseInt(h, 16)),
  );

  const out = new Uint8Array(10 + stringBytes.length + binBytes.length);
  out[5] = stringBytes.length; // string-section length
  out[9] = 0x82;               // marker the parser scans for; strings follow
  out.set(stringBytes, 10);
  out.set(binBytes, 10 + stringBytes.length);
  return out;
}

describe('parseDecryptedPayload', () => {
  const parsed = parseDecryptedPayload(buildDecryptedPayload());

  it('extracts the identity fields', () => {
    expect(parsed).not.toBeNull();
    expect(parsed!.idNumber).toBe('8001015009087');
    expect(parsed!.surname).toBe('SMITH');
    expect(parsed!.initials).toBe('J');
    expect(parsed!.licenseNumber).toBe('1234567890AB');
  });

  it('does not mistake the country code for the surname', () => {
    expect(parsed!.surname).not.toBe('ZA');
  });

  it('decodes the packed binary dates', () => {
    expect(parsed!.birthDate).toBe('1980-01-01');
    expect(parsed!.validFrom).toBe('2020-01-01');
    expect(parsed!.validTo).toBe('2030-01-01');
    expect(parsed!.gender).toBe('01');
  });
});

/**
 * Mirrors the byte layout observed on a REAL v2 licence (with invented personal
 * data): the 0x82 marker at offset 13, byte[5] = 0x02, empty leading
 * vehicle-code fields, then the text fields, then the 13-digit ID immediately
 * followed by the packed binary section with no delimiter between them.
 *
 * The old parser treated byte[5] as the string-section length, giving a window
 * that ended at offset 12 — before the marker at 13 — so every text field came
 * back empty and the binary section was read from the wrong offset.
 */
function buildRealV2Layout(): Uint8Array {
  const head = [0x01, 0x02, 0x03, 0x04, 0x05, 0x02, 0x33, 0x27, 0x03, 0x00, 0x31, 0x01, 0x16];
  const text: number[] = [0x82, 0x5b, 0x42, 0xe1, 0xe1, 0xe1];
  const push = (s: string) => { for (const c of s) text.push(c.charCodeAt(0)); };
  push('MOKOENA'); text.push(0xe0);
  push('S'); text.push(0xe1);
  push('ZA'); text.push(0xe0);
  push('ZA'); text.push(0xe0);
  push('0'); text.push(0xe1, 0xe1, 0xe1);
  push('123456789ABC'); text.push(0xe0);
  push('8001015009087'); // ID closes the text section — no delimiter follows
  const hex = '02' + '20031201' + 'aaa' + '00' + 'a' + '01'
    + '19800101' + '20200101' + '20300101' + '01';
  const bin = (hex.match(/../g) ?? []).map((h) => parseInt(h, 16));
  return Uint8Array.from([...head, ...text, ...bin]);
}

describe('real v2 card layout (regression)', () => {
  const p = parseDecryptedPayload(buildRealV2Layout());

  it('reads every text field', () => {
    expect(p).not.toBeNull();
    expect(p!.surname).toBe('MOKOENA');
    expect(p!.initials).toBe('S');
    expect(p!.idNumber).toBe('8001015009087');
    expect(p!.licenseNumber).toBe('123456789ABC');
  });

  it('reads the binary section from after the ID digits', () => {
    expect(p!.birthDate).toBe('1980-01-01');
    expect(p!.validFrom).toBe('2020-01-01');
    expect(p!.validTo).toBe('2030-01-01');
    expect(p!.gender).toBe('01');
  });

  it('is not fooled by byte[5] looking like a length', () => {
    // byte[5] is 0x02 here, exactly as on a real card.
    expect(buildRealV2Layout()[5]).toBe(0x02);
    expect(p!.surname).not.toBe('');
  });
});

describe('surname extraction across real SA name shapes', () => {
  // A letters-only match used to skip every one of these and then take the
  // NEXT field as the surname — a silently wrong name in the sign-in form.
  const cases = [
    ['SMITH', 'J'],
    ['NAIDOO', 'K'],
    ['VAN DER MERWE', 'J H'],
    ['DU PLESSIS', 'P'],
    ["O'BRIEN", 'M'],
    ['BOTHA-SMIT', 'A B'],
    ['NKOSI', 'S'],
  ] as const;

  for (const [surname, initials] of cases) {
    it(`reads "${surname}"`, () => {
      const p = parseDecryptedPayload(buildDecryptedPayload(surname, initials));
      expect(p).not.toBeNull();
      expect(p!.surname).toBe(surname);
      expect(p!.initials).toBe(initials);
      // The ID must still be found regardless of the name shape.
      expect(p!.idNumber).toBe('8001015009087');
    });
  }

  it('does not mistake a short vehicle-code group for the surname', () => {
    // Codes like "EB EC" precede the name and contain no 3-letter run.
    const p = parseDecryptedPayload(
      buildDecryptedPayload('VAN DER MERWE', 'J H', 'EB EC\xe1ZA\xe1'),
    );
    expect(p!.surname).toBe('VAN DER MERWE');
  });
});

describe('decodeSADriversLicenseFromBytes', () => {
  it('rejects a payload shorter than one full block set', () => {
    expect(decodeSADriversLicenseFromBytes(new Uint8Array(100))).toBeNull();
  });

  it('rejects an unrecognised header version', () => {
    const data = new Uint8Array(720);
    data.set([0xff, 0xff, 0xff, 0xff], 0);
    expect(decodeSADriversLicenseFromBytes(data)).toBeNull();
  });

  it('base64 and raw-byte entry points agree exactly', () => {
    // Guards the hand-rolled base64 decoder (Hermes has no reliable atob) over
    // the full byte range — an off-by-one there would silently corrupt the
    // encrypted payload and break every licence scan.
    const data = new Uint8Array(720);
    for (let i = 0; i < data.length; i++) data[i] = i % 256;
    data.set([0x01, 0xe1, 0x02, 0x45], 0); // valid V1 header
    const b64 = Buffer.from(data).toString('base64');
    expect(decodeSADriversLicenseFromBase64(b64)).toEqual(
      decodeSADriversLicenseFromBytes(data),
    );
  });
});

describe('detectAndParse routing', () => {
  it('routes a disk payload to the disk parser', () => {
    const r = detectAndParse(DISK, null, null);
    expect(r.kind).toBe('disk');
    if (r.kind === 'disk') expect(r.data.vehicle_reg).toBe('TSR610GP');
  });

  it('routes text carrying a valid SA ID to the licence parser', () => {
    const r = detectAndParse('junk 8001015009087 junk', null, null);
    expect(r.kind).toBe('license');
    if (r.kind === 'license') expect(r.data.id_number).toBe('8001015009087');
  });

  it('returns unknown for text that is neither', () => {
    expect(detectAndParse('hello world', null, null).kind).toBe('unknown');
  });

  it('ignores a 13-digit run that fails ID validation', () => {
    const r = detectAndParse('order 1234567890123 shipped', null, null);
    expect(r.kind).toBe('unknown');
  });
});

describe('parseDriversLicenseBarcode', () => {
  it('keeps the raw text for diagnostics even when nothing extracts', () => {
    const d = parseDriversLicenseBarcode('nothing useful');
    expect(d.raw).toBe('nothing useful');
    expect(d.id_number).toBeUndefined();
  });
});
