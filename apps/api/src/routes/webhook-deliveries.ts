import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  WebhookDelivery,
  WebhookDeliveryListQuery,
  WebhookEventType,
} from "@myhr/types";
import { withTenant } from "@myhr/db";
import { Errors } from "../errors.js";
import { errorResponses, orgReadHeaders, orgWriteHeaders } from "../lib/openapi.js";
import { WEBHOOK_QUEUE } from "../lib/webhook/worker.js";

const ListResponse = z.object({
  items: z.array(WebhookDelivery),
  nextCursor: z.string().nullable(),
});

const webhookDeliveryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "",
    {
      schema: {
        tags: ["Webhooks"],
        operationId: "listWebhookDeliveries",
        summary: "List webhook deliveries",
        description:
          "Returns the recent deliveries for this org, newest first. Useful for diagnostics — every attempt is recorded with the response code, body (truncated to 4 KiB), and any error.",
        headers: orgReadHeaders,
        querystring: WebhookDeliveryListQuery,
        response: { 200: ListResponse, ...errorResponses(400, 401, 403, 429, 500) },
      },
      config: {
        requireTenant: true,
        requireMembership: { roles: ["owner", "admin"] },
      },
    },
    async (req) => {
      const { cursor, limit, endpointId, eventType, status } = req.query;
      const items = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        (tx) =>
          tx.webhookDelivery.findMany({
            where: {
              orgId: req.tenantId!,
              ...(endpointId ? { endpointId } : {}),
              ...(eventType ? { eventType } : {}),
              ...(status ? { status } : {}),
            },
            take: limit + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            orderBy: { createdAt: "desc" },
          }),
      );
      const hasMore = items.length > limit;
      const page = hasMore ? items.slice(0, -1) : items;
      req.auditAction = "webhook_deliveries.list";
      return {
        items: page.map(serialize),
        nextCursor: hasMore ? page[page.length - 1]!.id : null,
      };
    },
  );

  app.get(
    "/:id",
    {
      schema: {
        tags: ["Webhooks"],
        operationId: "getWebhookDelivery",
        summary: "Get a webhook delivery",
        headers: orgReadHeaders,
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: WebhookDelivery,
          ...errorResponses(400, 401, 403, 404, 429, 500),
        },
      },
      config: {
        requireTenant: true,
        requireMembership: { roles: ["owner", "admin"] },
      },
    },
    async (req) => {
      const row = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        (tx) =>
          tx.webhookDelivery.findFirst({
            where: { id: req.params.id, orgId: req.tenantId! },
          }),
      );
      if (!row) throw Errors.notFound();
      req.auditAction = "webhook_delivery.read";
      req.auditResource = `webhook_delivery:${row.id}`;
      return serialize(row);
    },
  );

  app.post(
    "/:id/redeliver",
    {
      schema: {
        tags: ["Webhooks"],
        operationId: "redeliverWebhookDelivery",
        summary: "Re-enqueue a delivery",
        description:
          "Resets the delivery's attempt counter to zero and enqueues a fresh job. The same `eventId` is used so consumers can deduplicate. Already-delivered rows are not redelivered (returns 409).",
        headers: orgWriteHeaders,
        params: z.object({ id: z.string().uuid() }),
        response: {
          202: WebhookDelivery,
          ...errorResponses(400, 401, 403, 404, 409, 429, 500),
        },
      },
      config: {
        requireTenant: true,
        requireMembership: { roles: ["owner", "admin"] },
      },
    },
    async (req, reply) => {
      const row = await withTenant(
        app.prisma,
        { orgId: req.tenantId!, isMaster: false },
        async (tx) => {
          const existing = await tx.webhookDelivery.findFirst({
            where: { id: req.params.id, orgId: req.tenantId! },
          });
          if (!existing) throw Errors.notFound();
          if (existing.status === "delivered") {
            throw Errors.conflict("Delivery already succeeded");
          }
          return tx.webhookDelivery.update({
            where: { id: existing.id },
            data: {
              status: "pending",
              attempts: 0,
              lastError: null,
              nextAttemptAt: null,
            },
          });
        },
      );
      if (app.webhookBoss) {
        await app.webhookBoss.send(WEBHOOK_QUEUE, { deliveryId: row.id });
      } else {
        app.log.warn(
          { deliveryId: row.id },
          "redeliver: worker not running; row left pending",
        );
      }
      req.auditAction = "webhook_delivery.redelivered";
      req.auditResource = `webhook_delivery:${row.id}`;
      reply.code(202);
      return serialize(row);
    },
  );
};

export default webhookDeliveryRoutes;

type DeliveryRow = {
  id: string;
  orgId: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  status:
    | "pending"
    | "in_progress"
    | "delivered"
    | "failed_retrying"
    | "failed_permanent";
  attempts: number;
  maxAttempts: number;
  lastResponseCode: number | null;
  lastResponseBody: string | null;
  lastError: string | null;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
};

function serialize(r: DeliveryRow) {
  return {
    id: r.id,
    orgId: r.orgId,
    endpointId: r.endpointId,
    eventId: r.eventId,
    eventType: r.eventType as z.infer<typeof WebhookEventType>,
    status: r.status,
    attempts: r.attempts,
    maxAttempts: r.maxAttempts,
    lastResponseCode: r.lastResponseCode,
    lastResponseBody: r.lastResponseBody,
    lastError: r.lastError,
    lastAttemptAt: r.lastAttemptAt ? r.lastAttemptAt.toISOString() : null,
    nextAttemptAt: r.nextAttemptAt ? r.nextAttemptAt.toISOString() : null,
    deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}
