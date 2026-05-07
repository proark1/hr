import { env } from "../../env.js";
import type { Actor, Caller } from "./types.js";
import { sha256, timingSafeEqual } from "./shared.js";
import { Errors } from "../../errors.js";

const masterKeyHash = sha256(env.MASTER_API_KEY);

/**
 * Try the master strategy.
 *
 * Returns a master Caller when the token matches MASTER_API_KEY, or null to
 * indicate "this isn't a master token, try the next strategy". Throws on
 * malformed-but-master-shaped (e.g. wrong length) — caller decides how to
 * handle: today we just return null and let the next strategy try.
 */
export function tryMaster(token: string): Caller | null {
  if (!timingSafeEqual(sha256(token), masterKeyHash)) return null;
  return { type: "master", keyId: null };
}

/**
 * Parse the optional X-Actor JSON header for audit attribution. Only the
 * master strategy honors it — the master integrator is the only caller we
 * trust to assert an actor identity without our own auth. Tenant-key and
 * user strategies synthesize actor from their own credentials.
 */
export function parseMasterActor(header: string | string[] | undefined): Actor {
  if (typeof header !== "string" || header.length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(header);
  } catch {
    throw Errors.badRequest("X-Actor header must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object") return {};
  const o = parsed as Record<string, unknown>;
  return {
    id: typeof o.id === "string" ? o.id : undefined,
    email: typeof o.email === "string" ? o.email : undefined,
    name: typeof o.name === "string" ? o.name : undefined,
  };
}
