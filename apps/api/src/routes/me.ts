import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Me, MyOrg } from "@myhr/types";
import { withTenant } from "@myhr/db";
import { Errors } from "../errors.js";
import { errorResponses, userReadHeaders } from "../lib/openapi.js";

const MyOrgsResponse = z.object({
  items: z.array(MyOrg),
});

const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "",
    {
      schema: {
        tags: ["Me"],
        operationId: "getMe",
        summary: "Get the authenticated user",
        description: "Returns the currently authenticated end user. User callers only.",
        headers: userReadHeaders,
        response: { 200: Me, ...errorResponses(401, 403, 500) },
      },
      config: { allowedCallers: ["user"] },
    },
    async (req) => {
      const caller = req.caller;
      if (caller.type !== "user") throw Errors.forbidden();
      const u = await withTenant(
        app.prisma,
        { orgId: null, isMaster: true, userId: caller.userId },
        (tx) =>
          tx.user.findUnique({
            where: { id: caller.userId },
            select: { id: true, email: true, name: true, isSuperAdmin: true, createdAt: true },
          }),
      );
      if (!u) throw Errors.notFound();
      req.auditAction = "me.read";
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        isSuperAdmin: u.isSuperAdmin,
        createdAt: u.createdAt.toISOString(),
      };
    },
  );

  app.get(
    "/orgs",
    {
      schema: {
        tags: ["Me"],
        operationId: "listMyOrgs",
        summary: "List orgs the user belongs to",
        description:
          "Returns one row per org the caller has a membership in, denormalised with the org and the caller's role.",
        headers: userReadHeaders,
        response: { 200: MyOrgsResponse, ...errorResponses(401, 403, 500) },
      },
      config: { allowedCallers: ["user"] },
    },
    async (req) => {
      const caller = req.caller;
      if (caller.type !== "user") throw Errors.forbidden();
      const memberships = await withTenant(
        app.prisma,
        { orgId: null, isMaster: true, userId: caller.userId },
        (tx) =>
          tx.orgMembership.findMany({
            where: { userId: caller.userId, deletedAt: null },
            include: { org: true },
            orderBy: { createdAt: "asc" },
          }),
      );
      req.auditAction = "me.orgs.list";
      return {
        items: memberships
          .filter((m) => !m.org.deletedAt)
          .map((m) => ({
            org: {
              id: m.org.id,
              name: m.org.name,
              region: m.org.region,
              status: m.org.status,
              createdAt: m.org.createdAt.toISOString(),
              updatedAt: m.org.updatedAt.toISOString(),
            },
            role: m.role,
            joinedAt: m.createdAt.toISOString(),
          })),
      };
    },
  );
};

export default meRoutes;
