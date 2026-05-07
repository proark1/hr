/**
 * Number of leading characters of the plaintext API key stored in
 * `api_keys.prefix` for both display and DB lookup. The full plaintext is
 * `mh_live_` (8 chars) plus 64 random hex chars; PREFIX_LEN must be enough
 * to keep collisions astronomically unlikely under the unique constraint
 * on `prefix`.
 *
 * 24 chars → 16 random hex chars = 64 bits of randomness, giving a 50%
 * collision threshold around 4 billion keys (birthday paradox).
 *
 * Source of truth used by both the Zod schemas in this package and the
 * auth runtime in `apps/api` (which re-exports it from
 * `plugins/auth/shared.ts` for backwards-compatible imports).
 */
export const PREFIX_LEN = 24;
