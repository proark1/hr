import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import crypto from "node:crypto";
import { z } from "zod";
import {
  Partner,
  PartnerCreate,
  PartnerKey,
  PartnerKeyCreate,
  PartnerKeyCreated,
  PartnerUpdate,
} from "@myhr/types";
import { withTenant } from "@myhr/db";
import { Errors } from "../errors.js";
import { errorResponses, masterReadHeaders, masterWriteHeaders } from "../lib/openapi.js";
import { PREFIX_LEN } from "../plugins/auth/shared.js";
import { deliverPartnerWebhook, type PartnerWebhookPayload } from "../lib/partner-webhook.js";

const PageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const PartnerListResponse = z.object({
  items: z.array(Partner),
  nextCursor: z.string().nullable(),
});
const PartnerKeyListResponse = z.object({ items: z.array(PartnerKey) });

function generateKey(): { plaintext: string; prefix: string; hash: string } {
  // Same shape as tenant keys — the auth orchestrator disambiguates by
  // looking up the prefix in api_keys with scope filter.
  const random = crypto.randomBytes(32).toString("hex");
  const plaintext = `mh_live_${random}`;
  const prefix = plaintext.slice(0, PREFIX_LEN);
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, prefix, hash };
}

function serializePartner(p: {
  id: string;
  name: string;
  status: "active" | "suspended";
  contactEmail: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  suspendedAt: Date | null;
}) {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    contactEmail: p.contactEmail,
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    suspendedAt: p.suspendedAt ? p.suspendedAt.toISOString() : null,
  };
}

/** Subset of a partner row pushed to the operator-side CRM webhook. Stays
 *  metadata-only — no plaintext key material ever travels through here. */
function webhookPayload(p: {
  id: string;
  name: string;
  status: "active" | "suspended";
  contactEmail: string | null;
  createdAt: Date;
}): PartnerWebhookPayload {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    contactEmail: p.contactEmail,
    createdAt: p.createdAt.toISOString(),
  };
}

function serializePartnerKey(k: {
  id: string;
  partnerId: string | null;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}) {
  return {
    id: k.id,
    partnerId: k.partnerId!,
    name: k.name,
    prefix: k.prefix,
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    createdAt: k.createdAt.toISOString(),
    revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
  };
}

