import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Org, OrgCreate, OrgUpdate } from "@myhr/types";
import { withTenant } from "@myhr/db";
import { Errors } from "../errors.js";
import {
  errorResponses,
  masterReadHeaders,
  masterWriteHeaders,
  orgWriteHeaders,
} from "../lib/openapi.js";

const PageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const ListResponse = z.object({
  items: z.array(Org),
  nextCursor: z.string().nullable(),
});

const orgRoutes: FastifyPluginAsyncZod = async (app) => {
  // List orgs — master only.
  app.get(
    "",
    {
      schema: {
        tags: ["Orgs"],
        operationId: "listOrgs",
        summary: "List orgs (master only)",
        description: "Lists all tenant orgs. Restricted to the master integrator (1tap).",
        headers: masterReadHeaders,
        querystring: PageQuery,
        response: { 200: ListResponse, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: { masterOnly: true },
    },
    async (req) => {
      const { cursor, limit } = req.query;
      req.auditAction = "org.list";
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
      return {
        items: page.map(serializeOrg),
        nextCursor: hasMore ? page[page.length - 1]!.id : null,
      };
    },
  );

  // Create org — master OR end-user. When a user creates an org, they
  // become its `owner` in the same transaction. 1tap-provisioned orgs
  // get no membership rows.
  app.post(
    "",
    {
      schema: {
        tags: ["Orgs"],
        operationId: "createOrg",
        summary: "Create org",
        description:
          "Provisions a new tenant org. Master callers (1tap) provision on behalf of a startup. End-user callers create their own org and become `owner`.",
        headers: orgWriteHeaders,
        body: OrgCreate,
        response: { 201: Org, ...errorResponses(400, 401, 403, 409, 429, 500) },
      },
      config: { allowedCallers: ["master", "user"] },
    },
    async (req, reply) => {
      const caller = req.caller;
      const created = await withTenant(
        app.prisma,
        { orgId: null, isMaster: true, userId: caller.type === "user" ? caller.userId : null },
        async (tx) => {
          const org = await tx.org.create({ data: req.body });
          if (caller.type === "user") {
            await tx.orgMembership.create({
              data: { orgId: org.id, userId: caller.userId, role: "owner" },
            });
          }
          return org;
        },
      );
      req.auditAction = "org.created";
      req.auditResource = `org:${created.id}`;
      reply.code(201);
      return serializeOrg(created);
    },
  );

  // Get one org — master only (tenants don't list themselves; they already
  // know their own id). Could be opened up later if needed.
  app.get(
    "/:id",
    {
      schema: {
        tags: ["Orgs"],
        operationId: "getOrg",
        summary: "Get org (master only)",
        description: "Returns a single tenant org by id.",
        headers: masterReadHeaders,
        params: z.object({ id: z.string().uuid() }),
        response: { 200: Org, ...errorResponses(400, 401, 403, 404, 429, 500) },
      },
      config: { masterOnly: true },
    },
    async (req) => {
      const org = await withTenant(app.prisma, { orgId: null, isMaster: true }, (tx) =>
        tx.org.findUnique({ where: { id: req.params.id } }),
      );
      if (!org || org.deletedAt) throw Errors.notFound();
      req.auditAction = "org.read";
      req.auditResource = `org:${org.id}`;
      return serializeOrg(org);
    },
  );

  app.patch(
    "/:id",
    {
      schema: {
        tags: ["Orgs"],
        operationId: "updateOrg",
        summary: "Update org (master only)",
        description: "Partially updates a tenant org.",
        headers: masterWriteHeaders,
        params: z.object({ id: z.string().uuid() }),
        body: OrgUpdate,
        response: { 200: Org, ...errorResponses(400, 401, 403, 404, 409, 429, 500) },
      },
      config: { masterOnly: true },
    },
    async (req) => {
      const updated = await withTenant(app.prisma, { orgId: null, isMaster: true }, (tx) =>
        tx.org.update({ where: { id: req.params.id }, data: req.body }),
      );
      req.auditAction = "org.updated";
      req.auditResource = `org:${updated.id}`;
      return serializeOrg(updated);
    },
  );
};

export default orgRoutes;

function serializeOrg(o: {
  id: string;
  name: string;
  region: "eu" | "us";
  status: "active" | "suspended" | "deleted";
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: o.id,
    name: o.name,
    region: o.region,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}
