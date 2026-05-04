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
 * Master callers set `isMaster = true` and bypass tenant filtering (used for
 * cross-tenant operations like provisioning a new org). Tenant callers MUST
 * pass `orgId` so a leaked or buggy query cannot escape the tenant.
 */
export async function withTenant<T>(
  prisma: PrismaClient,
  ctx: { orgId: string | null; isMaster: boolean },
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
    return fn(tx);
  });
}
