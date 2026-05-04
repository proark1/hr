import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import crypto from "node:crypto";
import { z } from "zod";
import { ApiKey, ApiKeyCreate, ApiKeyCreated } from "@myhr/types";
import { withTenant } from "@myhr/db";
import { errorResponses, orgReadHeaders, orgWriteHeaders } from "../lib/openapi.js";

const ListResponse = z.object({ items: z.array(ApiKey) });

const PREFIX_LEN = 12;

function generateKey(): { plaintext: string; prefix: string; hash: string } {
  // 32 bytes → 64 hex chars; with the "mh_live_" tag the full token is 72.
  // The first 12 chars are "mh_live_xxxx" (4 random nibbles), used as the
  // lookup prefix in api_keys.
  const random = crypto.randomBytes(32).toString("hex");
  const plaintext = `mh_live_${random}`;
  const prefix = plaintext.slice(0, PREFIX_LEN);
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, prefix, hash };
}

const apiKeyRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "",
    {
      schema: {
        tags: ["ApiKeys"],
        operationId: "createApiKey",
        summary: "Mint a tenant-scoped API key",
        description:
          "Creates a new tenant-scoped API key. The plaintext value is returned once and never again — store it immediately.",
        headers: orgWriteHeaders,
        body: ApiKeyCreate,
        response: { 201: ApiKeyCreated, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: {
        requireTenant: true,
        requireMembership: { roles: ["owner", "admin"] },
      },
    },
    async (req, reply) => {
      const { plaintext, prefix, hash } = generateKey();

      // api_keys is master-only under RLS; we've already authorised the
      // caller via requireMembership, so we can elevate for the write.
      const row = await withTenant(app.prisma, { orgId: null, isMaster: true }, (tx) =>
        tx.apiKey.create({
          data: {
            scope: "tenant",
            orgId: req.tenantId!,
            name: req.body.name,
            prefix,
            hash,
          },
          select: {
            id: true,
            name: true,
            prefix: true,
            scope: true,
            lastUsedAt: true,
            createdAt: true,
          },
        }),
      );

      req.auditAction = "api_key.created";
      req.auditResource = `api_key:${row.id}`;
      reply.code(201);
      return {
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        scope: row.scope,
        lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        key: plaintext,
      };
    },
  );

  app.get(
    "",
    {
      schema: {
        tags: ["ApiKeys"],
        operationId: "listApiKeys",
        summary: "List API keys for this org",
        description: "Returns metadata for every tenant-scoped key minted for this org. Plaintext keys are never returned.",
        headers: orgReadHeaders,
        response: { 200: ListResponse, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: {
        requireTenant: true,
        requireMembership: { roles: ["owner", "admin"] },
      },
    },
    async (req) => {
      const rows = await withTenant(app.prisma, { orgId: null, isMaster: true }, (tx) =>
        tx.apiKey.findMany({
          where: { orgId: req.tenantId!, scope: "tenant", revokedAt: null },
          select: {
            id: true,
            name: true,
            prefix: true,
            scope: true,
            lastUsedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
      );
      req.auditAction = "api_keys.list";
      return {
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          prefix: r.prefix,
          scope: r.scope,
          lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  );
};

export default apiKeyRoutes;
