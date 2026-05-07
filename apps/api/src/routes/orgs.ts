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

/** Build the right session context for a request that needs to act on the
 *  orgs table. Root master gets is_master mode (cross-everything); partner
 *  gets partner mode (RLS scopes to orgs.partner_id = current_partner_id);
 *  user callers run with their userId set so memberships RLS can match. */
function callerOrgsCtx(caller: import("../plugins/auth/types.js").Caller): {
  orgId: string | null;
  isMaster: boolean;
  partnerId?: string | null;
  userId?: string | null;
} {
  if (caller.type === "master") return { orgId: null, isMaster: true };
  if (caller.type === "partner") {
    return { orgId: null, isMaster: false, partnerId: caller.partnerId };
  }
  if (caller.type === "user") {
    return { orgId: null, isMaster: true, userId: caller.userId };
  }
  // tenant_key callers don't get to operate on the orgs table beyond their
  // own row (the routes that admit them don't reach this helper).
  return { orgId: null, isMaster: true };
}

const orgRoutes: FastifyPluginAsyncZod = async (app) => {
  // List orgs — root master sees every org; partner sees only the orgs
  // they themselves provisioned (enforced by RLS via app.current_partner_id).
  app.get(
    "",
    {
      schema: {
        tags: ["Orgs"],
        operationId: "listOrgs",
        summary: "List orgs (root master + partner)",
        description:
          "Lists tenant orgs. Root master sees every org on the deployment. Partner callers see only the orgs they themselves provisioned (RLS-isolated from every other partner).",
        headers: masterReadHeaders,
        querystring: PageQuery,
        response: { 200: ListResponse, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: { allowedCallers: ["master", "partner"] },
    },
    async (req) => {
      const { cursor, limit } = req.query;
      req.auditAction = "org.list";
      const items = await withTenant(app.prisma, callerOrgsCtx(req.caller), (tx) =>
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

  // Create org — root master, partner, or end-user.
  //   - Root master: provisions a free-floating org (partner_id NULL). No
  //     membership rows; the operator manages access out-of-band.
  //   - Partner: provisions an org owned by the partner (partner_id set).
  //     No membership rows; the partner integrator manages access via
  //     their own product.
  //   - User: creates their own org and becomes its `owner` in the same tx.
  app.post(
    "",
    {
      schema: {
        tags: ["Orgs"],
        operationId: "createOrg",
        summary: "Create org",
        description:
          "Provisions a new tenant org. Root master and partner callers provision on behalf of a tenant (partner-created orgs are tagged with the partner id). End-user callers create their own org and become `owner`.",
        headers: orgWriteHeaders,
        body: OrgCreate,
        response: { 201: Org, ...errorResponses(400, 401, 403, 409, 429, 500) },
      },
      config: { allowedCallers: ["master", "partner", "user"] },
    },
    async (req, reply) => {
      const caller = req.caller;
      // Partner-created orgs MUST be tagged at creation. Even if RLS would
      // catch a stray write, we set partner_id explicitly so the row is
      // owned from inception (defense in depth + correctness).
      const partnerId = caller.type === "partner" ? caller.partnerId : null;
      const created = await withTenant(
        app.prisma,
        { orgId: null, isMaster: true, userId: caller.type === "user" ? caller.userId : null },
        async (tx) => {
          const org = await tx.org.create({ data: { ...req.body, partnerId } });
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
      if (partnerId) req.auditMetadata = { partnerId };
      reply.code(201);
      return serializeOrg(created);
    },
  );

  // Get one org — root master + partner (limited to their own orgs by RLS).
  app.get(
    "/:id",
    {
      schema: {
        tags: ["Orgs"],
        operationId: "getOrg",
        summary: "Get org (root master + partner)",
        description:
          "Returns a single tenant org by id. Root master sees every org; partners see only the orgs they themselves provisioned (404 otherwise).",
        headers: masterReadHeaders,
        params: z.object({ id: z.string().uuid() }),
        response: { 200: Org, ...errorResponses(400, 401, 403, 404, 429, 500) },
      },
      config: { allowedCallers: ["master", "partner"] },
    },
    async (req) => {
      const org = await withTenant(app.prisma, callerOrgsCtx(req.caller), (tx) =>
        tx.org.findUnique({ where: { id: req.params.id } }),
      );
      // RLS hides non-owned orgs from partner callers — 404 is the correct
      // response (don't leak existence to non-owning partners).
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
        summary: "Update org (root master + partner)",
        description:
          "Partially updates a tenant org. Root master can update any org; partners can update only orgs they themselves provisioned.",
        headers: masterWriteHeaders,
        params: z.object({ id: z.string().uuid() }),
        body: OrgUpdate,
        response: { 200: Org, ...errorResponses(400, 401, 403, 404, 409, 429, 500) },
      },
      config: { allowedCallers: ["master", "partner"] },
    },
    async (req) => {
      const updated = await withTenant(app.prisma, callerOrgsCtx(req.caller), async (tx) => {
        // For partner callers, RLS will reject the update if partner_id
        // doesn't match. Prisma's `update` throws P2025 (record not found)
        // in that case — surface it as 404 to avoid leaking existence.
        try {
          return await tx.org.update({ where: { id: req.params.id }, data: req.body });
        } catch (err) {
          const code =
            err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
          if (code === "P2025") throw Errors.notFound();
          throw err;
        }
      });
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
  partnerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: o.id,
    name: o.name,
    region: o.region,
    status: o.status,
    partnerId: o.partnerId,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}
