import { withTenant, type PrismaClient } from "@myhr/db";
import type { Caller } from "./types.js";
import { sha256, timingSafeEqual } from "./shared.js";

const PREFIX_LEN = 12;

/**
 * Try the tenant-scoped API key strategy.
 *
 * The first 12 chars of the token are the lookup prefix (stored on the
 * api_keys row). We then verify the full-token hash matches the stored
 * hash with timing-safe compare. The lookup runs in master mode because
 * api_keys is master-only under RLS.
 *
 * Returns null if the token doesn't resolve to a live tenant key (caller
 * dispatches to the next strategy or returns 401).
 */
export async function tryTenantKey(
  prisma: PrismaClient,
  token: string,
): Promise<Caller | null> {
  if (token.length < PREFIX_LEN + 1) return null;
  const prefix = token.slice(0, PREFIX_LEN);

  const apiKey = await withTenant(
    prisma,
    { orgId: null, isMaster: true },
    (tx) =>
      tx.apiKey.findFirst({
        where: { prefix, scope: "tenant", revokedAt: null },
        select: { id: true, hash: true, orgId: true },
      }),
  );
  if (!apiKey || !apiKey.orgId) return null;
  if (!timingSafeEqual(apiKey.hash, sha256(token))) return null;

  // Best-effort lastUsedAt update; don't block the request, don't fail it.
  withTenant(prisma, { orgId: null, isMaster: true }, (tx) =>
    tx.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }),
  ).catch(() => {});

  return { type: "tenant_key", keyId: apiKey.id, orgId: apiKey.orgId };
}
