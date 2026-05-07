import { env } from "../../env.js";
import type { Actor, Caller } from "./types.js";
import { sha256, timingSafeEqual } from "./shared.js";
import { Errors } from "../../errors.js";

const masterKeyHash = sha256(env.MASTER_API_KEY);

/**
 * Try the root master strategy.
 *
 * Returns a master Caller when the token matches MASTER_API_KEY (the
 * operator's env-var bootstrap credential), or null to indicate "this
 * isn't the root master token, try the next strategy".
 *
 * Note: only ROOT master matches here. Partner keys (also `mh_`-prefixed,
 * also DB-backed) are handled by tryPartnerKey in partner.ts.
 */
export function tryMaster(token: string): Caller | null {
  if (!timingSafeEqual(sha256(token), masterKeyHash)) return null;
  return { type: "master", keyId: null };
}

/**
 * Parse the optional X-Actor JSON header for audit attribution. Honored by
 * machine callers we trust to assert an actor identity without our own
 * auth: root master (the operator) and partner keys (vetted external
 * integrators). Tenant-key and user strategies synthesize actor from
 * their own credentials and ignore X-Actor.
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
