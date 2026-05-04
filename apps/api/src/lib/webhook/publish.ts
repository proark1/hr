/**
 * Publish a webhook event for an org. Each subscribed, active endpoint gets
 * its own `WebhookDelivery` row; pg-boss drives the actual HTTP send via the
 * `webhook.deliver` queue (see `worker.ts`).
 *
 * Failures during enqueue are logged but never bubble up — a failing webhook
 * subsystem must not block API writes. The delivery row is the durable
 * record; if pg-boss is down, a recovery sweep can re-enqueue pending rows.
 */
import type { PrismaClient } from "@myhr/db";
import type { WebhookEventType } from "@myhr/types";
import type { FastifyBaseLogger } from "fastify";
import type { WebhookBoss } from "./worker.js";
import { WEBHOOK_QUEUE } from "./worker.js";

export type EmitArgs = {
  orgId: string;
  eventType: WebhookEventType;
  data: unknown;
};

export async function emitWebhookEvent(
  prisma: PrismaClient,
  boss: WebhookBoss | null,
  log: FastifyBaseLogger,
  args: EmitArgs,
): Promise<void> {
  // Fan out to every active endpoint subscribed to this event. We use the
  // master Prisma client (no RLS) on purpose — the publisher is a system
  // component and crosses the tenant scope to look up endpoints by orgId.
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      orgId: args.orgId,
      disabledAt: null,
      events: { has: args.eventType },
    },
    select: { id: true },
  });
  if (endpoints.length === 0) return;

  const eventId = crypto.randomUUID();
  const envelope = {
    id: eventId,
    type: args.eventType,
    createdAt: new Date().toISOString(),
    orgId: args.orgId,
    data: args.data,
  };

  for (const ep of endpoints) {
    let delivery;
    try {
      delivery = await prisma.webhookDelivery.create({
        data: {
          orgId: args.orgId,
          endpointId: ep.id,
          eventId,
          eventType: args.eventType,
          payload: envelope as object,
          status: "pending",
        },
        select: { id: true },
      });
    } catch (err) {
      log.error({ err, endpointId: ep.id }, "webhook: failed to record delivery row");
      continue;
    }

    if (!boss) {
      // Worker disabled (e.g. tests). Row stays in `pending`; a future sweep
      // or a redeliver call can pick it up.
      continue;
    }
    try {
      await boss.send(WEBHOOK_QUEUE, { deliveryId: delivery.id });
    } catch (err) {
      log.error(
        { err, deliveryId: delivery.id },
        "webhook: failed to enqueue delivery, row left pending",
      );
    }
  }
}
