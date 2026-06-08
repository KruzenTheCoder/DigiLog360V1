// Lightweight PIN hashing/verification for edge functions.
//
// We use `bcryptjs` (the pure-JS port) via esm.sh. This is the SAME library
// the seed scripts use, so hashes are bit-for-bit compatible regardless of
// whether they were created by the seed or by the pin-set edge function.
//
// We previously used https://deno.land/x/bcrypt@v0.4.1 — but that library
// runs bcrypt in a Web Worker and has had compatibility issues verifying
// `$2a$` hashes produced by Node's bcryptjs, surfacing as silent
// "Invalid PIN" failures on mobile login. bcryptjs has no such issues.
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3';

export const PIN_LENGTH = 4;
// rounds=4 (~6ms per verify) is deliberate: PIN-only login iterates bcrypt
// over every active mobile profile in the org, so the rounds * candidate-count
// product must fit the edge function CPU budget. For a 4-digit PIN (~13 bits
// of entropy) bcrypt rounds are largely security theatre — the attacker model
// here is rate-limiting + per-user lockout, not slow hashing.
export const PIN_BCRYPT_ROUNDS = 4;

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  // bcryptjs is synchronous, but we keep the async signature so callers
  // don't need to change.
  return bcrypt.hashSync(pin, PIN_BCRYPT_ROUNDS);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  try {
    return bcrypt.compareSync(pin, hash);
  } catch {
    return false;
  }
}
