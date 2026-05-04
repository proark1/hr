import fp from "fastify-plugin";
import crypto from "node:crypto";
import { Errors } from "../errors.js";
import { reqPath } from "../lib/path.js";

const IDEMPOTENT_METHODS = new Set(["POST", "PATCH", "DELETE"]);
const TTL_HOURS = 24;
const SKIP_PATHS = new Set(["/healthz", "/"]);

/** Deterministic JSON.stringify with sorted object keys, so request hashes
 *  are stable across clients that emit keys in different orders. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") +
    "}"
  );
}

function hashRequest(method: string, path: string, body: unknown): string {
  const payload = stableStringify({ method, path, body: body ?? null });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Idempotency-Key support.
 *
 * Required on all writes (POST / PATCH / DELETE) — clients MUST pass a unique
 * key per logical request so retries are safe. We store the response keyed by
 * (key) and replay it on duplicates with the same body. Different body for
 * the same key returns 409.
 */
export default fp(async (app) => {
  app.addHook("preHandler", async (req, reply) => {
    if (!IDEMPOTENT_METHODS.has(req.method)) return;
    const path = reqPath(req.url);
    if (SKIP_PATHS.has(path)) return;

    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || key.length === 0) {
      throw Errors.badRequest("Idempotency-Key header is required for write operations");
    }
    if (key.length > 200) throw Errors.badRequest("Idempotency-Key too long");

    const hash = hashRequest(req.method, path, req.body);
    const existing = await app.prisma.idempotencyKey.findUnique({ where: { key } });
    if (!existing) return; // first time — let the handler run; we'll persist in onSend

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
    const path = reqPath(req.url);
    if (SKIP_PATHS.has(path)) return payload;
    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || key.length === 0) return payload;
    if (reply.getHeader("Idempotent-Replayed")) return payload; // already a replay
    if (reply.statusCode >= 500) return payload; // don't cache server errors
    if (reply.statusCode >= 400) return payload; // don't cache client errors either

    const hash = hashRequest(req.method, path, req.body);
    const body = typeof payload === "string" ? safeJson(payload) : payload;
    const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);

    try {
      await app.prisma.idempotencyKey.create({
        data: {
          key,
          orgId: req.tenantId ?? null,
          method: req.method,
          path,
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