const partnerRoutes: FastifyPluginAsyncZod = async (app) => {
  // ---- Partners --------------------------------------------------------

  app.post(
    "",
    {
      schema: {
        tags: ["Partners"],
        operationId: "createPartner",
        summary: "Create partner (operator only)",
        description:
          "Provisions a new Partner — an external SaaS integrator that will provision HR orgs on behalf of their own customers. Returns the partner record; mint keys via POST /v1/partners/:id/keys.",
        headers: masterWriteHeaders,
        body: PartnerCreate,
        response: { 201: Partner, ...errorResponses(400, 401, 403, 409, 429, 500) },
      },
      config: { allowedCallers: ["master", "user"], requireSuperAdmin: true },
    },
    async (req, reply) => {
      const created = await withTenant(app.prisma, { orgId: null, isMaster: true }, (tx) =>
        tx.partner.create({
          data: {
            name: req.body.name,
            contactEmail: req.body.contactEmail ?? null,
            notes: req.body.notes ?? null,
          },
        }),
      );
      req.auditAction = "partner.created";
      req.auditResource = `partner:${created.id}`;
      // Best-effort sync to the operator's CRM (Supabase, etc.). Errors
      // surface in logs only — the partner row is already committed.
      await deliverPartnerWebhook(req.log, {
        type: "partner.created",
        partner: webhookPayload(created),
      });
      reply.code(201);
      return serializePartner(created);
    },
  );

  app.get(
    "",
    {
      schema: {
        tags: ["Partners"],
        operationId: "listPartners",
        summary: "List partners (operator only)",
        description: "Returns every Partner registered on this deployment.",
        headers: masterReadHeaders,
        querystring: PageQuery,
        response: { 200: PartnerListResponse, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: { allowedCallers: ["master", "user"], requireSuperAdmin: true },
    },
    async (req) => {
      const { cursor, limit } = req.query;
      req.auditAction = "partner.list";
      const items = await withTenant(app.prisma, { orgId: null, isMaster: true }, (tx) =>
        tx.partner.findMany({
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { createdAt: "desc" },
        }),
      );
      const hasMore = items.length > limit;
      const page = hasMore ? items.slice(0, -1) : items;
      return {
        items: page.map(serializePartner),
        nextCursor: hasMore ? page[page.length - 1]!.id : null,
      };
    },
  );

  app.get(
    "/:id",
    {
      schema: {
        tags: ["Partners"],
        operationId: "getPartner",
        summary: "Get partner (operator only)",
        headers: masterReadHeaders,
        params: z.object({ id: z.string().uuid() }),
        response: { 200: Partner, ...errorResponses(400, 401, 403, 404, 429, 500) },
      },
      config: { allowedCallers: ["master", "user"], requireSuperAdmin: true },
    },
    async (req) => {
      const partner = await withTenant(app.prisma, { orgId: null, isMaster: true }, (tx) =>
        tx.partner.findUnique({ where: { id: req.params.id } }),
      );
      if (!partner) throw Errors.notFound();
      req.auditAction = "partner.read";
      req.auditResource = `partner:${partner.id}`;
      return serializePartner(partner);
    },
  );

  app.patch(
    "/:id",
    {
      schema: {
        tags: ["Partners"],
        operationId: "updatePartner",
        summary: "Update partner (operator only)",
        description:
          "Rename a partner, edit contact / notes, or suspend / re-activate. Suspending a partner immediately blocks all of their keys at auth time.",
        headers: masterWriteHeaders,
        params: z.object({ id: z.string().uuid() }),
        body: PartnerUpdate,
        response: { 200: Partner, ...errorResponses(400, 401, 403, 404, 409, 429, 500) },
      },
      config: { allowedCallers: ["master", "user"], requireSuperAdmin: true },
    },
    async (req) => {
      const { updated, statusTransition } = await withTenant(
        app.prisma,
        { orgId: null, isMaster: true },
        async (tx) => {
          // Read-then-update so we can compute suspendedAt as a transition
          // (only stamp it the first time status flips active→suspended;
          // clear it on reactivation). Update-then-look would clobber the
          // original suspension timestamp on every PATCH that re-asserts
          // the same status.
          const existing = await tx.partner.findUnique({
            where: { id: req.params.id },
            select: { status: true },
          });
          if (!existing) throw Errors.notFound();

          const data: Record<string, unknown> = {};
          if (req.body.name !== undefined) data.name = req.body.name;
          if (req.body.contactEmail !== undefined) data.contactEmail = req.body.contactEmail;
          if (req.body.notes !== undefined) data.notes = req.body.notes;

          let statusTransition: "suspended" | "reactivated" | null = null;
          if (req.body.status !== undefined && req.body.status !== existing.status) {
            data.status = req.body.status;
            data.suspendedAt = req.body.status === "suspended" ? new Date() : null;
            statusTransition =
              req.body.status === "suspended" ? "suspended" : "reactivated";
          }

          try {
            const row = await tx.partner.update({ where: { id: req.params.id }, data });
            return { updated: row, statusTransition };
          } catch (err) {
            // Defense in depth: even though we just read the row, a
            // concurrent delete could leave us racing with P2025.
            const code =
              err && typeof err === "object" && "code" in err
                ? (err as { code: string }).code
                : "";
            if (code === "P2025") throw Errors.notFound();
            throw err;
          }
        },
      );
      req.auditAction = "partner.updated";
      req.auditResource = `partner:${updated.id}`;
      if (statusTransition) {
        await deliverPartnerWebhook(req.log, {
          type:
            statusTransition === "suspended"
              ? "partner.suspended"
              : "partner.reactivated",
          partner: webhookPayload(updated),
        });
      }
      return serializePartner(updated);
    },
  );

  // ---- Partner keys ----------------------------------------------------

  app.post(
    "/:id/keys",
    {
      schema: {
        tags: ["Partners"],
        operationId: "createPartnerKey",
        summary: "Mint a partner-scoped API key (operator only)",
        description:
          "Generates a new partner-scoped API key. The plaintext value is returned once and never again — store it immediately. Used by the partner integrator to authenticate cross-tenant within their own orgs.",
        headers: masterWriteHeaders,
        params: z.object({ id: z.string().uuid() }),
        body: PartnerKeyCreate,
        response: { 201: PartnerKeyCreated, ...errorResponses(400, 401, 403, 404, 429, 500) },
      },
      config: { allowedCallers: ["master", "user"], requireSuperAdmin: true },
    },
    async (req, reply) => {
      const partnerId = req.params.id;
      const { plaintext, prefix, hash } = generateKey();

      const { row, partner } = await withTenant(
        app.prisma,
        { orgId: null, isMaster: true },
        async (tx) => {
          const partner = await tx.partner.findUnique({
            where: { id: partnerId },
            select: {
              id: true,
              name: true,
              status: true,
              contactEmail: true,
              createdAt: true,
            },
          });
          if (!partner) throw Errors.notFound();
          const row = await tx.apiKey.create({
            data: {
              scope: "partner",
              partnerId,
              name: req.body.name,
              prefix,
              hash,
            },
            select: {
              id: true,
              partnerId: true,
              name: true,
              prefix: true,
              lastUsedAt: true,
              createdAt: true,
              revokedAt: true,
            },
          });
          return { row, partner };
        },
      );

      req.auditAction = "partner_key.created";
      req.auditResource = `partner_key:${row.id}`;
      req.auditMetadata = { partnerId };
      // Webhook fires the metadata only — never the plaintext key.
      await deliverPartnerWebhook(req.log, {
        type: "partner.key.created",
        partner: webhookPayload(partner),
        keyId: row.id,
        keyName: row.name,
      });
      reply.code(201);
      return { ...serializePartnerKey(row), key: plaintext };
    },
  );

  app.get(
    "/:id/keys",
    {
      schema: {
        tags: ["Partners"],
        operationId: "listPartnerKeys",
        summary: "List partner keys (operator only)",
        description:
          "Returns metadata for every partner-scoped key (active and revoked) issued to the given partner. Plaintext keys are never returned.",
        headers: masterReadHeaders,
        params: z.object({ id: z.string().uuid() }),
        response: { 200: PartnerKeyListResponse, ...errorResponses(400, 401, 403, 404, 429, 500) },
      },
      config: { allowedCallers: ["master", "user"], requireSuperAdmin: true },
    },
    async (req) => {
      const partnerId = req.params.id;
      const rows = await withTenant(app.prisma, { orgId: null, isMaster: true }, async (tx) => {
        const partner = await tx.partner.findUnique({
          where: { id: partnerId },
          select: { id: true },
        });
        if (!partner) throw Errors.notFound();
        return tx.apiKey.findMany({
          where: { partnerId, scope: "partner" },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            partnerId: true,
            name: true,
            prefix: true,
            lastUsedAt: true,
            createdAt: true,
            revokedAt: true,
          },
        });
      });
      req.auditAction = "partner_keys.list";
      req.auditMetadata = { partnerId };
      return { items: rows.map(serializePartnerKey) };
    },
  );

  app.delete(
    "/:id/keys/:keyId",
    {
      schema: {
        tags: ["Partners"],
        operationId: "revokePartnerKey",
        summary: "Revoke a partner key (operator only)",
        description:
          "Revokes a partner-scoped API key. Subsequent requests using the key fail with 401 within one transaction's worth of cache lag. The row is kept (with `revoked_at` set) for audit history.",
        headers: masterWriteHeaders,
        params: z.object({ id: z.string().uuid(), keyId: z.string().uuid() }),
        response: errorResponses(400, 401, 403, 404, 429, 500),
      },
      config: { allowedCallers: ["master", "user"], requireSuperAdmin: true },
    },
    async (req, reply) => {
      const { id: partnerId, keyId } = req.params;
      const result = await withTenant(
        app.prisma,
        { orgId: null, isMaster: true },
        async (tx) => {
          const partner = await tx.partner.findUnique({
            where: { id: partnerId },
            select: {
              id: true,
              name: true,
              status: true,
              contactEmail: true,
              createdAt: true,
            },
          });
          if (!partner) throw Errors.notFound();
          const key = await tx.apiKey.findFirst({
            where: { id: keyId, partnerId, scope: "partner" },
            select: { id: true, name: true, revokedAt: true },
          });
          if (!key) throw Errors.notFound();
          // Idempotent: revoking an already-revoked key is a no-op.
          const wasAlreadyRevoked = key.revokedAt !== null;
          if (!wasAlreadyRevoked) {
            await tx.apiKey.update({
              where: { id: keyId },
              data: { revokedAt: new Date() },
            });
          }
          return { partner, keyName: key.name, wasAlreadyRevoked };
        },
      );
      req.auditAction = "partner_key.revoked";
      req.auditResource = `partner_key:${keyId}`;
      req.auditMetadata = { partnerId };
      // Skip the webhook on no-op revocations so the operator's CRM
      // doesn't get duplicate events from idempotent retries.
      if (!result.wasAlreadyRevoked) {
        await deliverPartnerWebhook(req.log, {
          type: "partner.key.revoked",
          partner: webhookPayload(result.partner),
          keyId,
          keyName: result.keyName,
        });
      }
      reply.code(204).send();
    },
  );
};

export default partnerRoutes;
