import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Member } from "@myhr/types";
import { withTenant } from "@myhr/db";
import { Errors } from "../errors.js";
import { errorResponses, orgReadHeaders } from "../lib/openapi.js";

const ListResponse = z.object({ items: z.array(Member) });

const memberRoutes: FastifyPluginAsyncZod = async (app) => {
  // List members of an org. master + tenant_key (machine) + any member.
  app.get(
    "",
    {
      schema: {
        tags: ["Members"],
        operationId: "listMembers",
        summary: "List org members",
        description: "Returns all active members of the resolved org with their role and identity.",
        headers: orgReadHeaders,
        response: { 200: ListResponse, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: {
        requireTenant: true,
        // Any member can list — finer-grained writes (PATCH/DELETE) are gated
        // separately when those endpoints land.
        requireMembership: { roles: ["owner", "admin", "manager", "member"] },
      },
    },
    async (req) => {
      // requireMembership only applies to user callers; master/tenant_key bypass.
      const isMaster = req.caller.type === "master";
      const userId = req.caller.type === "user" ? req.caller.userId : null;
      const rows = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster, userId },
        (tx) =>
          tx.orgMembership.findMany({
            where: { orgId: req.tenantId!, deletedAt: null },
            include: { user: { select: { id: true, email: true, name: true } } },
            orderBy: { createdAt: "asc" },
          }),
      );
      req.auditAction = "members.list";
      return {
        items: rows.map((m) => ({
          membershipId: m.id,
          userId: m.user.id,
          email: m.user.email,
          name: m.user.name,
          role: m.role,
          joinedAt: m.createdAt.toISOString(),
        })),
      };
    },
  );
};

export default memberRoutes;
