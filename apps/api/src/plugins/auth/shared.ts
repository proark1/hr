import crypto from "node:crypto";

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** Constant-time string equality. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** All API keys we mint (master, partner, tenant-scoped) start with this prefix. */
export const API_KEY_PREFIX = "mh_";

/**
 * Number of leading characters of the plaintext key stored in `api_keys.prefix`
 * for both display and DB lookup. The full plaintext is `mh_live_` (8 chars)
 * plus 64 random hex chars; PREFIX_LEN must be enough to keep collisions
 * astronomically unlikely under the unique constraint on `prefix`.
 *
 * 24 chars → 16 random hex chars = 64 bits of randomness, giving a 50%
 * collision threshold around 4 billion keys (birthday paradox). At 12 chars
 * (the v0 value) it was only 16 bits → ~256 keys, which would cause
 * sporadic POST failures at production scale.
 */
export const PREFIX_LEN = 24;
