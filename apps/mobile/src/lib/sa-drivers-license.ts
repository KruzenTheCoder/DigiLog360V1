/**
 * South African Driver's Licence Decoder
 * 
 * Implements RSA decryption of the PDF417 binary payload and parses the
 * resulting data blocks. 
 */

export interface ParsedSADriversLicense {
  surname: string;
  initials: string;
  idNumber: string;
  idCountryOfIssue: string;
  licenseCountryOfIssue: string;
  vehicleLicensesCode: string;
  vehicleLicensesRestriction: string;
  licenseNumber: string;
  birthDate?: string; // YYYY-MM-DD
  gender?: string; // 01 (Male) | 02 (Female)
  validFrom?: string; // YYYY-MM-DD
  validTo?: string; // YYYY-MM-DD
}

const KEYS = {
  v1: {
    pk128: {
      mod: BigInt('0x00fed2e1c27e3363316e77317a7a52c54981395186be4974760c72518d63e0544a48d088b332c5b0c370c765d65d983c1f9de0a42b310ccc07ae770bd2b61d6a4dcceac757689bdcbf608478faf312f6087cc496c3762cf5c4651caecda3499fae7edb7eb40e3e18eb304170e91ed5b156aace6f432d6eca6cc35851de8c678f67'),
      exp: BigInt('0x00bb797ffdec7f9e42c9d6f79b137059db')
    },
    pk74: {
      mod: BigInt('0x00ff3cec6b5f40e3c3661451b9fcfaef3aeb06dc2329c0e6f4dccc9279726716ce15bbe05eed2c5711bcf8f5b6c8f7276db5c43bfaa3040dc01ab14b9c4d16f71c0ce5ea953f0c754c6b17'),
      exp: BigInt('0x00db05ba822d9acc33fab7d8f427f9ce65')
    }
  },
  v2: {
    pk128: {
      mod: BigInt('0x00ca9f18ef6c3f3fa4c5a461fea54ab19406ba5ecd746d60a27492dca3d74e3b5c1d315f7b10383241809b029ebbd5de4d116030cc57f7d5a6c9a16f373bb14a508523f7e80a4c744d9085663a4a1472d7af2c56ae41b5065f7efa0293bd3278ad693546f9f16219b79ff471a3636824cffcdb63a8ed8059e6b9a4f0db895381cb'),
      exp: BigInt('0x187092da6454ceb1853e6915f8466a05')
    },
    pk74: {
      mod: BigInt('0x00b404a0df11d1cacff1a1a048d4d573f953a62c583d74925927561a6d7a1e2b14042526af70b550547390ea6ec748d30fdb81adb490e0c36a1986b404b2f5f69ef5da1b663e59509130e7'),
      exp: BigInt('0x309cfed9719fe2a5e20c9bb44765382b')
    }
  }
};

const V1_HEADER = [0x01, 0xe1, 0x02, 0x45];
const V2_HEADER = [0x01, 0x9b, 0x09, 0x45];

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  const zero = BigInt(0);
  const one = BigInt(1);
  const two = BigInt(2);
  let result = one;
  base = base % mod;
  while (exp > zero) {
    if (exp % two === one) result = (result * base) % mod;
    exp = exp / two;
    base = (base * base) % mod;
  }
  return result;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return BigInt('0x' + hex);
}

