import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Org, OrgCreate, OrgUpdate } from "@myhr/types";
import { withTenant } from "@myhr/db";
import { Errors } from "../errors.js";

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
    "/",
    {
      schema: {
        querystring: PageQuery,
        response: { 200: ListResponse },
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

  // Create org — master only. 1tap calls this to provision a startup.
  app.post(
    "/",
    {
      schema: {
        body: OrgCreate,
        response: { 201: Org },
      },
      config: { masterOnly: true },
    },
    async (req, reply) => {
      const created = await withTenant(app.prisma, { orgId: null, isMaster: true }, (tx) =>
        tx.org.create({ data: req.body }),
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
        params: z.object({ id: z.string().uuid() }),
        response: { 200: Org },
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
        params: z.object({ id: z.string().uuid() }),
        body: OrgUpdate,
        response: { 200: Org },
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
