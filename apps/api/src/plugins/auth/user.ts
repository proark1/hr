import type { IncomingHttpHeaders } from "node:http";
import { withTenant, type PrismaClient } from "@myhr/db";
import { getAuth } from "../../lib/better-auth.js";
import type { Actor, Caller } from "./types.js";

/**
 * Try the Better Auth user strategy.
 *
 * Verifies the bearer token via Better Auth's session lookup against our
 * Postgres. On success, hydrates the caller with the user's memberships
 * (read with master mode since memberships are RLS-scoped and we're
 * outside an org context at this point).
 *
 * Returns null if Better Auth isn't configured (BETTER_AUTH_SECRET unset)
 * or if the token doesn't resolve to a live session.
 */
export async function tryUser(
  prisma: PrismaClient,
  headers: IncomingHttpHeaders,
): Promise<{ caller: Caller; actor: Actor } | null> {
  const auth = getAuth();
  if (!auth) return null;

  const fetchHeaders = toFetchHeaders(headers);
  const session = await auth.api.getSession({ headers: fetchHeaders }).catch(() => null);
  if (!session?.user) return null;

  const u = session.user as { id: string; email: string; name?: string | null; isSuperAdmin?: boolean };
  const memberships = await withTenant(
    prisma,
    { orgId: null, isMaster: true, userId: u.id },
    (tx) =>
      tx.orgMembership.findMany({
        where: { userId: u.id, deletedAt: null },
        select: { orgId: true, role: true },
      }),
  );

  return {
    caller: {
      type: "user",
      userId: u.id,
      email: u.email,
      isSuperAdmin: u.isSuperAdmin ?? false,
      memberships,
    },
    actor: {
      id: u.id,
      email: u.email,
      name: u.name ?? undefined,
    },
  };
}

/** Convert Node IncomingHttpHeaders to a fetch-style Headers instance. */
function toFetchHeaders(h: IncomingHttpHeaders): Headers {
  const out = new Headers();
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) out.append(k, item);
    } else {
      out.set(k, v);
    }
  }
  return out;
}