function bigIntToBytes(bi: bigint, length: number): Uint8Array {
  let hex = bi.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  while (hex.length < length * 2) hex = '00' + hex;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function matchesHeader(data: Uint8Array, header: number[]): boolean {
  for (let i = 0; i < header.length; i++) {
    if (data[i] !== header[i]) return false;
  }
  return true;
}

function recoverBytes(rawString: string): Uint8Array {
  const bytes = new Uint8Array(rawString.length);
  for (let i = 0; i < rawString.length; i++) {
    bytes[i] = rawString.charCodeAt(i) & 0xff;
  }
  return bytes;
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Dependency-free base64 → exact bytes (Hermes has no reliable atob). */
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_ALPHABET.indexOf(clean[i]);
    const c1 = B64_ALPHABET.indexOf(clean[i + 1]);
    const c2 = i + 2 < clean.length ? B64_ALPHABET.indexOf(clean[i + 2]) : -1;
    const c3 = i + 3 < clean.length ? B64_ALPHABET.indexOf(clean[i + 3]) : -1;
    const n = (c0 << 18) | ((c1 & 0x3f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f);
    out.push((n >> 16) & 0xff);
    if (c2 !== -1) out.push((n >> 8) & 0xff);
    if (c3 !== -1) out.push(n & 0xff);
  }
  return Uint8Array.from(out);
}

/**
 * Decode from the barcode's EXACT bytes (base64). This is the reliable path:
 * the native side (patched expo-camera) hands us MLKit's raw bytes so the
 * encrypted binary payload survives intact — unlike the lossy `data` string.
 */
export function decodeSADriversLicenseFromBase64(b64: string): ParsedSADriversLicense | null {
  if (!b64) return null;
  return decodeSADriversLicenseFromBytes(base64ToBytes(b64));
}

/** String entry point — bytes recovered via charCodeAt (lossy for binary; kept
 *  as a fallback only). Prefer {@link decodeSADriversLicenseFromBase64}. */
export function decodeSADriversLicense(rawPayload: string): ParsedSADriversLicense | null {
  return decodeSADriversLicenseFromBytes(recoverBytes(rawPayload));
}

export function decodeSADriversLicenseFromBytes(data: Uint8Array): ParsedSADriversLicense | null {
  try {
    const MIN_LENGTH = 6 + (5 * 128) + 74; // header + 5 blocks + 1 block
    if (data.length < MIN_LENGTH) {
      console.error('Data too short:', data.length);
      return null;
    }

    let keys;
    if (matchesHeader(data, V1_HEADER)) keys = KEYS.v1;
    else if (matchesHeader(data, V2_HEADER)) keys = KEYS.v2;
    else {
      console.error('Unknown header:', data.subarray(0, 4));
      return null;
    }

    const decrypted = new Uint8Array(5 * 128 + 74);
    let offset = 6;
    let outOffset = 0;

    // 5 128-byte blocks
    for (let i = 0; i < 5; i++) {
      const block = data.subarray(offset, offset + 128);
      const dec = bigIntToBytes(modPow(bytesToBigInt(block), keys.pk128.exp, keys.pk128.mod), 128);
      decrypted.set(dec, outOffset);
      offset += 128;
      outOffset += 128;
    }

    // 1 74-byte block
    const finalBlock = data.subarray(offset, offset + 74);
    const decFinal = bigIntToBytes(modPow(bytesToBigInt(finalBlock), keys.pk74.exp, keys.pk74.mod), 74);
    decrypted.set(decFinal, outOffset);

    return parseDecryptedPayload(decrypted);
  } catch (e) {
    console.error('License decryption failed:', e);
    return null;
  }
}

export function parseDecryptedPayload(bytes: Uint8Array): ParsedSADriversLicense | null {
  // String section starts at byte 10.
  // The first 10 bytes:
  // [0] barcode version
  // [5] string section length
  // [7] binary section length
  const stringSectionLength = bytes[5];
  const stringSectionStart = 10;
  const stringSectionEnd = stringSectionStart + stringSectionLength;
  
  if (stringSectionEnd > bytes.length) {
    console.error('String section extends beyond payload', stringSectionEnd, bytes.length);
    return null;
  }

  // The string section starts with 0x82
  let startIdx = 0;
  while (startIdx < bytes.length && bytes[startIdx] !== 0x82) startIdx++;
  startIdx++; // skip 0x82

  const strings: string[] = [];
  let currentString = '';
  for (let i = startIdx; i < stringSectionEnd; i++) {
    const b = bytes[i];
    if (b === 0xe0 || b === 0xe1) {
      if (currentString) strings.push(currentString.trim());
      currentString = '';
    } else {
      currentString += String.fromCharCode(b);
    }
  }
  if (currentString) strings.push(currentString.trim());

  const license: ParsedSADriversLicense = {
    vehicleLicensesCode: '',
    surname: '',
    initials: '',
    idCountryOfIssue: '',
    licenseCountryOfIssue: '',
    vehicleLicensesRestriction: '',
    licenseNumber: '',
    idNumber: '',
  };

  license.idNumber = strings.find(s => /^\d{13}$/.test(s)) || '';
  license.licenseNumber = strings.find(s => /^[A-Z0-9]{10,14}$/i.test(s) && s !== license.idNumber) || '';

  // Surname = the first name-like string. A letters-only match (/^[A-Z]{3,}$/)
  // silently skipped every surname containing a space, hyphen or apostrophe —
  // "Van der Merwe", "Du Plessis", "O'Brien", "Botha-Smit" — and then picked up
  // whatever field came next instead, producing a confidently wrong name.
  // Requiring a run of 3+ letters keeps short vehicle-code groups ("EB EC")
  // from being mistaken for a surname.
  const isNameLike = (s: string) =>
    /^[A-Za-z][A-Za-z'\- ]*$/.test(s) &&
    /[A-Za-z]{3,}/.test(s) &&
    s.toUpperCase() !== 'ZA' &&
    s !== license.licenseNumber;

  const surnameIdx = strings.findIndex(isNameLike);
  if (surnameIdx >= 0) {
    license.surname = strings[surnameIdx];
    // Initials are the field immediately after the surname.
    if (surnameIdx + 1 < strings.length) license.initials = strings[surnameIdx + 1];
  }

  // The binary section (dates, gender, restrictions) starts after the string section.
  const binarySectionStart = stringSectionEnd;
  const hexValues = Array.from(bytes.subarray(binarySectionStart)).map(b => b.toString(16).padStart(2, '0')).join('');

  // The binary layout (nibbles) from the spec:
  // 2: ID type (02 = SA ID)
  // 8, x4: Vehicle codes issue dates (can be single 'a' if not present)
  // 2: Driver restriction codes
  // 8 or 1: PrDP permit expiry
  // 2: License issue number
  // 8 or 1: Birthdate
  // 8 or 1: License Valid From
  // 8 or 1: License Valid To
  // 2: Gender
  
  let nibbleIdx = 0;
  const readNibbles = (len: number) => {
    if (hexValues[nibbleIdx] === 'a') {
      nibbleIdx++;
      return null;
    }
    const val = hexValues.substring(nibbleIdx, nibbleIdx + len);
    nibbleIdx += len;
    return val;
  };
  
  const parseDate = (val: string | null) => {
    if (!val || val.length !== 8) return undefined;
    return `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
  };

  try {
    const idType = readNibbles(2);
    // vehicle codes (4 of them, but they can be 8 or 1 nibble each)
    for (let i = 0; i < 4; i++) {
      if (hexValues[nibbleIdx] === 'a') nibbleIdx++;
      else nibbleIdx += 8;
    }
    const restriction = readNibbles(2);
    // PrDP expiry
    if (hexValues[nibbleIdx] === 'a') nibbleIdx++;
    else nibbleIdx += 8;
    
    const issueNum = readNibbles(2);
    
    // birth date
    license.birthDate = parseDate(hexValues[nibbleIdx] === 'a' ? (nibbleIdx++, null) : (nibbleIdx += 8, hexValues.substring(nibbleIdx - 8, nibbleIdx)));
    
    // valid from
    license.validFrom = parseDate(hexValues[nibbleIdx] === 'a' ? (nibbleIdx++, null) : (nibbleIdx += 8, hexValues.substring(nibbleIdx - 8, nibbleIdx)));
    
    // valid to
    license.validTo = parseDate(hexValues[nibbleIdx] === 'a' ? (nibbleIdx++, null) : (nibbleIdx += 8, hexValues.substring(nibbleIdx - 8, nibbleIdx)));
    
    license.gender = readNibbles(2) ?? undefined;
  } catch (e) {
    // If binary parse fails, we still have the strings
    console.warn('Failed to parse some binary fields', e);
  }

  return license;
}
