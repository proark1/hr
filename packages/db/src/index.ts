import { PrismaClient, Prisma } from "@prisma/client";

export * from "@prisma/client";

let _prisma: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"],
    });
  }
  return _prisma;
}

/**
 * Run `fn` inside a transaction with the tenant context bound to the Postgres
 * session. RLS policies use these settings to scope every read and write.
 *
 * Caller modes:
 *   - Root master: `isMaster = true`. Cross-everything. Used for cross-tenant
 *     ops like creating partners or listing every org.
 *   - Partner:     `isMaster = false`, `partnerId` set, `orgId` optional. RLS
 *     filters orgs (and via tenant resolution, downstream tables) to those
 *     owned by the partner. Set `orgId` when operating on a single org you
 *     have already validated ownership of (defense in depth).
 *   - Tenant key:  `isMaster = false`, `orgId` set. Standard single-tenant.
 *   - User:        `isMaster = false`, `orgId` set, `userId` set so RLS can
 *     match the org_memberships self-policy across orgs.
 *
 * Tenant callers MUST pass `orgId` so a leaked or buggy query cannot escape
 * the tenant.
 */
export async function withTenant<T>(
  prisma: PrismaClient,
  ctx: {
    orgId: string | null;
    isMaster: boolean;
    userId?: string | null;
    partnerId?: string | null;
  },
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // set_config(name, value, is_local=true) — scoped to this transaction.
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.is_master', $1, true)`,
      ctx.isMaster ? "true" : "false",
    );
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_org_id', $1, true)`,
      ctx.orgId ?? "",
    );
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_user_id', $1, true)`,
      ctx.userId ?? "",
    );
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_partner_id', $1, true)`,
      ctx.partnerId ?? "",
    );
    return fn(tx);
  });
}
