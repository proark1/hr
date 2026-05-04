/**
 * Webhook plugin: decorates the Fastify app with `webhookBoss` (the running
 * pg-boss instance) and a typed `emitWebhook` helper that route handlers
 * call after a successful mutation. The plugin owns the worker lifecycle so
 * `index.ts` doesn't have to.
 *
 * If `WEBHOOKS_DISABLED=1`, the worker is not started and `emitWebhook` is a
 * no-op. The CRUD routes still work — useful in tests where you want to
 * register endpoints but not actually deliver.
 */
import fp from "fastify-plugin";
import { env } from "../env.js";
import {
  emitWebhookEvent,
  type EmitArgs,
} from "../lib/webhook/publish.js";
import {
  startWebhookWorker,
  stopWebhookWorker,
  type WebhookBoss,
} from "../lib/webhook/worker.js";

declare module "fastify" {
  interface FastifyInstance {
    webhookBoss: WebhookBoss | null;
    emitWebhook: (args: EmitArgs) => Promise<void>;
  }
}

export default fp(async (app) => {
  let boss: WebhookBoss | null = null;

  if (!env.WEBHOOKS_DISABLED) {
    try {
      boss = await startWebhookWorker({
        prisma: app.prisma,
        log: app.log,
        databaseUrl: env.DATABASE_URL,
      });
    } catch (err) {
      app.log.error({ err }, "webhook worker failed to start; deliveries will queue but not send");
      boss = null;
    }
  }

  app.decorate("webhookBoss", boss);
  app.decorate("emitWebhook", async (args: EmitArgs) => {
    await emitWebhookEvent(app.prisma, app.webhookBoss, app.log, args);
  });

  app.addHook("onClose", async () => {
    await stopWebhookWorker(app.webhookBoss);
  });
});
