import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Org } from "@myhr/types";
import { withTenant } from "@myhr/db";
import { errorResponses, userReadHeaders } from "../lib/openapi.js";

const ListResponse = z.object({
  items: z.array(Org),
  nextCursor: z.string().nullable(),
});

const PageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const superAdminRoutes: FastifyPluginAsyncZod = async (app) => {
  // Cross-tenant org list, gated by users.is_super_admin = true. Master
  // callers are NOT allowed here — they have their own /v1/orgs path.
  app.get(
    "/orgs",
    {
      schema: {
        tags: ["SuperAdmin"],
        operationId: "superadminListOrgs",
        summary: "List all orgs (super admin)",
        description:
          "Cross-tenant org list for OurTeamManagement ops humans (`is_super_admin = true`). Master + tenant-key callers are rejected — they have their own paths.",
        headers: userReadHeaders,
        querystring: PageQuery,
        response: { 200: ListResponse, ...errorResponses(401, 403, 429, 500) },
      },
      config: { requireSuperAdmin: true },
    },
    async (req) => {
      const { cursor, limit } = req.query;
      const items = await withTenant(app.prisma, { orgId: null, isMaster: true }, (tx) =>
        tx.org.findMany({
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { createdAt: "desc" },
          where: { deletedAt: null },
        }),
      );
      const hasMore = items.length > limit;
      const page = hasMore ? items.slice(0, -1) : items;
      req.auditAction = "superadmin.orgs.list";
      return {
        items: page.map((o) => ({
          id: o.id,
          name: o.name,
          region: o.region,
          status: o.status,
          partnerId: o.partnerId,
          createdAt: o.createdAt.toISOString(),
          updatedAt: o.updatedAt.toISOString(),
        })),
        nextCursor: hasMore ? page[page.length - 1]!.id : null,
      };
    },
  );
};

export default superAdminRoutes;
