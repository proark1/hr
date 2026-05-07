import { withTenant, type PrismaClient } from "@myhr/db";
import type { Caller } from "./types.js";
import { sha256, timingSafeEqual } from "./shared.js";

const PREFIX_LEN = 12;

/** Throttle last_used_at writes per key to avoid hot-row contention.
 *  Mirrors the tenant-key strategy. 60s is a useful "is this key alive"
 *  signal without the WAL fan-out of one write per request. */
const LAST_USED_THROTTLE_MS = 60 * 1000;

/** Process-local cache of the last write timestamp for each key id. Best
 *  effort, not a correctness invariant. */
const lastUsedWrites = new Map<string, number>();

/**
 * Try the partner-key strategy.
 *
 * Looks up an api_keys row with scope='partner' by prefix, verifies the
 * full-token hash with timing-safe compare, and rejects keys whose owning
 * partner is not active. The lookup runs in master mode because api_keys
 * (and partners) are master-only under RLS.
 *
 * Returns null if the token doesn't resolve to a live partner key — caller
 * dispatches to the next strategy or returns 401.
 */
export async function tryPartnerKey(
  prisma: PrismaClient,
  token: string,
): Promise<Caller | null> {
  if (token.length < PREFIX_LEN + 1) return null;
  const prefix = token.slice(0, PREFIX_LEN);

  const apiKey = await withTenant(
    prisma,
    { orgId: null, isMaster: true },
    async (tx) => {
      const key = await tx.apiKey.findFirst({
        where: { prefix, scope: "partner", revokedAt: null },
        select: {
          id: true,
          hash: true,
          partnerId: true,
          partner: { select: { status: true } },
        },
      });
      if (!key || !key.partnerId || !key.partner) return null;
      if (!timingSafeEqual(key.hash, sha256(token))) return null;
      // Suspended partners can't authenticate even with a live key — this
      // is the operator's kill switch when a partner is compromised but
      // we don't yet want to revoke individual keys.
      if (key.partner.status !== "active") return null;

      const now = Date.now();
      const lastWrite = lastUsedWrites.get(key.id) ?? 0;
      if (now - lastWrite >= LAST_USED_THROTTLE_MS) {
        lastUsedWrites.set(key.id, now);
        await tx.apiKey.update({
          where: { id: key.id },
          data: { lastUsedAt: new Date(now) },
        });
      }
      return key;
    },
  );
  if (!apiKey || !apiKey.partnerId) return null;

  return { type: "partner", keyId: apiKey.id, partnerId: apiKey.partnerId };
}
