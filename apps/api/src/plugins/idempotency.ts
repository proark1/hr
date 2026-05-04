import fp from "fastify-plugin";
import crypto from "node:crypto";
import { Errors } from "../errors.js";

const IDEMPOTENT_METHODS = new Set(["POST", "PATCH", "DELETE"]);
const TTL_HOURS = 24;

function hashRequest(method: string, path: string, body: unknown): string {
  const payload = JSON.stringify({ method, path, body: body ?? null });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Idempotency-Key support.
 *
 * On a write request with an Idempotency-Key header:
 *   - First time: we record the request hash and the response, return it normally.
 *   - Replay with same hash: we return the stored response (status + body).
 *   - Replay with different hash: 409 — the caller is reusing a key on a
 *     different request, which is a bug on their end.
 *
 * Keys live for 24h then a future cleanup job removes them.
 */
export default fp(async (app) => {
  app.addHook("preHandler", async (req, reply) => {
    if (!IDEMPOTENT_METHODS.has(req.method)) return;
    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || key.length === 0) return;
    if (key.length > 200) throw Errors.badRequest("Idempotency-Key too long");

    const hash = hashRequest(req.method, req.url, req.body);
    const existing = await app.prisma.idempotencyKey.findUnique({ where: { key } });
    if (!existing) return; // first time — let the handler run; we'll persist in onResponse

    if (existing.requestHash !== hash) {
      throw Errors.conflict(
        "Idempotency-Key reused with a different request body",
        { key },
      );
    }
    reply.code(existing.statusCode);
    reply.header("Idempotent-Replayed", "true");
    return reply.send(existing.responseBody);
  });

  app.addHook("onSend", async (req, reply, payload) => {
    if (!IDEMPOTENT_METHODS.has(req.method)) return payload;
    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || key.length === 0) return payload;
    if (reply.getHeader("Idempotent-Replayed")) return payload; // already a replay
    if (reply.statusCode >= 500) return payload; // don't cache server errors

    const hash = hashRequest(req.method, req.url, req.body);
    const body = typeof payload === "string" ? safeJson(payload) : payload;
    const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);

    try {
      await app.prisma.idempotencyKey.create({
        data: {
          key,
          orgId: req.tenantId ?? null,
          method: req.method,
          path: req.url,
          requestHash: hash,
          statusCode: reply.statusCode,
          responseBody: body as object,
          expiresAt,
        },
      });
    } catch {
      // Race — another request stored it first. Best-effort, don't fail.
    }
    return payload;
  });
});

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { raw: s };
  }
}
