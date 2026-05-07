import crypto from "node:crypto";

// Re-exported from @myhr/types so the Zod schemas (which describe the
// `prefix` field for the OpenAPI spec) and the auth runtime stay in sync
// off a single source of truth. See packages/types/src/constants.ts.
export { PREFIX_LEN } from "@myhr/types";

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
