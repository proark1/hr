/**
 * pg-boss worker that delivers webhook events.
 *
 * The publisher writes a `webhook_deliveries` row (status=`pending`) and
 * sends a job carrying the delivery id. The worker:
 *
 *   1. Loads the row + endpoint.
 *   2. POSTs the payload with HMAC-SHA256 signature in `Webhook-Signature`.
 *   3. On 2xx → status=`delivered`, deliveredAt=now.
 *   4. On non-2xx / network error → record the failure and *throw*. pg-boss
 *      handles retry scheduling (exponential backoff up to ~24h). When
 *      pg-boss exhausts retries it calls `onComplete` with `success=false`,
 *      and we mark the row `failed_permanent`.
 *
 * We intentionally store the durable history in our row, not in pg-boss —
 * pg-boss is the scheduler, not the source of truth. This means:
 *   - Operators can query `webhook_deliveries` directly for an audit.
 *   - A redeliver call can re-enqueue a job for any row regardless of pg-boss state.
 */
import PgBoss from "pg-boss";
import type { PrismaClient } from "@myhr/db";
import type { FastifyBaseLogger } from "fastify";
import { sign, WEBHOOK_SIGNATURE_HEADER } from "./sign.js";

export const WEBHOOK_QUEUE = "webhook.deliver";

const RESPONSE_BODY_LIMIT = 4 * 1024;
const HTTP_TIMEOUT_MS = 10_000;

export type WebhookBoss = PgBoss;
export type WebhookJobData = { deliveryId: string };

type StartArgs = {
  prisma: PrismaClient;
  log: FastifyBaseLogger;
  databaseUrl: string;
  /** Total attempts including the first. Default 8 → ~17h with backoff. */
  maxAttempts?: number;
};

export async function startWebhookWorker(args: StartArgs): Promise<WebhookBoss> {
  const { prisma, log, databaseUrl, maxAttempts = 8 } = args;
  const boss = new PgBoss(databaseUrl);

  boss.on("error", (err) => log.error({ err }, "pg-boss error"));
  await boss.start();

  // Idempotent queue creation. Retry config lives here so every send inherits
  // it: `retryLimit` is *additional* attempts after the first, so we pass
  // maxAttempts - 1. retryBackoff: true → 1s, 2s, 4s, 8s, ... up to ~17h.
  await boss.createQueue(WEBHOOK_QUEUE, {
    name: WEBHOOK_QUEUE,
    retryLimit: Math.max(0, maxAttempts - 1),
    retryDelay: 1,
    retryBackoff: true,
    retentionDays: 14,
  });

  await boss.work<WebhookJobData>(
    WEBHOOK_QUEUE,
    { batchSize: 4, pollingIntervalSeconds: 2 },
    async (jobs) => {
      for (const job of jobs) {
        await deliver({ prisma, log, deliveryId: job.data.deliveryId, maxAttempts });
      }
    },
  );

  log.info({ queue: WEBHOOK_QUEUE }, "webhook worker started");
  return boss;
}

export async function stopWebhookWorker(boss: WebhookBoss | null): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true, timeout: 10_000 });
}

async function deliver(args: {
  prisma: PrismaClient;
  log: FastifyBaseLogger;
  deliveryId: string;
  maxAttempts: number;
}): Promise<void> {
  const { prisma, log, deliveryId, maxAttempts } = args;

  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });
  if (!delivery) {
    log.warn({ deliveryId }, "webhook: delivery row missing, dropping job");
    return;
  }
  if (delivery.status === "delivered") return; // already done; idempotency
  if (!delivery.endpoint || delivery.endpoint.disabledAt) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "failed_permanent",
        lastError: "endpoint disabled or removed",
        lastAttemptAt: new Date(),
      },
    });
    return;
  }

  const rawBody = JSON.stringify(delivery.payload);
  const signature = sign(rawBody, delivery.endpoint.secret);

  const attempt = delivery.attempts + 1;
  const isFinalAttempt = attempt >= maxAttempts;

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: "in_progress",
      attempts: attempt,
      lastAttemptAt: new Date(),
    },
  });

  let responseCode: number | null = null;
  let responseBody: string | null = null;
  let errorMsg: string | null = null;

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), HTTP_TIMEOUT_MS);
    const res = await fetch(delivery.endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [WEBHOOK_SIGNATURE_HEADER]: signature,
        "Webhook-Id": delivery.eventId,
        "Webhook-Event": delivery.eventType,
      },
      body: rawBody,
      signal: ac.signal,
    }).finally(() => clearTimeout(t));

    responseCode = res.status;
    const text = await res.text().catch(() => "");
    responseBody = text.slice(0, RESPONSE_BODY_LIMIT);

    if (res.ok) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "delivered",
          deliveredAt: new Date(),
          lastResponseCode: responseCode,
          lastResponseBody: responseBody,
          lastError: null,
        },
      });
      log.info(
        { deliveryId, endpointId: delivery.endpointId, attempt, code: responseCode },
        "webhook delivered",
      );
      return;
    }

    errorMsg = `non-2xx response: ${responseCode}`;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  // Failure path. Record state, then throw to let pg-boss schedule a retry.
  // If we've already burned the budget, mark permanent and *don't* throw —
  // pg-boss would just try again.
  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: isFinalAttempt ? "failed_permanent" : "failed_retrying",
      lastResponseCode: responseCode,
      lastResponseBody: responseBody,
      lastError: errorMsg,
    },
  });
  log.warn(
    {
      deliveryId,
      endpointId: delivery.endpointId,
      attempt,
      isFinalAttempt,
      code: responseCode,
      error: errorMsg,
    },
    "webhook delivery failed",
  );

  if (!isFinalAttempt) {
    throw new Error(errorMsg ?? "webhook delivery failed");
  }
}
