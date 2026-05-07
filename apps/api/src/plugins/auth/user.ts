import { withTenant, type PrismaClient } from "@myhr/db";
import { verifyAccessToken } from "../../lib/auth-service.js";
import type { Actor, Caller } from "./types.js";

/**
 * Try the user strategy.
 *
 * Verifies the bearer token as a JWT issued by the external auth service
 * (proark1/auth). The auth service is the source of truth for *identity*
 * (who is this person, did they log in, is their session live). It is
 * NOT the source of truth for HR-specific authorization — `isSuperAdmin`
 * is an HR-app concept (can manage Partners, can list every org), and
 * the auth service has no opinion on what that means.
 *
 * So: identity claims (sub, email, name) come from the JWT and are
 * mirrored into our `users` row on first contact / change. The HR-owned
 * `isSuperAdmin` column is read from our DB and never overwritten from
 * the JWT — operators flip it directly in our DB
 * (UPDATE users SET is_super_admin = true WHERE email = '...').
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

  const { isSuperAdmin, memberships } = await withTenant(
    prisma,
    { orgId: null, isMaster: true, userId },
    async (tx) => {
      // Read first and only write the *identity* fields when something
      // actually changed — every authenticated request hits this path,
      // and an unconditional upsert would generate a write on every
      // call. `isSuperAdmin` is intentionally NOT in the write set: it's
      // HR-owned and we read it from the row we just (maybe) wrote.
      const existing = await tx.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true, isSuperAdmin: true },
      });

      let isSuperAdmin: boolean;
      if (!existing) {
        // First contact for a freshly-signed-up user: create the row
        // with isSuperAdmin=false. Operators bootstrap the first
        // superadmin via direct SQL after sign-up.
        await tx.user.create({
          data: {
            id: userId,
            email,
            name,
            isSuperAdmin: false,
            emailVerified: true,
          },
        });
        isSuperAdmin = false;
      } else {
        if (existing.email !== email || existing.name !== name) {
          await tx.user.update({
            where: { id: userId },
            data: { email, name },
          });
        }
        isSuperAdmin = existing.isSuperAdmin;
      }

      const memberships = await tx.orgMembership.findMany({
        where: { userId, deletedAt: null },
        select: { orgId: true, role: true },
      });
      return { isSuperAdmin, memberships };
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
