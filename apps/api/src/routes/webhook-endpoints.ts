import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  WebhookEndpoint,
  WebhookEndpointCreate,
  WebhookEndpointUpdate,
  WebhookEndpointWithSecret,
} from "@myhr/types";
import { withTenant } from "@myhr/db";
import { Errors } from "../errors.js";
import { errorResponses, orgReadHeaders, orgWriteHeaders } from "../lib/openapi.js";
import { generateWebhookSecret } from "../lib/webhook/secret.js";

const ListResponse = z.object({ items: z.array(WebhookEndpoint) });

const webhookEndpointRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "",
    {
      schema: {
        tags: ["Webhooks"],
        operationId: "createWebhookEndpoint",
        summary: "Register a webhook endpoint",
        description:
          "Register a URL to receive event deliveries. The signing secret is returned once at creation; store it immediately — every delivery is signed with it via HMAC-SHA256 in the `Webhook-Signature` header. Subsequent reads return the endpoint metadata only.",
        headers: orgWriteHeaders,
        body: WebhookEndpointCreate,
        response: {
          201: WebhookEndpointWithSecret,
          ...errorResponses(400, 401, 403, 409, 429, 500),
        },
      },
      config: {
        requireTenant: true,
        requireMembership: { roles: ["owner", "admin"] },
      },
    },
    async (req, reply) => {
      const secret = generateWebhookSecret();
      const row = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        (tx) =>
          tx.webhookEndpoint.create({
            data: {
              orgId: req.tenantId!,
              url: req.body.url,
              events: req.body.events,
              secret,
            },
          }),
      );
      req.auditAction = "webhook_endpoint.created";
      req.auditResource = `webhook_endpoint:${row.id}`;
      reply.code(201);
      return serializeWithSecret(row, secret);
    },
  );

  app.get(
    "",
    {
      schema: {
        tags: ["Webhooks"],
        operationId: "listWebhookEndpoints",
        summary: "List webhook endpoints for this org",
        headers: orgReadHeaders,
        response: { 200: ListResponse, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: {
        requireTenant: true,
        requireMembership: { roles: ["owner", "admin", "manager", "member"] },
      },
    },
    async (req) => {
      const rows = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        (tx) =>
          tx.webhookEndpoint.findMany({
            where: { orgId: req.tenantId! },
            orderBy: { createdAt: "desc" },
          }),
      );
      req.auditAction = "webhook_endpoints.list";
      return { items: rows.map((r) => serialize(r)) };
    },
  );

  app.get(
    "/:id",
    {
      schema: {
        tags: ["Webhooks"],
        operationId: "getWebhookEndpoint",
        summary: "Get a webhook endpoint",
        headers: orgReadHeaders,
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: WebhookEndpoint,
          ...errorResponses(400, 401, 403, 404, 429, 500),
        },
      },
      config: {
        requireTenant: true,
        requireMembership: { roles: ["owner", "admin", "manager", "member"] },
      },
    },
    async (req) => {
      const row = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        (tx) =>
          tx.webhookEndpoint.findFirst({
            where: { id: req.params.id, orgId: req.tenantId! },
          }),
      );
      if (!row) throw Errors.notFound();
      req.auditAction = "webhook_endpoint.read";
      req.auditResource = `webhook_endpoint:${row.id}`;
      return serialize(row);
    },
  );

  app.patch(
    "/:id",
    {
      schema: {
        tags: ["Webhooks"],
        operationId: "updateWebhookEndpoint",
        summary: "Update a webhook endpoint",
        description:
          "Update the URL, subscribed events, or active state. The signing secret is not changed — see `rotateWebhookEndpointSecret` to rotate.",
        headers: orgWriteHeaders,
        params: z.object({ id: z.string().uuid() }),
        body: WebhookEndpointUpdate,
        response: {
          200: WebhookEndpoint,
          ...errorResponses(400, 401, 403, 404, 429, 500),
        },
      },
      config: {
        requireTenant: true,
        requireMembership: { roles: ["owner", "admin"] },
      },
    },
    async (req) => {
      const data: Record<string, unknown> = {};
      if (req.body.url !== undefined) data.url = req.body.url;
      if (req.body.events !== undefined) data.events = req.body.events;
      if (req.body.isActive !== undefined) {
        data.disabledAt = req.body.isActive ? null : new Date();
      }
      const row = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        async (tx) => {
          const existing = await tx.webhookEndpoint.findFirst({
            where: { id: req.params.id, orgId: req.tenantId! },
          });
          if (!existing) throw Errors.notFound();
          return tx.webhookEndpoint.update({ where: { id: existing.id }, data });
        },
      );
      req.auditAction = "webhook_endpoint.updated";
      req.auditResource = `webhook_endpoint:${row.id}`;
      return serialize(row);
    },
  );

  app.post(
    "/:id/rotate-secret",
    {
      schema: {
        tags: ["Webhooks"],
        operationId: "rotateWebhookEndpointSecret",
        summary: "Rotate the signing secret for an endpoint",
        description:
          "Mints a fresh signing secret and returns it once. The previous secret stops working immediately — coordinate the cutover with the receiver before calling.",
        headers: orgWriteHeaders,
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: WebhookEndpointWithSecret,
          ...errorResponses(400, 401, 403, 404, 429, 500),
        },
      },
      config: {
        requireTenant: true,
        requireMembership: { roles: ["owner", "admin"] },
      },
    },
    async (req) => {
      const secret = generateWebhookSecret();
      const row = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        async (tx) => {
          const existing = await tx.webhookEndpoint.findFirst({
            where: { id: req.params.id, orgId: req.tenantId! },
          });
          if (!existing) throw Errors.notFound();
          return tx.webhookEndpoint.update({
            where: { id: existing.id },
            data: { secret },
          });
        },
      );
      req.auditAction = "webhook_endpoint.secret_rotated";
      req.auditResource = `webhook_endpoint:${row.id}`;
      return serializeWithSecret(row, secret);
    },
  );

  app.delete(
    "/:id",
    {
      schema: {
        tags: ["Webhooks"],
        operationId: "deleteWebhookEndpoint",
        summary: "Delete a webhook endpoint",
        description:
          "Removes the endpoint and cascades pending deliveries. Returns 204 with no body. Existing `WebhookDelivery` rows remain for audit.",
        headers: orgWriteHeaders,
        params: z.object({ id: z.string().uuid() }),
        response: errorResponses(400, 401, 403, 404, 429, 500),
      },
      config: {
        requireTenant: true,
        requireMembership: { roles: ["owner", "admin"] },
      },
    },
    async (req, reply) => {
      await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        async (tx) => {
          const existing = await tx.webhookEndpoint.findFirst({
            where: { id: req.params.id, orgId: req.tenantId! },
          });
          if (!existing) throw Errors.notFound();
          await tx.webhookEndpoint.delete({ where: { id: existing.id } });
        },
      );
      req.auditAction = "webhook_endpoint.deleted";
      req.auditResource = `webhook_endpoint:${req.params.id}`;
      reply.code(204).send();
    },
  );
};

export default webhookEndpointRoutes;

type WebhookEndpointRow = {
  id: string;
  orgId: string | null;
  url: string;
  events: string[];
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type Events = Array<
  "employee.created" | "employee.updated" | "employee.deleted" | "document.expiring"
>;

function serialize(r: WebhookEndpointRow) {
  return {
    id: r.id,
    orgId: r.orgId!,
    url: r.url,
    events: r.events as Events,
    isActive: r.disabledAt === null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializeWithSecret(r: WebhookEndpointRow, secret: string) {
  return { ...serialize(r), secret };
}
