import { withTenant, type PrismaClient } from "@myhr/db";
import { verifyAccessToken } from "../../lib/auth-service.js";
import type { Actor, Caller } from "./types.js";

/**
 * Try the user strategy.
 *
 * Verifies the bearer token as a JWT issued by the external auth service
 * (proark1/auth). On success, lazy-upserts the user record in our DB (the
 * auth service is the source of truth for identity; we only mirror enough
 * to hang OrgMembership rows off a foreign key) and hydrates memberships.
 *
 * Returns null if the auth service isn't configured or the token doesn't
 * verify, leaving the orchestrator to return 401.
 */
export async function tryUser(
  prisma: PrismaClient,
  token: string,
): Promise<{ caller: Caller; actor: Actor } | null> {
  const claims = await verifyAccessToken(token);
  if (!claims) return null;

  const userId = claims.sub;
  const email = claims.email;
  const name = typeof claims.name === "string" ? claims.name : null;
  const isSuperAdmin = claims.is_super_admin === true;

  const memberships = await withTenant(
    prisma,
    { orgId: null, isMaster: true, userId },
    async (tx) => {
      // Read first and only write when something actually changed — every
      // authenticated request hits this path, and an unconditional upsert
      // would generate a write (WAL, audit triggers) on every call.
      const existing = await tx.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true, isSuperAdmin: true },
      });
      if (!existing) {
        await tx.user.create({
          data: { id: userId, email, name, isSuperAdmin, emailVerified: true },
        });
      } else if (
        existing.email !== email ||
        existing.name !== name ||
        existing.isSuperAdmin !== isSuperAdmin
      ) {
        await tx.user.update({
          where: { id: userId },
          data: { email, name, isSuperAdmin },
        });
      }
      return tx.orgMembership.findMany({
        where: { userId, deletedAt: null },
        select: { orgId: true, role: true },
      });
    },
  );

  return {
    caller: {
      type: "user",
      userId,
      email,
      isSuperAdmin,
      memberships,
    },
    actor: {
      id: userId,
      email,
      name: name ?? undefined,
    },
  };
}
