import fp from "fastify-plugin";
import crypto from "node:crypto";
import type { FastifyRequest } from "fastify";
import { Prisma, withTenant } from "@myhr/db";
import { Errors } from "../errors.js";
import { reqPath } from "../lib/path.js";

const IDEMPOTENT_METHODS = new Set(["POST", "PATCH", "DELETE"]);
const TTL_HOURS = 24;
const SKIP_PATHS = new Set(["/healthz", "/"]);

/** Sentinel orgId for callers that have no tenant context (e.g. POST /v1/orgs
 *  by a master or fresh user, POST /v1/invitations/accept). Lets the
 *  (orgId, key) PK stay non-null without inventing a separate code path.
 *  Not a real orgs row — we dropped the FK on this table for that reason.
 *  Cross-caller replay leakage is prevented by namespacing the key string
 *  itself with a caller fingerprint when no tenant is present. */
const NO_TENANT_ORG_ID = "00000000-0000-0000-0000-000000000000";

/** Caller fingerprint used to namespace no-tenant idempotency keys. Two
 *  different users picking the same Idempotency-Key for POST /v1/orgs must
 *  not see each other's response replayed. */
function callerFingerprint(req: FastifyRequest): string {
  const c = req.caller;
  if (!c) return "anon";
  if (c.type === "master") return `master:${c.keyId ?? "env"}`;
  if (c.type === "tenant_key") return `tenant:${c.keyId}`;
  return `user:${c.userId}`;
}

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
 * (orgId, key) and replay it on duplicates with the same body. Different
 * body for the same (orgId, key) returns 409.
 *
 * Both the lookup and the insert run inside `withTenant` so the RLS GUCs are
 * set; otherwise the policy hides every tenant-scoped row and inserts are
 * rejected by WITH CHECK.
 *
 * Known limitation: two concurrent requests with the same key both pass the
 * existence check, both run handlers, and only the duplicate INSERT in
 * onSend is caught. This means double side-effects (e.g. two employees
 * created). Fix planned for a follow-up via an atomic claim
 * (`INSERT ... ON CONFLICT DO NOTHING RETURNING ...`) inside preHandler so
 * only the first concurrent request runs the handler; the rest wait on the
 * row and replay the cached response.
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

    const orgId = req.tenantId ?? NO_TENANT_ORG_ID;
    const storedKey = req.tenantId ? key : `${callerFingerprint(req)}:${key}`;
    // Master callers (and no-tenant writes from any caller) need RLS bypass
    // so the SENTINEL row is reachable. Tenant/user callers run scoped.
    const isMaster = req.caller?.type === "master" || !req.tenantId;
    const hash = hashRequest(req.method, path, req.body);

    const existing = await withTenant(
      app.prisma,
      { orgId: req.tenantId, isMaster },
      (tx) =>
        tx.idempotencyKey.findUnique({
          where: { orgId_key: { orgId, key: storedKey } },
        }),
    );
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

    const orgId = req.tenantId ?? NO_TENANT_ORG_ID;
    const storedKey = req.tenantId ? key : `${callerFingerprint(req)}:${key}`;
    const isMaster = req.caller?.type === "master" || !req.tenantId;
    const hash = hashRequest(req.method, path, req.body);
    const body = typeof payload === "string" ? safeJson(payload) : payload;
    const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);

    try {
      await withTenant(
        app.prisma,
        { orgId: req.tenantId, isMaster },
        (tx) =>
          tx.idempotencyKey.create({
            data: {
              key: storedKey,
              orgId,
              method: req.method,
              path,
              requestHash: hash,
              statusCode: reply.statusCode,
              responseBody: body as object,
              expiresAt,
            },
          }),
      );
    } catch (err) {
      // Duplicate-key race: another request stored it first. Anything else
      // we want to know about — log and move on rather than 500ing the
      // user's already-completed write.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return payload;
      }
      req.log.error({ err }, "idempotency: failed to persist replay row");
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
